# Fase 2 – Prometheus-helse på driftsstatus-skjermen

**Dato:** 2026-07-24
**Status:** Godkjent design (klar for planlegging)
**Bygger på:** fase 1 (`2026-07-24-infoskjerm-redesign-design.md`)

## Mål

Berik tjeneste-kortene med **live helse** fra Managed Prometheus (GMP), i tillegg
til deploy-statusen fra fase 1:

- **Helsesjekk** (up/down) per tjeneste.
- **Responstid**: p95 over siste 15 min.
- **Feilkode-andel** over siste 15 min: **5xx og 4xx vist hver for seg**.

## Tjenester og kilder

| Tjeneste | GCP-prosjekt | Namespace |
|----------|--------------|-----------|
| products-api | `ent-products-prd` | `products` |
| products-spring | `ent-products-prd` | `products` |
| distribution-channels-api | `ent-distchapi-prd` | `distribution-channels-api` |

Alle kjører på Kubernetes i `entur`-clusteret med GMP.

## Utvidet datakontrakt (`health`)

`status.json` sitt `health`-felt (tomt/`unknown` i fase 1) fylles nå:

```json
"health": {
  "state": "up",
  "up": true,
  "p95Ms": 142,
  "errorRate5xx": 0.002,
  "errorRate4xx": 0.011
}
```

- `state`: `up | degraded | down | unknown`
- `up`: bool — minst ett scrape-target svarer
- `p95Ms`: p95 responstid siste 15 min, i millisekunder (null hvis utilgjengelig)
- `errorRate5xx` / `errorRate4xx`: andel (0–1) av total trafikk siste 15 min
- **Null trafikk (0/0):** `errorRate* = null`; `state` avgjøres da av `up` alene.
- **Metrikker utilgjengelige** (token mangler / query feiler): hele `health`
  degraderer til `{state:"unknown", up:null, p95Ms:null, errorRate5xx:null, errorRate4xx:null}`.

## Helse-state (konfigurerbare terskler)

Standardterskler (godkjent):

- **down (rød):** `up == false`, ELLER `errorRate5xx > 0.05`
- **degraded (gul):** `errorRate5xx > 0.01` og `≤ 0.05`
- **up (grønn):** ellers, når data finnes
- **unknown (grå):** ingen metrikk-data

Tersklene defineres som navngitte konstanter (`WARN_5XX = 0.01`, `CRIT_5XX = 0.05`)
slik at de er lette å justere.

## Kombinert kort-farge

Kort-fargen blir **den verste** av deploy-state (fase 1) og health-state (fase 2):

| deploy \ health | up | degraded | down | unknown |
|-----------------|-----|----------|------|---------|
| success | grønn | gul | rød | grønn |
| in_progress | gul | gul | rød | gul |
| failure | rød | rød | rød | rød |
| unknown | grønn | gul | rød | grå |

Implementeres som en ren funksjon `combineSeverity(deployState, healthState)` som
returnerer en fargenøkkel (`success | warning | negative | neutral`).

## PromQL (parameterisert)

Metrikknavn og labels er **konfigurerbare per tjeneste**, med Spring/Micrometer-
standard som default. De reelle navnene bekreftes før implementering (se
Forutsetninger). Alle spørringer er instant-queries med 15m-vindu inne i `rate()`:

- **p95 (ms):**
  `histogram_quantile(0.95, sum by (le) (rate(<bucket>{<sel>}[15m]))) * 1000`
- **5xx-rate:** `sum(rate(<count>{<sel>,status=~"5.."}[15m]))`
- **4xx-rate:** `sum(rate(<count>{<sel>,status=~"4.."}[15m]))`
- **total-rate:** `sum(rate(<count>{<sel>}[15m]))`
- **up:** `sum(up{<sel>})` (> 0 ⇒ `up = true`)

Collectoren regner `errorRate5xx = 5xx/total`, `errorRate4xx = 4xx/total`
(null når total == 0).

Default-navn: `<count> = http_server_requests_seconds_count`,
`<bucket> = http_server_requests_seconds_bucket`. `<sel>` inneholder minst
`namespace="<ns>"` pluss ev. app/service-label bekreftet i Grafana.

## Collector

- **Nytt modul `scripts/status/metrics.js`** (rene, testbare funksjoner):
  - `buildQueries(service)` → de fem PromQL-strengene.
  - `parseInstantVector(json)` → tallverdi (eller null) fra et Prometheus
    `/api/v1/query`-svar.
  - `computeHealth({up, p95Ms, fivexx, fourxx, total}, thresholds)` → `health`-objektet.
- **`fetchMetrics(service, queryFn)`**: kjører de fem queriene via injisert
  `queryFn(project, promql)`; returnerer `health`. Feil i én query → det feltet blir
  null; total feil → `state: "unknown"`.
- **HTTP:** `queryFn` slår mot
  `https://monitoring.googleapis.com/v1/projects/<project>/location/global/prometheus/api/v1/query`
  med `Authorization: Bearer <GCP_TOKEN>` (token fra env).
- **Degradering:** mangler `GCP_TOKEN` → alle tjenester får `health.state = "unknown"`
  (som fase 1), collectoren kjører videre.
- **Tjeneste-config** (`services.js`) utvides med `metricsProject`, `metricsSelector`
  (label-map), og valgfrie metrikk-navn-overrides.

## Workflow-endring

Rekkefølgen i **både** `status-collector.yml` og `deploy.yml` blir:

```
install → GCP-auth (entur/gha-meta) → hent token → collect → build → deploy
```

- Ny steg-detalj: etter GCP-auth, `GCP_TOKEN=$(gcloud auth print-access-token)`
  eksporteres og gis til collect-steget sammen med `STATUS_GH_TOKEN`.
- Firebase-deploy skjer fortsatt etter build og bruker samme auth.

## Frontend

- **`ServiceCard`**: bruk `combineSeverity(deploy.state, health.state)` for prikk-fargen,
  og vis en metrikk-linje når `health.state != "unknown"`:
  `p95 142 ms · 5xx 0,2 % · 4xx 1,1 %`. Skjul linja ved `unknown`.
- **`statusFormat`**: nye rene funksjoner `healthColorKey(state)`,
  `combineSeverity(deployState, healthState)`, og formatterere `formatMs(n)` /
  `formatPct(frac)` (norsk desimalkomma, null → «–»).

## Fasing / avgrensning

- Kun de tre tjenestene fra fase 1. Config-drevet for utvidelse.
- Ingen historikk/grafer — kun øyeblikksverdier over 15 min (glanceable skjerm).

## Forutsetninger (må på plass før/under implementering)

1. **IAM:** CI-tjenestekontoen i `ent-statusber-prd` (`vars.SERVICE_ACCOUNT`) må få
   `roles/monitoring.viewer` på `ent-products-prd` og `ent-distchapi-prd`
   (kryssprosjekt — krever prosjekt-admin på de to).
2. **Metrikknavn:** bekreft i Grafana de faktiske navnene for HTTP-request-count
   (med `status`-label) og latency-histogrammet (`..._bucket` med `le`), samt hvilke
   labels som identifiserer hver tjeneste. Fyll disse inn i `services.js` før
   PromQL-taskene skrives ferdig. (Egne prober på `http_server_requests_seconds*`
   ga tomt, så standardnavnene er ikke verifisert.)

## Testing

- **Collector:** enhetstester på `buildQueries` (riktig PromQL per service),
  `parseInstantVector` (tall, tomt, manglende felt), `computeHealth`
  (up/degraded/down/unknown, null-trafikk, terskelgrenser), og `fetchMetrics`
  med injisert `queryFn` (per-query-feil → null; total feil → unknown).
- **Frontend:** `statusFormat`-tester (`healthColorKey`, `combineSeverity`-matrise,
  `formatMs`/`formatPct` inkl. null). `ServiceCard`-tester: metrikk-linje vises ved
  data, skjules ved `unknown`, og kombinert farge stemmer.

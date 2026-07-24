# Redesign av driftsstatus-infoskjerm

**Dato:** 2026-07-24
**Status:** Godkjent design (fase 1 klar for planlegging)

## Bakgrunn og mål

`driftsstatus-bergen` er en fullskjerms kontorskjerm for team-produkt i Bergen.
I dag domineres den av RSS-feeden fra `status.entur.org` (pågående hendelser +
planlagt vedlikehold), som fyller nesten hele skjermen selv om innholdet er
Entur-bredt og sjelden direkte relevant for teamets egne tjenester.

Målet med redesignet:

1. **Gjøre skjermen relevant for team-produkt** ved å vise live status for
   teamets egne tjenester (deploy-status og helse).
2. **Demote RSS-feeden** fra hovedinnhold til en tynn, rullende ticker nederst.

Vær droppes bevisst — det dekkes allerede av `entur/velkomsttavle-bergen`.

## Tjenester i scope

Konfigurerbar liste. Ved lansering:

- `entur/products-api`
- `entur/products-spring`
- `entur/distribution-channels-api`

Listen er config-drevet slik at `osdm-gateway`, `distance-ten`, `parking` m.fl.
kan legges til uten kodeendring.

## Arkitektur

Siden forblir en **statisk client-side-app** (React + Vite på Firebase Hosting).
Klienten kan ikke selv nå interne kilder, så datainnsamling flyttes til CI.

### Komponenter

1. **Status-collector (ny GitHub Action, `status-collector.yml`)**
   Planlagt kjøring hvert 5. minutt (cron) + `workflow_dispatch`. Den:
   - Spør GitHub API om siste deploy-workflow-run per konfigurert repo →
     status (success/failure/in_progress), versjon/SHA, tidspunkt, lenke.
   - *(Fase 2)* Autentiserer mot GCP via workload identity og spør Managed
     Prometheus om live helse per tjeneste (`up`, feilrate, p95-latency).
   - Skriver en samlet `status.json` og **publiserer den til en offentlig
     GCS-bucket** (CORS-aktivert, public read).

2. **Frontend (eksisterende app, redesignet)**
   Henter `status.json` fra bucketen ved lasting og hvert 5. minutt (siden
   reloader allerede hvert 5. min). Rendrer tjeneste-helse-grid + RSS-ticker.

### Hvorfor GCS-bucket (valgt over full Firebase-redeploy)

Collectoren har uansett GCP-auth (for Prometheus i fase 2); bucket-skriving er
trivielt. Data-oppdatering blir helt frikoblet fra site-deploys, og JSON-en
serveres CORS-vennlig. Alternativet — å re-deploye hele siten hvert 5. min — ble
valgt bort fordi det kobler data til deploy.

## Datakontrakt (`status.json`)

```json
{
  "generatedAt": "2026-07-24T09:00:00Z",
  "services": [
    {
      "name": "products-api",
      "repo": "entur/products-api",
      "deploy": {
        "state": "success",
        "version": "1.42.0",
        "sha": "a1b2c3d",
        "at": "2026-07-24T08:41:00Z",
        "url": "https://github.com/entur/products-api/actions/runs/..."
      },
      "health": {
        "state": "up",
        "errorRate": 0.001,
        "p95Ms": 120
      }
    }
  ]
}
```

- `deploy.state`: `success | failure | in_progress`
- `health.state`: `up | degraded | down | unknown` (fase 1: alltid `unknown`)
- I fase 1 utelates/nulles helse-metrikkene; feltet fylles i fase 2.

## Layout-redesign

- **Topp (slank header):** Entur-logo + "Driftstatus" + sau, men vesentlig
  lavere høyde enn i dag.
- **Midt (hovedflate):** responsivt **grid av tjeneste-kort**. Hvert kort:
  - tjenestenavn
  - stor status-prikk (grønn/gul/rød)
  - prod-versjon + kort SHA
  - "deployet for X siden"
  - liten metrikk-linje (feilrate %, p95) — kun når `health` er tilgjengelig
- **Bunn:** tynn **RSS-ticker** (marquee) som ruller titlene fra
  `status.entur.org`. Feeden går fra å fylle skjermen til én linje.

### Status-mapping (kort-farge, fase 1)

- Grønn: siste deploy `success`
- Gul: deploy `in_progress`
- Rød: siste deploy `failure`
- Grå/ukjent: ingen data for tjenesten

*(Fase 2 lar helse-state overstyre/berike fargen — f.eks. deploy ok men
feilrate høy → gul/rød.)*

### Feilhåndtering

- Hvis `status.json` ikke kan hentes: behold forrige visning + diskret
  feilindikator.
- Hvis `generatedAt` er eldre enn ~15 min: vis **"data utdatert"-banner**
  (collector nede), men behold kortene.

## Fasing

### Fase 1 (dette designet, klart for plan)
- Ny layout: slank header + tjeneste-grid + RSS-ticker.
- Collector henter **deploy-status** fra GitHub og publiserer `status.json` til
  GCS-bucket.
- Ingen GCP/Prometheus-avhengighet ennå (`health.state = "unknown"`).

### Fase 2 (senere)
- Berik kortene med **ekte helse** fra Managed Prometheus (feilrate, p95,
  up/down), via workload identity i collector-jobben.

## Avhengigheter å avklare i planleggingen

1. **GitHub-tilgang:** repoets `GITHUB_TOKEN` dekker bare dette repoet. Å lese
   andre repoers workflow-runs krever en token/GitHub App med org-lese-tilgang
   (lagres som secret).
2. **GCS-bucket:** hvilket GCP-prosjekt, bucket-navn, public-read + CORS-oppsett,
   og hvordan collector-jobben autentiserer for å skrive.
3. **Deploy-workflows:** hvilke faktiske workflow-filer/-navn hver tjeneste
   bruker for prod-deploy, og hvordan versjon/SHA hentes ut.
4. *(Fase 2)* workload-identity-oppsett mot GCP + faktiske Prometheus-metrikk-navn
   per tjeneste.

## Testing

- **Collector:** enhetstester på parsing av GitHub-workflow-respons →
  `status.json`-mapping; håndtering av repo uten deploys / feilende API-kall.
- **Frontend:** komponenttester på kort-rendering (hver status-state),
  utdatert-banner ved gammel `generatedAt`, og fallback når `status.json`
  mangler. Ticker-rendering med tom/ikke-tom feed.

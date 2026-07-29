# Design: ServiceCard v2 — helse i fokus

**Dato:** 2026-07-29
**Status:** Godkjent design, klar for implementasjonsplan
**Erstatter:** `2026-07-27-servicecard-redesign-helseindikatorer-design.md`

## Bakgrunn

`status.json` (fra bucketen `ent-stacolber-prd-status`) er beriket med langt mer
helse- og metrikkdata enn tidligere. Dagens kort leser `health.p95Ms`,
`health.errorRate4xx` og `health.errorRate5xx` — felter som nå alltid er `null`
(den gamle GMP-kilden er død). Resultatet er at helse-indikatorene på kortet viser
"–" for alt.

De ferske dataene ligger i stedet under `metrics.window` / `metrics.lifetime`, og
`health` har fått `uptime15m` og `samples[]`. Vi redesigner kortet for å bruke de
nye feltene og løfte helse tydelig frem visuelt.

Referansetjeneste: **products-spring** — den eneste som foreløpig leverer full
data. Alle tjenester skal etter hvert levere på samme form, så kortet må være
null-sikkert for tjenester som mangler felter.

## Mål

1. **Hjerte** signaliserer om appen er oppe, og sier noe om oppetiden siste 15 min.
2. **Kakediagram** viser andel vellykkede (grønn), 4xx (gul) og 5xx (rød) svar.
3. **Snitt responstid** vises som eget tall.
4. **Deploy** er en egen seksjon merket med opplasting-ikon: hvilken commit som er
   deployet til prod, og når.
5. **Kun prod** vises (sparer plass). Tst/dev droppes helt.
6. **Hjerte og kake får mest visuell fokus.**

## Datagrunnlag (per tjeneste, fra `status.json`)

Faktisk struktur (products-spring):

```
health:
  state: "up" | "degraded" | "down" | "unknown"
  up: true|false
  uptime15m: 1.0          # andel 0..1
  samples: [{at, up}]     # ikke brukt i denne versjonen
  p95Ms / errorRate*      # DØDE (null) — brukes ikke
metrics:
  window:   { avgMs, p50Ms, p95Ms, p99Ms, errorRate4xx, errorRate5xx, requestCount, windowSeconds }
  lifetime: { avgMs, ..., errorRate4xx, errorRate5xx, sampleCount, uptimeSeconds }
  instanceStartedAt, scrapedAt
metricSamples: [ ... ]    # rå Prometheus-snapshots, ikke brukt i denne versjonen
deploy:
  environments: [{ env, state, sha, at, commitMessage, pr, ticket, url }]
```

### Metrikk-vindu: window først, lifetime fallback

All metrikk (kake + responstid) leser fra `metrics.window` som førstevalg. Er
`metrics.window` fraværende **eller** feltet der er `null`, fall tilbake til
`metrics.lifetime`. Mangler begge → nøytral/tom visning med "–".

## Datamapping per element

| Element | Kilde | Regel |
|---|---|---|
| Hjerte-farge | `health.state` | up→success, degraded→warning, down→negative, unknown→neutral |
| Hjerte-tekst | `health.up` | true→"Oppe", false→"Nede", mangler→"–" |
| Oppetid 15 min | `health.uptime15m` | Prosent: `"100 % oppe siste 15 min"`. Null → "–" |
| Kake grønn | `1 − errorRate4xx − errorRate5xx` | vellykkede svar (inkl. 2xx og 3xx) |
| Kake gul | `errorRate4xx` | |
| Kake rød | `errorRate5xx` | |
| Snitt responstid | `avgMs` | `"71 ms"` (avrundet). Null → "–" |
| Deploy sha | `prd.sha` | monospace |
| Deploy tid | `prd.at` | "for 6 dager siden" (state=success), ellers statustekst |
| Deploy melding | `prd.commitMessage` | maks 2 linjer |

Der kaka mangler data (begge vindu null): grå/tom kake + "–". Fargesignalet bæres
av hjerte og kake; **snitt responstid og oppetid-prosent vises i nøytral
tekstfarge** (ikke terskelfarget) for å holde støyen nede.

## Layout (variant B — validert i visuell companion)

Topp → bunn:

1. **Tjenestenavn** — stor overskrift (~26–30px).
2. **Hero-rad** (hjerte + kake får mest vekt):
   - **Venstre:** stort kakediagram (~118px).
   - **Høyre kolonne:** `HeartIcon` + "Oppe/Nede", "100 % oppe siste 15 min"
     under, deretter "Snitt responstid" + stort tall ("71 ms").
3. **Fargeforklaring** — små prikker: 2xx (grønn) · 4xx (gul) · 5xx (rød).
4. **Deploy-seksjon** — adskilt med tynn topplinje: `UploadIcon` + `sha` +
   "for 6 dager siden", commit-melding under (maks 2 linjer).
5. **Kortbakgrunn** — tintes fortsatt etter prod-status (kombinert `prd.state` +
   `health.state`), uendret logikk (`prdColorKey` / `cardTint`).

## Komponentstruktur

- `ServiceCard` (toppkomponent) skrives om til hero-rad + deploy-seksjon.
- Ny intern/utskilt **`PieChart`** — SVG conic-diagram som tar tre andeler
  (`ok`, `c4`, `c5`) og fyller grønn/gul/rød. Håndterer tom/null (grå ring).
- Ny intern **`Heartbeat`** (hjerte + oppetidstekst) og **`ResponseTime`** (tall).
- Ny **`DeploySection`** (upload-ikon + sha + tid + commit-melding).
- Fjernes: `HealthIndicatorRow`, `HealthIndicator` (like/measure), `CompactRow`
  (tst/dev). `ProdRow` erstattes av `DeploySection`.

## Endringer i `statusFormat.js`

Nye funksjoner:
- `pickMetrics(metrics)` → returnerer `metrics.window` hvis den finnes, ellers
  `metrics.lifetime`, ellers `null`. Per-felt fallback for `avgMs` og error-ratene
  (window-felt `null` → bruk lifetime-feltet).
- `responseBreakdown(metrics)` → `{ ok, c4, c5 }` som andeler (0..1) til kaka,
  null-sikker (returnerer `null` når begge vindu mangler ratene).
- `formatUptime15m(fraction)` → `"100 %"`-tekst, null-sikker.
- `avgMs`-formattering gjenbruker `formatMs`.

Fjernes / avvikles (baserte seg på døde `health`-felt, og denne versjonen
terskelfarger ikke responstid):
- `successRate`, `SUCCESS_RATE_THRESHOLDS`, `P95_THRESHOLDS`, `metricColorKey`
  fjernes for å unngå død kode.

Beholdes uendret: `dotColor`, `cardTint`, `prdColorKey`, `healthColorKey`,
`deployColorKey`, `combineSeverity`, `timeAgo`, `envStateLabel`, `formatMs`,
`formatPct`, `isStale`, `deployLabel`.

## Ikke i scope

- Endringer i collector / `stacolber` (datainnsamling).
- `health.samples[]` som sparkline/prikkerad (valgt bort — kun prosent-tekst).
- `metricSamples[].statusClass` (ekte 2xx/3xx-splitt) — vi bruker error-ratene, så
  3xx teller som vellykket i grønn bit.
- Terskelfarging av snitt responstid (nøytral tekst i denne versjonen).
- Endringer i `ServiceHealthGrid`-layout (antall kolonner e.l.).

## Testing

`ServiceCard.test.jsx` (oppdateres):
- Hero-rad rendrer hjerte, oppetid-prosent, kake og snitt responstid.
- Hjerte-farge følger `health.state` (up/degraded/down/unknown → riktig farge).
- Oppetid-prosent formateres fra `uptime15m`.
- Kaka bruker `window` når den finnes, faller til `lifetime` når window-felt er
  null, og viser grå/tom + "–" når begge mangler.
- Snitt responstid: window→lifetime fallback, "–" ved null.
- Deploy-seksjon viser upload-ikon, sha, tid siden og commit-melding (maks 2
  linjer); ingen tst/dev-rader rendres.
- Kortbakgrunn tinter etter prod-status (uendret).

`statusFormat.test.js` (utvides):
- `pickMetrics` (window valgt, per-felt lifetime-fallback, begge null).
- `responseBreakdown` (normal, error-rater > 0, null-tilfeller).
- `formatUptime15m` (1.0 → "100 %", null → "–").

`PieChart` enhetstestes: tre andeler → tre segmenter; tom/null → grå ring.

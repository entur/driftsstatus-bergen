# Design: redesign av ServiceCard med helse-indikatorer

**Dato:** 2026-07-27
**Status:** Godkjent design, klar for implementasjonsplan

## Bakgrunn

Driftsstatus-skjermen viser ett tjenestekort per app. I dag lister kortet
tjenestenavn, én deploy-rad per miljø (`prd`/`tst`/`dev`), og — når helse finnes
— en enkelt tekstlinje `p95 … · 5xx … · 4xx …`.

Kortet fremhever ikke det viktigste: **prod-status**. Alle miljøer får lik visuell
vekt, og helse-metrikkene er gjemt i én liten tekstlinje uten visuell status per
metrikk.

## Mål

Redesigne kortet slik at:

1. **Prod-status fremheves** som den viktigste informasjonen.
2. Helse vises som en rad med **ikon-indikatorer** rett under navnet, hver farget
   grønn/gul/rød/grå etter egen status.
3. Test og dev vises kompakt og dempet under prod.

## Datagrunnlag (fra `status.json`)

Per tjeneste:
- `name`, `repo`
- `deploy.environments[]`: `env`, `state` (success/failure/in_progress/unknown),
  `sha`, `at`, `commitMessage`, `pr`, `ticket`, `url`
- `health`: `state` (up/degraded/down/unknown), `up`, `p95Ms`, `errorRate5xx`,
  `errorRate4xx`

Merk: live-data har `health.state: "unknown"` for alle tjenester nå (collector
spør feil Thanos, se minnet). Indikatorene bygges klare, men vil vise grått/`–`
inntil collectoren leverer helse-data. Endring i collectoren skjer i `stacolber`,
ikke i dette repoet.

## Layout (topp → bunn)

1. **Tjenestenavn** — stor overskrift (som i dag, 30px).

2. **Helse-indikatorrad** — 3 ikoner på rad, hver farget etter egen status:
   - ❤️ `HeartIcon` — **Helse**: farge direkte fra `health.state`
     (up=grønn, degraded=gul, down=rød, unknown=grå). Ingen tallverdi.
   - 👍 `LikeIcon` + verdi — **Suksessrate**: andelen svar som *ikke* er 4xx/5xx,
     `1 − errorRate4xx − errorRate5xx`, vist som `99,7 %`. Farge fra terskel.
   - 📏 `MeasureIcon` + verdi — **p95**: `142 ms`. Farge fra terskel.
   - Ved manglende data (`unknown`/null): ikon grått, verdi `–`.

3. **PROD-blokk (fremhevet)** — visuelt tydeligst (større statusprikk, kraftigere
   tekstvekt enn tst/dev):
   - Statusprikk + `Deployet {tid siden}` (eller statustekst ved
     in_progress/failure/unknown) + `sha` (monospace).
   - Commit-melding, maks 2 linjer (som i dag).

4. **TST + DEV (kompakt)** — mindre, dempet rad per miljø: liten prikk +
   `TST`/`DEV` + `sha` + kort tid siden / statustekst. **Ingen** commit-melding.

## Fargeterskler (justerbare konstanter)

- **Suksessrate:** grønn ≥ 99,5 % · gul ≥ 99 % · rød < 99 %
- **p95:** grønn ≤ 300 ms · gul ≤ 800 ms · rød > 800 ms

Terskler defineres som navngitte konstanter i `statusFormat.js` slik at de er lette
å justere.

## Kort-bakgrunn (tinting)

Beholder tinting, men baserer den på **prd-status** (kombinert prd deploy-state +
`health.state`) i stedet for samlet `deploy.state`, siden prod er fokuset.

## Nye funksjoner i `statusFormat.js`

- `successRate(health)` → `1 − errorRate4xx − errorRate5xx`, null-sikker
  (returnerer `null` hvis noen av ratene mangler).
- `metricColorKey(value, thresholds)` → `'success' | 'warning' | 'negative' | 'neutral'`
  (neutral ved `null`/`undefined`).
- Terskelkonstanter: `SUCCESS_RATE_THRESHOLDS`, `P95_THRESHOLDS`.
- Hjelper for prd-basert tint: utled colorKey fra prd-miljøets deploy-state +
  `health.state` (gjenbruker `combineSeverity`).

Merk: suksessrate og p95 har motsatt retning — høy suksessrate er bra, lav p95 er
bra. `metricColorKey` må derfor støtte begge retninger (f.eks. via
terskel-konfig med retning, eller to varianter).

## Komponentstruktur

- Behold `ServiceCard` som toppkomponent.
- Ny intern `HealthIndicator({ icon, value, colorKey, label })` — ett ikon + valgfri
  verdi, farget.
- Ny intern `HealthIndicatorRow({ health })` — de tre indikatorene.
- Behold `EnvRow`, men differensier prod (fremhevet) vs tst/dev (kompakt) — enten
  via en `variant`-prop eller to varianter.

## Ikke i scope

- Endringer i collector / `stacolber` (helse-data, commits-bak-head).
- "Commits bak HEAD på main" — finnes ikke i dataene, utelates foreløpig.
- Egen responstid-metrikk adskilt fra p95 — kun ett latenstall finnes.
- Endringer i `ServiceHealthGrid`-layout (antall kolonner e.l.).

## Testing

Utvid `ServiceCard.test.jsx`:
- Indikatorrad rendres med de tre ikonene.
- `successRate` regnes riktig og farges etter terskel (grønn/gul/rød).
- p95 farges etter terskel.
- Grått ikon + `–` når helse er `unknown`/null.
- Prod fremhevet (større prikk / annen vekt) vs tst/dev kompakt (ingen
  commit-melding).
- Kort-bakgrunn tinter etter prd-status.

Enhetstester for `statusFormat.js`: `successRate` (inkl. null-tilfeller),
`metricColorKey` (grenseverdier, begge retninger).

# Design: sau-placeholder ved manglende data

**Dato:** 2026-07-29
**Status:** Godkjent design, klar for implementasjon
**Bygger på:** `2026-07-29-servicecard-v2-helse-fokus-design.md`

## Bakgrunn

ServiceCard v2 viser hjerte, kakediagram og snitt responstid i en hero-rad. Ikke
alle tjenester leverer full data ennå: i dag har bare `products-spring` komplett
`health` + `metrics`. `distribution-channels-api` har `health` men ingen
`metrics`; `products-api` har verken brukbar `health` (state `unknown`) eller
`metrics`. For slike kort blir hero-raden halvtom (grå kake, «–»), noe som ser ut
som en feil heller enn «venter på data».

## Mål

Vise Entur Linje sin **sau-illustrasjon** i stedet for hero-raden når en tjeneste
mangler data, som en vennlig «venter på data»-tilstand.

## Asset

`public/sheep.svg` finnes allerede i repoet (Entur Linje-sauen, 320×320,
brand-lilla). Serveres av Vite på `/sheep.svg`. **Ingen ny avhengighet** — Entur
Linje-illustrasjonene distribueres ellers kun via internt Google Drive, ikke som
npm-pakke.

## Trigger: «når som helst noe mangler»

Hero-raden vises kun når **all** hero-data finnes. Ellers vises sauen.

Ny hjelpefunksjon `hasCompleteHeroData(service)` → `true` bare når:
- `health.state` er en kjent state og ≠ `'unknown'`, og
- `health.uptime15m` er ikke `null`/`undefined`, og
- `responseBreakdown(service.metrics)` er ikke `null` (kake har data), og
- `pickMetric(service.metrics, 'avgMs')` er ikke `null` (responstid finnes).

Er noe av dette usant → `false` → sau.

## Layout

- **Full data** (`hasCompleteHeroData` = true): dagens v2-layout uendret
  (hero + fargeforklaring + deploy-seksjon).
- **Manglende data**: tjenestenavn → `SheepPlaceholder` (i stedet for hero +
  fargeforklaring) → deploy-seksjon (uendret). Kortbakgrunn tintes fortsatt etter
  prod-status (`prdColorKey`/`cardTint`), uendret.

`SheepPlaceholder`: `<img src="/sheep.svg" alt="" width={130} height={130}>`
sentrert, med `Text` «Venter på data» under. `alt=""` fordi illustrasjonen er
dekorativ og teksten bærer betydningen (WCAG).

## Komponentstruktur

- Ny intern `SheepPlaceholder()` i `ServiceCard.jsx`.
- `ServiceCard` velger hero vs. `SheepPlaceholder` basert på
  `hasCompleteHeroData(service)`. `DeploySection` og bakgrunn-tint uendret.

## Ikke i scope

- Endringer i collector / datainnsamling (hvorfor data mangler).
- Animert sau / andre Linje-illustrasjoner.
- Egen «feilet»-tilstand adskilt fra «mangler data» (én sau dekker begge).

## Testing (`ServiceCard.test.jsx` + `statusFormat.test.js`)

`hasCompleteHeroData` (enhetstest):
- Full data → `true`.
- `health.state = 'unknown'` (men metrics finnes) → `false`.
- `uptime15m = null` → `false`.
- metrics mangler (`{window:{},lifetime:{}}`) → `false`.
- `avgMs = null` i begge vindu → `false`.

`ServiceCard`:
- Full data → hero (`pie`/`heart`) vises, ingen `img[src="/sheep.svg"]`.
- Manglende metrics → sau (`img[src="/sheep.svg"]` + «Venter på data»), ingen
  `pie`/`heart`, men `deploy`-seksjon finnes.
- health `unknown` men metrics finnes → sau (trigger på «noe mangler»).

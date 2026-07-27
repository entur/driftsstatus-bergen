# Design: fargede deploy-statuser + commit-melding

**Dato:** 2026-07-27
**Status:** Godkjent design, klar for implementasjonsplan

## Bakgrunn

Driftsstatus-skjermen viser tjenestekort med én deploy-rad per miljø (`prd`/`tst`/`dev`).
I dag oppleves alle statusprikkene som grå, og det vises kun SHA + ETU/PR-referanse — ikke
selve commit-meldingen.

To underliggende problemer er identifisert:

1. **Fargebug.** `DOT`-tabellen i `ServiceCard.jsx` slår opp `semantic.fill.success.default`,
   `.warning.default` og `.negative.default`. Disse token-stiene finnes **ikke** i den
   installerte `@entur/tokens` og evaluerer til `undefined`. Prikken får da ingen bakgrunn
   (usynlig), og bare `neutral: '#9aa0a6'` (hardkodet grått) vises. `status.json` inneholder
   riktig data (`prd: success`, `dev: failure`) — den rendres bare med feil farge.

2. **Commit-melding kastes.** Collector-en henter `commitMessage`, men bruker den kun til å
   trekke ut ETU-ticket/PR og forkaster teksten. Den finnes derfor ikke i `status.json`.

## Mål

- Deploy-prikker viser korrekt farge: grønn (success), gul (in_progress), rød (failure),
  grå (unknown).
- Hvert miljø viser commit-meldingens subjektlinje i stedet for kun SHA + ETU/PR-nummer.

## Ikke i scope

- Health-metrikker (p95/5xx/4xx), status-ticker og selve collector-tjenesten (`stacolber`).
- Klikkbare lenker til deploy/PR fra kortet.

## Del A — Fargefix

**Fil:** `src/components/ServiceCard.jsx`

Endre `DOT` til å bruke `.deep`-variantene som faktisk finnes i `@entur/tokens`:

| Nøkkel     | Ny verdi                          | Farge  |
|------------|-----------------------------------|--------|
| `success`  | `semantic.fill.success.deep`      | #1a8e60 grønn |
| `warning`  | `semantic.fill.warning.deep`      | #ffca28 gul   |
| `negative` | `semantic.fill.negative.deep`     | #d31b1b rød   |
| `neutral`  | `'#9aa0a6'` (uendret)             | grå    |

Gjelder både miljø-prikken i `EnvRow` og den kombinerte prikken øverst på kortet
(begge leser fra samme `DOT`). Ingen datamigrering.

## Del B — Commit-melding

### Collector

**Fil:** `scripts/status/deployEnvironments.js`

`buildDeployEnvironment` legger til et nytt felt `commitMessage`:

- Ved gyldig SHA: første linje av `commitMessage`, trimmet (subjektlinje).
- Uten SHA (`unknown`-miljø): `null`.

`ticket`- og `pr`-feltene i `status.json` beholdes uendret (utledes fortsatt), men brukes
ikke lenger i UI.

Eksempel på env-objekt etter endring:

```json
{
  "env": "prd",
  "state": "success",
  "sha": "965bd60",
  "at": "2026-06-15T10:21:07Z",
  "ticket": "ETU-73549",
  "pr": 411,
  "commitMessage": "feat: øk timeout for katalog-oppslag",
  "url": "https://github.com/entur/products-api/actions/runs/..."
}
```

### Frontend

**Fil:** `src/components/ServiceCard.jsx` (`EnvRow`)

Ny radoppbygging per miljø:

```
● PRD  965bd60
   Deployet for 3 timer siden
   feat: øk timeout for katalog-oppslag        ← commit-subjekt, ordbrutt, maks 2 linjer, dempet
```

- **Linje 1:** prikk + miljønavn + liten SHA (monospace). Den separate ETU/PR-referanselinjen
  (`deployRef`) fjernes fra visningen.
- **Linje 2:** sekundærtekst — `timeAgo(env.at, now)` ved `success`, ellers `envStateLabel(state)`
  («deployer …» / «feilet»). Uendret logikk.
- **Linje 3:** commit-subjekt (`env.commitMessage`), kun når feltet finnes. CSS 2-linjers klamp
  (`-webkit-line-clamp: 2`, `overflow: hidden`), dempet stil (`caption`), venstre-innrykk på
  linje med de andre sekundærlinjene.

`deployRef` og `envStateLabel` beholdes i `statusFormat.js`; `deployRef` er bare ikke lenger
i bruk fra `EnvRow` (kan fjernes senere om ønskelig — utenfor scope her).

## Feilhåndtering / robusthet

- `commitMessage: null` eller manglende → linje 3 rendres ikke (ingen tom rad).
- Eldre `status.json` uten `commitMessage`-felt fungerer fortsatt: feltet leses som `undefined`
  og linjen utelates. Ingen brytende endring for frontend.

## Tester

- `scripts/status/deployEnvironments.test.js`: `buildDeployEnvironment` returnerer trimmet
  subjektlinje i `commitMessage`; `null` uten SHA; kun første linje ved flerlinjet melding.
- `src/components/ServiceCard.test.jsx`: prikk får riktig farge per state (success/failure/
  unknown); commit-subjekt vises når `commitMessage` finnes og utelates når det mangler;
  ETU/PR-referanselinjen vises ikke lenger.

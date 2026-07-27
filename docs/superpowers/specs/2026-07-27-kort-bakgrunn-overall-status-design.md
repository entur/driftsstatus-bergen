# Design: overall-status som kort-bakgrunn + større tjenestenavn

**Dato:** 2026-07-27
**Status:** Godkjent design, klar for implementasjonsplan
**Bygger på:** samme kort (`ServiceCard`) som `2026-07-27-deploy-status-farge-commit-design.md`

## Bakgrunn

Tjenestekortet viser i dag en liten 16px status-prikk øverst (kombinert deploy+helse-status
via `combineSeverity`). Ønsket er å kommunisere «appens generelle status» tydeligere ved å
farge hele kortets bakgrunn svakt grønn/gul/rød i stedet for prikken, og gjøre tjenestenavnet
større.

## Mål

- Kortets bakgrunn tinter etter overall-status: svak grønn (success), svak gul
  (in_progress/degraded), svak rød (failure/down), hvit (unknown).
- Den kombinerte 16px-prikken øverst fjernes (bakgrunnen overtar rollen).
- Tjenestenavnet vises større.

## Ikke i scope

- Per-miljø-prikkene (`EnvRow`), commit-linjer, health/metrikk-linja og ticker forblir uendret.

## Løsning

### Ny helper i `src/lib/statusFormat.js`

Speiler `dotColor`, men returnerer svake `.muted`-bakgrunnsfarger:

| colorKey   | Verdi                          | Farge        |
|------------|--------------------------------|--------------|
| `success`  | `semantic.fill.success.muted`  | #d0f1e3 svak grønn |
| `warning`  | `semantic.fill.warning.muted`  | #fff4cd svak gul   |
| `negative` | `semantic.fill.negative.muted` | #ffcece svak rød   |
| `neutral`  | `'white'`                      | hvit (uendret)     |

```js
export function cardTint(colorKey) {
    return CARD_TINTS[colorKey] ?? CARD_TINTS.neutral;
}
```

Aldri `undefined`; ukjent nøkkel faller tilbake til `'white'`.

### `src/components/ServiceCard.jsx`

- Kort-`div` bakgrunn: `cardTint(combineSeverity(deploy.state, health.state))` i stedet for
  hardkodet `'white'`. `combineSeverity` brukes fortsatt (samme overall-status som før).
- Fjern den kombinerte 16px-prikken (`<span … width: 16 …>`). `dotColor` beholdes i importen —
  den brukes fortsatt av `EnvRow` sine per-miljø-prikker.
- Tjenestenavn: `Heading variant="subtitle-1"` → `variant="title-2"` (større; gyldig
  `@entur/typography/beta` Heading-variant).

## Kontrast / robusthet

- De valgte `.muted`-fargene er lyse pasteller; kortets mørke tekst beholder god kontrast
  (WCAG AA).
- `cardTint` returnerer alltid en gyldig CSS-fargeverdi.

## Tester

- `src/lib/statusFormat.test.js`: `cardTint` gir riktig muted-farge per nøkkel og `'white'`
  for `neutral` samt ukjent nøkkel.
- `src/components/ServiceCard.test.jsx`: kort-bakgrunn får riktig tint per overall-state
  (success→#d0f1e3, failure→#ffcece, unknown→white); den kombinerte 16px-prikken finnes ikke
  lenger (kun 10px per-miljø-prikker igjen).

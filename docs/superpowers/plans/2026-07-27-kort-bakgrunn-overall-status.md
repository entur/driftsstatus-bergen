# Kort-bakgrunn for overall-status + større tjenestenavn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kortets bakgrunn tinter svakt grønn/gul/rød etter overall-status, den kombinerte 16px-prikken fjernes, og tjenestenavnet vises større.

**Architecture:** Én ny farge-helper `cardTint(colorKey)` i `statusFormat.js` (speiler `dotColor`, men returnerer `.muted`-bakgrunnsfarger). `ServiceCard` bruker den på kort-`div`-ens bakgrunn, fjerner 16px-prikken, og bumper Heading-varianten.

**Tech Stack:** React 19, Vite, Vitest, @testing-library/react, @entur/tokens, @entur/typography/beta.

## Global Constraints

- Testrammeverk: Vitest (`import { describe, it, expect } from 'vitest'`); komponenttester bruker `@testing-library/react`. Norsk UI-tekst og testbeskrivelser.
- `.muted`-tokenverdier (verifisert i installert `@entur/tokens`): `semantic.fill.success.muted` = `#d0f1e3`, `semantic.fill.warning.muted` = `#fff4cd`, `semantic.fill.negative.muted` = `#ffcece`. `neutral` → `'white'`.
- `cardTint(colorKey)` skal aldri returnere `undefined` (ukjent nøkkel → `'white'`).
- Overall-status utledes med eksisterende `combineSeverity(deploy.state, health.state)`.
- Heading-variant for tjenestenavn: `title-2` (gyldig `@entur/typography/beta` Heading-variant).
- `dotColor`, `deployColorKey`, `combineSeverity` beholdes og brukes fortsatt (per-miljø-prikkene i `EnvRow` er uendret).
- jsdom normaliserer inline hex til `rgb(...)`; komponenttester som sammenligner bakgrunnsfarge må konvertere (se eksisterende hjelpe-mønster `asRgb` i `ServiceCard.test.jsx`).

---

### Task 1: `cardTint`-helper + kort-bakgrunn, fjern 16px-prikk, større navn

**Files:**
- Modify: `src/lib/statusFormat.js` (legg til `cardTint`)
- Modify: `src/components/ServiceCard.jsx` (bakgrunn, fjern prikk, Heading-variant)
- Test: `src/lib/statusFormat.test.js`, `src/components/ServiceCard.test.jsx`

**Interfaces:**
- Consumes: `combineSeverity(deployState, healthState)` → colorKey `'success'|'warning'|'negative'|'neutral'` (finnes i `statusFormat.js`).
- Produces: `cardTint(colorKey): string` — CSS-fargeverdi, aldri `undefined`.

- [ ] **Step 1: Skriv de feilende testene for `cardTint`**

Legg `cardTint` til import-linja i `src/lib/statusFormat.test.js`:

```js
import { isStale, deployLabel, deployColorKey, timeAgo, healthColorKey, combineSeverity, formatMs, formatPct, envStateLabel, deployRef, dotColor, cardTint } from './statusFormat.js';
```

Legg til testblokk:

```js
describe('cardTint', () => {
    it('gir svake muted-bakgrunnsfarger fra @entur/tokens', () => {
        expect(cardTint('success')).toBe('#d0f1e3');
        expect(cardTint('warning')).toBe('#fff4cd');
        expect(cardTint('negative')).toBe('#ffcece');
    });
    it('gir hvit for neutral', () => {
        expect(cardTint('neutral')).toBe('white');
    });
    it('faller tilbake til hvit for ukjent nøkkel', () => {
        expect(cardTint('finnesikke')).toBe('white');
    });
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `yarn test src/lib/statusFormat.test.js`
Expected: FAIL — `cardTint is not a function` / not exported.

- [ ] **Step 3: Implementer `cardTint` i `statusFormat.js`**

`semantic` importeres allerede i `statusFormat.js` (fra forrige inkrement). Legg til nederst i fila:

```js
const CARD_TINTS = {
    success: semantic.fill.success.muted,
    warning: semantic.fill.warning.muted,
    negative: semantic.fill.negative.muted,
    neutral: 'white'
};
export function cardTint(colorKey) {
    return CARD_TINTS[colorKey] ?? CARD_TINTS.neutral;
}
```

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `yarn test src/lib/statusFormat.test.js`
Expected: PASS.

- [ ] **Step 5: Skriv de feilende komponent-testene**

I `src/components/ServiceCard.test.jsx`, legg til `cardTint` i import fra `statusFormat.js`:

```js
import { dotColor, cardTint } from '../lib/statusFormat.js';
```

Legg til tester inne i `describe('ServiceCard', …)`:

```js
    it('tinter kort-bakgrunnen etter overall-status', () => {
        const asRgb = (hex) => {
            if (hex === 'white') return 'white';
            const n = parseInt(hex.slice(1), 16);
            return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
        };
        const successDeploy = { state: 'success', environments: [{ env: 'prd', state: 'success', sha: 'aaaaaaa', at: '2026-06-15T10:21:07Z', ticket: null, pr: null, commitMessage: null, url: 'https://x' }] };
        const failDeploy = { state: 'failure', environments: [{ env: 'prd', state: 'failure', sha: 'bbbbbbb', at: '2026-07-24T08:00:00Z', ticket: null, pr: null, commitMessage: null, url: 'https://x' }] };
        const unknownDeploy = { state: 'unknown', environments: [{ env: 'prd', state: 'unknown', sha: null, at: null, ticket: null, pr: null, commitMessage: null, url: 'https://x' }] };

        const { container: cSuccess } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: successDeploy, health: unknownHealth }} />);
        expect(cSuccess.firstChild.style.background).toBe(asRgb(cardTint('success')));

        const { container: cFail } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: failDeploy, health: unknownHealth }} />);
        expect(cFail.firstChild.style.background).toBe(asRgb(cardTint('negative')));

        const { container: cUnknown } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: unknownDeploy, health: unknownHealth }} />);
        expect(cUnknown.firstChild.style.background).toBe('white');
    });

    it('viser ikke lenger den kombinerte 16px-prikken', () => {
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        const bigDots = [...container.querySelectorAll('span')].filter((s) => s.style.width === '16px');
        expect(bigDots).toHaveLength(0);
    });
```

- [ ] **Step 6: Kjør komponent-testene og bekreft at de feiler**

Run: `yarn test src/components/ServiceCard.test.jsx`
Expected: FAIL — bakgrunn er fortsatt `'white'` for alle, og 16px-prikken finnes ennå.

- [ ] **Step 7: Oppdater `ServiceCard.jsx`**

Legg `cardTint` til import-linja:

```js
import { dotColor, cardTint, deployColorKey, combineSeverity, envStateLabel, formatMs, formatPct, timeAgo } from '../lib/statusFormat.js';
```

Endre kort-`div`-ens `background` fra `'white'` til `cardTint(colorKey)` (variabelen `colorKey` finnes allerede: `const colorKey = combineSeverity(deploy.state, health.state);`):

```jsx
        <div style={{
            background: cardTint(colorKey), borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 10, minHeight: 0
        }}>
```

Fjern den kombinerte 16px-prikken og gjør navne-raden til bare Heading (større variant). Erstatt:

```jsx
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: dotColor(colorKey), flex: '0 0 auto' }} />
                <Heading as="h3" variant="subtitle-1" margin="none">{service.name}</Heading>
            </div>
```

med:

```jsx
            <Heading as="h3" variant="title-2" margin="none">{service.name}</Heading>
```

- [ ] **Step 8: Kjør hele testsuiten og bekreft at alt passerer**

Run: `yarn test`
Expected: PASS — inkludert den eksisterende regresjonstesten for per-miljø-prikker (filtrerer på 10px, uberørt av at 16px-prikken fjernes).

- [ ] **Step 9: Verifiser visuelt i dev-server (valgfritt)**

Run: `yarn dev` — sjekk at kort med success-prd får svak grønn bakgrunn, failure svak rød, og at tjenestenavnet er større uten prikk foran.

- [ ] **Step 10: Commit**

```bash
git add src/lib/statusFormat.js src/lib/statusFormat.test.js src/components/ServiceCard.jsx src/components/ServiceCard.test.jsx docs/superpowers/specs/2026-07-27-kort-bakgrunn-overall-status-design.md docs/superpowers/plans/2026-07-27-kort-bakgrunn-overall-status.md
git commit -m "feat: overall-status som svak kort-bakgrunn, større tjenestenavn, fjern topp-prikk"
```

---

## Self-Review

- **Spec-dekning:** cardTint-helper (Step 1-4) ✓; kort-bakgrunn (Step 7) ✓; fjern 16px-prikk (Step 7) ✓; større navn title-2 (Step 7) ✓; tester (Step 1, 5) ✓.
- **Placeholder-scan:** ingen TBD/TODO; all kode er konkret.
- **Type-konsistens:** `cardTint(colorKey)` definert i Step 3, brukt i Step 7 og testet i Step 1/5. `colorKey` = `combineSeverity(...)` gjenbrukes.

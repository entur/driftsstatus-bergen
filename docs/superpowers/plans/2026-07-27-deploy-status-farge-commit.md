# Fargede deploy-statuser + commit-melding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy-prikkene på tjenestekortene viser korrekt farge (grønn/gul/rød/grå), og hvert miljø viser commit-meldingens subjektlinje i stedet for kun SHA + ETU/PR-nummer.

**Architecture:** Tre isolerte endringer. (1) En ny farge-helper `dotColor(colorKey)` i `statusFormat.js` løser opp riktige `@entur/tokens`-verdier (`.deep`), og `ServiceCard` bruker den i stedet for den lokale `DOT`-tabellen med feil token-sti. (2) Collector (`deployEnvironments.js`) legger `commitMessage` (subjektlinje) inn i hvert env-objekt i `status.json`. (3) `EnvRow` i `ServiceCard` viser commit-subjektet ordbrutt og fjerner ETU/PR-referanselinja.

**Tech Stack:** React 19, Vite 8, Vitest 3, @testing-library/react, @entur/tokens, date-fns.

## Global Constraints

- Testrammeverk: **Vitest** (`import { describe, it, expect } from 'vitest'`). Kjør med `yarn test` (kjører `vitest run`).
- Komponenttester bruker `@testing-library/react` (`render`, `screen`) — se eksisterende `ServiceCard.test.jsx`.
- Norsk tekst i UI og testbeskrivelser, i tråd med eksisterende kode.
- Riktige token-verdier (verifisert i installert `@entur/tokens`): `semantic.fill.success.deep` = `#1a8e60`, `semantic.fill.warning.deep` = `#ffca28`, `semantic.fill.negative.deep` = `#d31b1b`. Nøytral/grå er hardkodet `#9aa0a6` (finnes ikke som semantic-token).
- `commitMessage` i `status.json` = **kun første linje** av commit-meldingen, trimmet. `null` når miljøet ikke har SHA.
- Bakoverkompatibilitet: frontend må tåle `status.json`-env-objekter uten `commitMessage`-felt (leses som `undefined` → linja utelates).

---

### Task 1: Farge-helper `dotColor` + bruk i ServiceCard

Retter fargebugen: dagens `DOT`-tabell slår opp `semantic.fill.*.default` som er `undefined` i installert `@entur/tokens`, så bare grå vises. Ny helper løser opp `.deep`-variantene og testes direkte (uten DOM).

**Files:**
- Modify: `src/lib/statusFormat.js` (legg til import av `semantic` + eksporter `dotColor`)
- Modify: `src/components/ServiceCard.jsx` (fjern lokal `DOT`, bruk `dotColor`)
- Test: `src/lib/statusFormat.test.js`

**Interfaces:**
- Consumes: `deployColorKey(state)` og `combineSeverity(deployState, healthState)` (finnes i `statusFormat.js`) → returnerer fargenøkkel `'success' | 'warning' | 'negative' | 'neutral'`.
- Produces: `dotColor(colorKey: 'success'|'warning'|'negative'|'neutral'): string` — returnerer en hex-fargestreng. Aldri `undefined`.

- [ ] **Step 1: Skriv den feilende testen**

Legg til i `src/lib/statusFormat.test.js` (og legg `dotColor` til import-linja øverst):

```js
import { isStale, deployLabel, deployColorKey, timeAgo, healthColorKey, combineSeverity, formatMs, formatPct, envStateLabel, deployRef, dotColor } from './statusFormat.js';
```

```js
describe('dotColor', () => {
    it('gir definert hex-farge for hver fargenøkkel', () => {
        for (const key of ['success', 'warning', 'negative', 'neutral']) {
            expect(dotColor(key)).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });
    it('gir riktige deploy-farger fra @entur/tokens', () => {
        expect(dotColor('success')).toBe('#1a8e60');
        expect(dotColor('warning')).toBe('#ffca28');
        expect(dotColor('negative')).toBe('#d31b1b');
        expect(dotColor('neutral')).toBe('#9aa0a6');
    });
    it('faller tilbake til nøytral grå for ukjent nøkkel', () => {
        expect(dotColor('finnesikke')).toBe('#9aa0a6');
    });
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `yarn test src/lib/statusFormat.test.js`
Expected: FAIL — `dotColor is not a function` / `is not exported`.

- [ ] **Step 3: Implementer `dotColor` i `statusFormat.js`**

Legg til øverst i `src/lib/statusFormat.js` (etter eksisterende importer):

```js
import { semantic } from '@entur/tokens';
```

Legg til nederst i `src/lib/statusFormat.js`:

```js
const DOT_COLORS = {
    success: semantic.fill.success.deep,
    warning: semantic.fill.warning.deep,
    negative: semantic.fill.negative.deep,
    neutral: '#9aa0a6'
};
export function dotColor(colorKey) {
    return DOT_COLORS[colorKey] ?? DOT_COLORS.neutral;
}
```

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `yarn test src/lib/statusFormat.test.js`
Expected: PASS (inkludert de nye `dotColor`-testene).

- [ ] **Step 5: Bytt ut `DOT` i `ServiceCard.jsx`**

I `src/components/ServiceCard.jsx`:

Endre import-linja fra `statusFormat.js` til å legge til `dotColor` (behold `deployColorKey`, `combineSeverity`, `envStateLabel`, `deployRef`, `formatMs`, `formatPct`, `timeAgo` — de brukes fortsatt i denne fila etter Task 1):

```js
import { dotColor, deployColorKey, combineSeverity, envStateLabel, deployRef, formatMs, formatPct, timeAgo } from '../lib/statusFormat.js';
```

Slett `import { semantic } from '@entur/tokens';` og hele `DOT`-objektet (linjene som definerer `const DOT = { ... }`).

I `EnvRow`, endre prikkens bakgrunn fra:

```js
<span style={{ width: 10, height: 10, borderRadius: '50%', background: DOT[deployColorKey(env.state)], flex: '0 0 auto' }} />
```

til:

```js
<span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor(deployColorKey(env.state)), flex: '0 0 auto' }} />
```

I `ServiceCard`, endre den kombinerte prikken fra:

```js
<span style={{ width: 16, height: 16, borderRadius: '50%', background: DOT[colorKey], flex: '0 0 auto' }} />
```

til:

```js
<span style={{ width: 16, height: 16, borderRadius: '50%', background: dotColor(colorKey), flex: '0 0 auto' }} />
```

- [ ] **Step 6: Kjør hele testsuiten og bekreft at alt passerer**

Run: `yarn test`
Expected: PASS — ingen eksisterende `ServiceCard`-test asserterer farge, så de skal fortsatt passere.

- [ ] **Step 7: Commit**

```bash
git add src/lib/statusFormat.js src/lib/statusFormat.test.js src/components/ServiceCard.jsx
git commit -m "fix: bruk .deep-tokens for deploy-prikker via dotColor-helper"
```

---

### Task 2: Collector legger `commitMessage` i env-objekt

Collector-en henter allerede commit-meldingen, men bruker den kun til ETU/PR-utledning. Nå tas subjektlinja med i `status.json`.

**Files:**
- Modify: `scripts/status/deployEnvironments.js:30-43` (`buildDeployEnvironment`)
- Test: `scripts/status/deployEnvironments.test.js`

**Interfaces:**
- Consumes: `firstLine(msg)` (finnes allerede som modul-privat helper i `deployEnvironments.js`).
- Produces: `buildDeployEnvironment(...)` returnerer nå objekt med ekstra felt `commitMessage: string | null` (trimmet første linje ved gyldig SHA, `null` ved manglende SHA).

- [ ] **Step 1: Oppdater eksisterende og skriv nye tester**

I `scripts/status/deployEnvironments.test.js`, oppdater `buildDeployEnvironment`-testene så de forventer `commitMessage`:

```js
describe('buildDeployEnvironment', () => {
    it('bygger objekt fra deployment med kort sha og referanser', () => {
        const env = buildDeployEnvironment({
            env: 'prd',
            sha: '965bd6012345',
            at: '2026-06-15T10:21:07Z',
            statusState: 'success',
            commitMessage: 'chore: Bump (ETU-73549) (#411)',
            url: 'https://x/log',
            repo: 'entur/products-api'
        });
        expect(env).toEqual({
            env: 'prd',
            state: 'success',
            sha: '965bd60',
            at: '2026-06-15T10:21:07Z',
            ticket: 'ETU-73549',
            pr: 411,
            commitMessage: 'chore: Bump (ETU-73549) (#411)',
            url: 'https://x/log'
        });
    });
    it('bruker kun første linje av commit-meldingen, trimmet', () => {
        const env = buildDeployEnvironment({
            env: 'prd',
            sha: 'abcdef012345',
            at: '2026-06-15T10:21:07Z',
            statusState: 'success',
            commitMessage: '  feat: legg til X  \n\nlengre body-tekst her',
            url: 'https://x/log',
            repo: 'entur/products-api'
        });
        expect(env.commitMessage).toBe('feat: legg til X');
    });
    it('gir unknown-objekt med commitMessage null når sha mangler', () => {
        const env = buildDeployEnvironment({ env: 'tst', sha: null, repo: 'entur/products-api' });
        expect(env).toEqual({
            env: 'tst',
            state: 'unknown',
            sha: null,
            at: null,
            ticket: null,
            pr: null,
            commitMessage: null,
            url: 'https://github.com/entur/products-api/deployments'
        });
    });
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `yarn test scripts/status/deployEnvironments.test.js`
Expected: FAIL — returnert objekt mangler `commitMessage` (toEqual-avvik).

- [ ] **Step 3: Legg `commitMessage` til i `buildDeployEnvironment`**

I `scripts/status/deployEnvironments.js`, endre `buildDeployEnvironment` (linje 30-43) til:

```js
export function buildDeployEnvironment({ env, sha, at, statusState, commitMessage, url, repo }) {
    if (!sha) {
        return { env, state: 'unknown', sha: null, at: null, ticket: null, pr: null, commitMessage: null, url: `https://github.com/${repo}/deployments` };
    }
    return {
        env,
        state: mapDeploymentState(statusState),
        sha: sha.slice(0, 7),
        at: at ?? null,
        ticket: extractTicket(commitMessage),
        pr: extractPr(commitMessage),
        commitMessage: firstLine(commitMessage).trim() || null,
        url: url || `https://github.com/${repo}/deployments`
    };
}
```

(`firstLine` finnes allerede lenger oppe i fila: `const firstLine = (msg) => (msg ?? '').split('\n')[0];`)

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `yarn test scripts/status/deployEnvironments.test.js`
Expected: PASS.

- [ ] **Step 5: Kjør hele testsuiten**

Run: `yarn test`
Expected: PASS — `buildStatus.test.js` bygger på `buildDeployEnvironment`; verifiser at ingenting brøt.

- [ ] **Step 6: Commit**

```bash
git add scripts/status/deployEnvironments.js scripts/status/deployEnvironments.test.js
git commit -m "feat: ta med commit-subjekt (commitMessage) i status.json per miljø"
```

---

### Task 3: EnvRow viser commit-subjekt og dropper ETU/PR-linja

Frontend viser commit-subjektet ordbrutt (maks 2 linjer) og fjerner den separate ETU/PR-referanselinja. SHA beholdes som lite teknisk anker.

**Files:**
- Modify: `src/components/ServiceCard.jsx` (`EnvRow`)
- Test: `src/components/ServiceCard.test.jsx`

**Interfaces:**
- Consumes: env-objekt med `commitMessage: string | null | undefined` (fra Task 2). `deployColorKey`, `dotColor`, `envStateLabel`, `timeAgo` fra `statusFormat.js`.
- Produces: ingen nye eksporter.

- [ ] **Step 1: Oppdater testfixtur og skriv nye tester**

I `src/components/ServiceCard.test.jsx`, utvid `deploy`-fixturet med `commitMessage` på hvert miljø:

```js
const deploy = {
    state: 'success',
    environments: [
        { env: 'prd', state: 'success', sha: '965bd60', at: '2026-06-15T10:21:07Z', ticket: 'ETU-73549', pr: 411, commitMessage: 'feat: øk timeout for katalog-oppslag', url: 'https://x/prd' },
        { env: 'tst', state: 'in_progress', sha: '6edc092', at: '2026-07-24T09:00:00Z', ticket: null, pr: 432, commitMessage: 'chore: bump avhengigheter', url: 'https://x/tst' },
        { env: 'dev', state: 'success', sha: '6edc092', at: '2026-07-24T08:00:00Z', ticket: null, pr: 432, commitMessage: 'chore: bump avhengigheter', url: 'https://x/dev' }
    ]
};
```

Erstatt testen `'viser ETU-nummer for prd og PR-fallback for dev'` med en test for commit-subjekt, og legg til en test for at ETU/PR-linja er borte:

```js
    it('viser commit-subjekt per miljø og ikke lenger ETU/PR-referanse', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        expect(screen.getByText('feat: øk timeout for katalog-oppslag')).toBeInTheDocument();
        expect(screen.getAllByText('chore: bump avhengigheter')).toHaveLength(2);
        expect(screen.queryByText('ETU-73549')).not.toBeInTheDocument();
        expect(screen.queryByText('PR: 432')).not.toBeInTheDocument();
    });

    it('utelater commit-linja når commitMessage mangler', () => {
        const noMsg = {
            state: 'unknown',
            environments: [
                { env: 'prd', state: 'unknown', sha: null, at: null, ticket: null, pr: null, commitMessage: null, url: 'https://x' },
                { env: 'tst', state: 'unknown', sha: null, at: null, ticket: null, pr: null, commitMessage: null, url: 'https://x' },
                { env: 'dev', state: 'unknown', sha: null, at: null, ticket: null, pr: null, commitMessage: null, url: 'https://x' }
            ]
        };
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: noMsg, health: unknownHealth }} />);
        expect(container.querySelectorAll('[data-testid="commit-subject"]')).toHaveLength(0);
    });
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `yarn test src/components/ServiceCard.test.jsx`
Expected: FAIL — commit-subjekt-tekst finnes ikke i DOM ennå; `ETU-73549`/`PR: 432` vises fortsatt.

- [ ] **Step 3: Oppdater `EnvRow` i `ServiceCard.jsx`**

Erstatt hele `EnvRow`-komponenten med:

```jsx
function EnvRow({ env, now }) {
    const secondary = env.state === 'success' ? timeAgo(env.at, now) : envStateLabel(env.state);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor(deployColorKey(env.state)), flex: '0 0 auto' }} />
                <Text variant="body" margin="none" style={{ fontWeight: 600, minWidth: 34 }}>{env.env.toUpperCase()}</Text>
                {env.sha && <Text variant="body" margin="none" style={{ fontFamily: 'monospace' }}>{env.sha}</Text>}
            </div>
            {secondary && <Text variant="caption" margin="none" style={{ marginLeft: 18 }}>{secondary}</Text>}
            {env.commitMessage && (
                <Text
                    variant="caption"
                    margin="none"
                    data-testid="commit-subject"
                    style={{
                        marginLeft: 18,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        opacity: 0.75
                    }}
                >
                    {env.commitMessage}
                </Text>
            )}
        </div>
    );
}
```

Fjern `deployRef` fra import-linja i `ServiceCard.jsx` (den brukes ikke lenger her):

```js
import { dotColor, deployColorKey, combineSeverity, envStateLabel, formatMs, formatPct, timeAgo } from '../lib/statusFormat.js';
```

(`deployRef` beholdes i `statusFormat.js` og dens egne tester — kun bruken i `EnvRow` fjernes.)

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `yarn test src/components/ServiceCard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Kjør hele testsuiten**

Run: `yarn test`
Expected: PASS.

- [ ] **Step 6: Verifiser visuelt i dev-server (valgfritt men anbefalt)**

Run: `yarn dev`
Sjekk at kortene viser fargede prikker (grønn prd, rød dev) og commit-subjekt under deploy-tid. Bruk live `status.json` fra `https://ent-statusber-prd.web.app/status.json` som referanse (denne mangler ennå `commitMessage`-feltet; commit-linja vil derfor være tom til collector-en har kjørt med Task 2 i produksjon — det er forventet og bakoverkompatibelt).

- [ ] **Step 7: Commit**

```bash
git add src/components/ServiceCard.jsx src/components/ServiceCard.test.jsx
git commit -m "feat: vis commit-subjekt per miljø, fjern ETU/PR-referanselinje"
```

---

## Notater

- **`deployRef`** blir ubrukt i UI etter Task 3, men beholdes med tester i `statusFormat.js` (fjerning er utenfor scope).
- **Produksjonsdata:** commit-linja er tom inntil collector-tjenesten har regenerert `status.json` med `commitMessage`-feltet (Task 2). Frontend er bakoverkompatibel og krasjer ikke på manglende felt.
- **Rekkefølge:** Task 1 er uavhengig. Task 2 (produserer `commitMessage`) bør før Task 3 (konsumerer det), men Task 3 sin test bruker eget fixtur og er ikke blokkert.

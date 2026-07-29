# ServiceCard v2 — helse i fokus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesigne tjenestekortet slik at hjerte (oppe + oppetid 15 min) og et kakediagram (2xx/4xx/5xx) er blikkfanget, med snitt responstid og en egen deploy-seksjon — kun prod.

**Architecture:** Ren frontend. `ServiceCard.jsx` skrives om til layout B (stor kake til venstre, hjerte + responstid i høyre kolonne, deploy nederst). En ny `PieChart.jsx` tegner kaka med `conic-gradient`. Rene hjelpefunksjoner i `statusFormat.js` leser de nye `metrics.window`/`metrics.lifetime`- og `health.uptime15m`-feltene med window-først/lifetime-fallback.

**Tech Stack:** React 18, `@entur/icons` (`HeartIcon`, `UploadIcon`), `@entur/typography`, `@entur/tokens`, Vitest + @testing-library/react.

## Global Constraints

- All ny brukervendt tekst er på norsk (bokmål).
- Metrikk leses **window først, lifetime fallback per felt** (`metrics.window.<felt>` hvis ikke `null`/`undefined`, ellers `metrics.lifetime.<felt>`, ellers `null`).
- Kun prod-miljøet vises på kortet. Ingen tst/dev-rader.
- Manglende data vises som `–` (tekst) eller grå/tom (kake/hjerte). Aldri kast på manglende felter.
- Farger hentes via `dotColor(colorKey)` fra `statusFormat.js` (som leser `@entur/tokens`) — ikke hardkodede hex-verdier i komponentene.
- Kjør tester med `yarn vitest run <sti>` (evt. `-t "<navn>"` for enkelttest).

---

## File Structure

- `src/lib/statusFormat.js` — **modify**: legg til `pickMetric`, `responseBreakdown`, `formatUptime15m`; fjern `successRate`, `metricColorKey`, `SUCCESS_RATE_THRESHOLDS`, `P95_THRESHOLDS`.
- `src/lib/statusFormat.test.js` — **modify**: legg til tester for nye funksjoner; fjern tester for slettede funksjoner.
- `src/components/PieChart.jsx` — **create**: SVG/`conic-gradient`-kake.
- `src/components/PieChart.test.jsx` — **create**.
- `src/components/ServiceCard.jsx` — **modify (omskriving)**: hero-rad + deploy-seksjon.
- `src/components/ServiceCard.test.jsx` — **modify (omskriving)**.

---

## Task 1: Nye hjelpefunksjoner i `statusFormat.js`

**Files:**
- Modify: `src/lib/statusFormat.js`
- Test: `src/lib/statusFormat.test.js`

**Interfaces:**
- Consumes: ingenting nytt (bruker eksisterende `formatMs`).
- Produces:
  - `pickMetric(metrics, field) → number | null` — `metrics.window[field]` hvis ikke null/undefined, ellers `metrics.lifetime[field]` hvis ikke null/undefined, ellers `null`. Null-sikker for `metrics === undefined/null`.
  - `responseBreakdown(metrics) → { ok: number, c4: number, c5: number } | null` — `c4 = pickMetric(metrics,'errorRate4xx')`, `c5 = pickMetric(metrics,'errorRate5xx')`; returnerer `null` hvis en av dem er `null`; ellers `ok = Math.max(0, 1 - c4 - c5)`.
  - `formatUptime15m(fraction) → string` — `null`/`undefined` → `'–'`; ellers `` `${Math.round(fraction * 100)} %` `` (1.0 → `'100 %'`).

- [ ] **Step 1: Skriv de feilende testene**

Legg til i `src/lib/statusFormat.test.js`. Utvid import-linja øverst med `pickMetric, responseBreakdown, formatUptime15m`.

```js
describe('pickMetric', () => {
    const metrics = { window: { avgMs: 71, errorRate4xx: 0, errorRate5xx: null }, lifetime: { avgMs: 60, errorRate4xx: 0.01, errorRate5xx: 0.002 } };
    it('bruker window når feltet finnes', () => {
        expect(pickMetric(metrics, 'avgMs')).toBe(71);
        expect(pickMetric(metrics, 'errorRate4xx')).toBe(0);
    });
    it('faller til lifetime når window-feltet er null', () => {
        expect(pickMetric(metrics, 'errorRate5xx')).toBe(0.002);
    });
    it('returnerer null når begge mangler', () => {
        expect(pickMetric({ window: {}, lifetime: {} }, 'avgMs')).toBeNull();
        expect(pickMetric(undefined, 'avgMs')).toBeNull();
        expect(pickMetric(null, 'avgMs')).toBeNull();
    });
});

describe('responseBreakdown', () => {
    it('regner ok/c4/c5 med window-først', () => {
        const m = { window: { errorRate4xx: 0.04, errorRate5xx: 0.02 } };
        expect(responseBreakdown(m)).toEqual({ ok: 0.94, c4: 0.04, c5: 0.02 });
    });
    it('faller til lifetime per felt', () => {
        const m = { window: { errorRate4xx: 0, errorRate5xx: null }, lifetime: { errorRate4xx: 0.1, errorRate5xx: 0.05 } };
        expect(responseBreakdown(m)).toEqual({ ok: 0.95, c4: 0, c5: 0.05 });
    });
    it('klamper ok til minst 0', () => {
        const m = { window: { errorRate4xx: 0.7, errorRate5xx: 0.5 } };
        expect(responseBreakdown(m).ok).toBe(0);
    });
    it('returnerer null når en rate mangler i begge vindu', () => {
        expect(responseBreakdown({ window: {}, lifetime: {} })).toBeNull();
        expect(responseBreakdown(undefined)).toBeNull();
    });
});

describe('formatUptime15m', () => {
    it('formatterer andel som heltallsprosent', () => {
        expect(formatUptime15m(1)).toBe('100 %');
        expect(formatUptime15m(0.933)).toBe('93 %');
    });
    it('null/undefined gir tankestrek', () => {
        expect(formatUptime15m(null)).toBe('–');
        expect(formatUptime15m(undefined)).toBe('–');
    });
});
```

- [ ] **Step 2: Kjør testene og bekreft at de feiler**

Run: `yarn vitest run src/lib/statusFormat.test.js -t "pickMetric"`
Expected: FAIL — `pickMetric is not a function` (og tilsvarende for de andre).

- [ ] **Step 3: Implementer funksjonene**

Legg til nederst i `src/lib/statusFormat.js`:

```js
export function pickMetric(metrics, field) {
    const w = metrics?.window?.[field];
    if (w !== null && w !== undefined) return w;
    const l = metrics?.lifetime?.[field];
    if (l !== null && l !== undefined) return l;
    return null;
}

export function responseBreakdown(metrics) {
    const c4 = pickMetric(metrics, 'errorRate4xx');
    const c5 = pickMetric(metrics, 'errorRate5xx');
    if (c4 === null || c5 === null) return null;
    return { ok: Math.max(0, 1 - c4 - c5), c4, c5 };
}

export function formatUptime15m(fraction) {
    if (fraction === null || fraction === undefined) return '–';
    return `${Math.round(fraction * 100)} %`;
}
```

- [ ] **Step 4: Kjør testene og bekreft at de passerer**

Run: `yarn vitest run src/lib/statusFormat.test.js`
Expected: PASS (alle, inkludert eksisterende).

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusFormat.js src/lib/statusFormat.test.js
git commit -m "feat: pickMetric, responseBreakdown og formatUptime15m i statusFormat"
```

---

## Task 2: `PieChart`-komponent

**Files:**
- Create: `src/components/PieChart.jsx`
- Test: `src/components/PieChart.test.jsx`

**Interfaces:**
- Consumes: `dotColor` fra `../lib/statusFormat.js`.
- Produces: `export default function PieChart({ breakdown, size = 118 })`
  - `breakdown` = `{ ok, c4, c5 }` (andeler 0..1) eller `null`.
  - Rendrer en `<div data-testid="pie">` med `conic-gradient`-bakgrunn: grønn `0 → ok`, gul `ok → ok+c4`, rød `ok+c4 → 100%`. Fargene fra `dotColor('success'|'warning'|'negative')`.
  - Setter data-attributter `data-ok`, `data-c4`, `data-c5` (avrundet til 4 desimaler som streng) for testbarhet.
  - `breakdown === null` → grå fylt sirkel (`dotColor('neutral')`), `data-empty="true"`, ingen data-ok/c4/c5.

- [ ] **Step 1: Skriv de feilende testene**

Opprett `src/components/PieChart.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PieChart from './PieChart.jsx';

describe('PieChart', () => {
    it('rendrer tre segmenter fra breakdown', () => {
        render(<PieChart breakdown={{ ok: 0.94, c4: 0.04, c5: 0.02 }} />);
        const pie = screen.getByTestId('pie');
        expect(pie.dataset.ok).toBe('0.94');
        expect(pie.dataset.c4).toBe('0.04');
        expect(pie.dataset.c5).toBe('0.02');
        expect(pie.style.background).toContain('conic-gradient');
    });
    it('viser grå tom ring når breakdown er null', () => {
        render(<PieChart breakdown={null} />);
        const pie = screen.getByTestId('pie');
        expect(pie.dataset.empty).toBe('true');
        expect(pie.dataset.ok).toBeUndefined();
    });
    it('respekterer size-prop', () => {
        render(<PieChart breakdown={null} size={80} />);
        const pie = screen.getByTestId('pie');
        expect(pie.style.width).toBe('80px');
        expect(pie.style.height).toBe('80px');
    });
});
```

- [ ] **Step 2: Kjør testene og bekreft at de feiler**

Run: `yarn vitest run src/components/PieChart.test.jsx`
Expected: FAIL — kan ikke løse `./PieChart.jsx`.

- [ ] **Step 3: Implementer komponenten**

Opprett `src/components/PieChart.jsx`:

```jsx
import React from 'react';
import { dotColor } from '../lib/statusFormat.js';

export default function PieChart({ breakdown, size = 118 }) {
    const base = { width: size, height: size, borderRadius: '50%', flex: '0 0 auto' };
    if (!breakdown) {
        return <div data-testid="pie" data-empty="true" style={{ ...base, background: dotColor('neutral') }} />;
    }
    const { ok, c4, c5 } = breakdown;
    const g = dotColor('success');
    const y = dotColor('warning');
    const r = dotColor('negative');
    const okEnd = ok * 100;
    const c4End = okEnd + c4 * 100;
    const round4 = (n) => String(Math.round(n * 10000) / 10000);
    return (
        <div
            data-testid="pie"
            data-ok={round4(ok)}
            data-c4={round4(c4)}
            data-c5={round4(c5)}
            style={{
                ...base,
                background: `conic-gradient(${g} 0 ${okEnd}%, ${y} ${okEnd}% ${c4End}%, ${r} ${c4End}% 100%)`
            }}
        />
    );
}
```

- [ ] **Step 4: Kjør testene og bekreft at de passerer**

Run: `yarn vitest run src/components/PieChart.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PieChart.jsx src/components/PieChart.test.jsx
git commit -m "feat: PieChart-komponent for responskode-fordeling"
```

---

## Task 3: Omskriv `ServiceCard` til layout B

**Files:**
- Modify (omskriving): `src/components/ServiceCard.jsx`
- Test (omskriving): `src/components/ServiceCard.test.jsx`

**Interfaces:**
- Consumes: `PieChart` (Task 2); `pickMetric`, `responseBreakdown`, `formatUptime15m` (Task 1); eksisterende `dotColor`, `cardTint`, `prdColorKey`, `healthColorKey`, `deployColorKey`, `formatMs`, `envStateLabel`, `timeAgo`.
- Produces: `export default function ServiceCard({ service, now = new Date() })` — uendret signatur.
  - Interne komponenter: `Heartbeat({ health })`, `ResponseTime({ metrics })`, `DeploySection({ env, now })`.
  - Hjerte-fargen legges på et wrapper-element `data-testid="heart"` via `style.color` (så tester kan lese den).

- [ ] **Step 1: Skriv de nye testene (omskriv testfila)**

Erstatt hele `src/components/ServiceCard.test.jsx` med:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';
import { dotColor, cardTint } from '../lib/statusFormat.js';

const now = new Date('2026-07-29T12:00:00Z');

const asRgb = (hex) => {
    if (hex === 'white') return 'white';
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const deploy = {
    state: 'success',
    environments: [
        { env: 'prd', state: 'success', sha: 'f731fea', at: '2026-07-23T11:35:49Z', commitMessage: 'ETU-74290: Add private_codes table (#1716)', url: 'https://x/prd' },
        { env: 'tst', state: 'success', sha: 'f731fea', at: '2026-07-23T10:37:03Z', commitMessage: 'ETU-74290: Add private_codes table (#1716)', url: 'https://x/tst' },
        { env: 'dev', state: 'failure', sha: '94752e5', at: '2026-07-27T07:01:17Z', commitMessage: 'Bump dep (#1764)', url: 'https://x/dev' }
    ]
};
const health = { state: 'up', up: true, uptime15m: 1 };
const metrics = { window: { avgMs: 71, errorRate4xx: 0.04, errorRate5xx: 0.02 }, lifetime: { avgMs: 60, errorRate4xx: 0.01, errorRate5xx: 0.002 } };

const svc = (over = {}) => ({ name: 'products-spring', repo: 'entur/products-spring', deploy, health, metrics, ...over });

describe('ServiceCard v2', () => {
    it('viser tjenestenavn, oppetid, snitt responstid og kake', () => {
        render(<ServiceCard now={now} service={svc()} />);
        expect(screen.getByText('products-spring')).toBeInTheDocument();
        expect(screen.getByText('Oppe')).toBeInTheDocument();
        expect(screen.getByText(/100 % oppe siste 15 min/)).toBeInTheDocument();
        expect(screen.getByText('71 ms')).toBeInTheDocument();
        expect(screen.getByTestId('pie').dataset.ok).toBe('0.94');
    });

    it('hjertefargen følger health.state', () => {
        const { rerender } = render(<ServiceCard now={now} service={svc({ health: { state: 'up', up: true, uptime15m: 1 } })} />);
        expect(screen.getByTestId('heart').style.color).toBe(asRgb(dotColor('success')));
        rerender(<ServiceCard now={now} service={svc({ health: { state: 'down', up: false, uptime15m: 0.2 } })} />);
        expect(screen.getByTestId('heart').style.color).toBe(asRgb(dotColor('negative')));
        rerender(<ServiceCard now={now} service={svc({ health: { state: 'unknown', up: null, uptime15m: null } })} />);
        expect(screen.getByTestId('heart').style.color).toBe(asRgb(dotColor('neutral')));
    });

    it('kaka bruker window og faller til lifetime per felt', () => {
        render(<ServiceCard now={now} service={svc({ metrics: { window: { avgMs: null, errorRate4xx: 0, errorRate5xx: null }, lifetime: { avgMs: 60, errorRate4xx: 0.1, errorRate5xx: 0.05 } } })} />);
        expect(screen.getByTestId('pie').dataset.c5).toBe('0.05');
        expect(screen.getByText('60 ms')).toBeInTheDocument();
    });

    it('viser tom kake og – når metrikk mangler', () => {
        render(<ServiceCard now={now} service={svc({ metrics: { window: {}, lifetime: {} } })} />);
        expect(screen.getByTestId('pie').dataset.empty).toBe('true');
        expect(screen.getByText('–')).toBeInTheDocument();
    });

    it('viser deploy-seksjon med upload-ikon, sha, tid og commit-melding', () => {
        const { container } = render(<ServiceCard now={now} service={svc()} />);
        const deploySec = container.querySelector('[data-testid="deploy"]');
        expect(deploySec).toBeInTheDocument();
        expect(deploySec.querySelector('svg')).toBeInTheDocument();
        expect(screen.getByText('f731fea')).toBeInTheDocument();
        expect(screen.getByText(/Deployet/)).toBeInTheDocument();
        expect(screen.getByText('ETU-74290: Add private_codes table (#1716)')).toBeInTheDocument();
    });

    it('viser kun prod — ingen tst/dev', () => {
        render(<ServiceCard now={now} service={svc()} />);
        expect(screen.queryByText('TST')).not.toBeInTheDocument();
        expect(screen.queryByText('DEV')).not.toBeInTheDocument();
        expect(screen.queryByText('94752e5')).not.toBeInTheDocument();
    });

    it('tinter kort-bakgrunnen etter prod-status', () => {
        const { container } = render(<ServiceCard now={now} service={svc({ deploy: { state: 'failure', environments: [{ env: 'prd', state: 'failure', sha: 'bbbbbbb', at: '2026-07-27T08:00:00Z', commitMessage: null, url: 'https://x' }] } })} />);
        expect(container.firstChild.style.background).toBe(asRgb(cardTint('negative')));
    });
});
```

- [ ] **Step 2: Kjør testene og bekreft at de feiler**

Run: `yarn vitest run src/components/ServiceCard.test.jsx`
Expected: FAIL (gammel komponent mangler `pie`/`heart`/`deploy`-testid og viser fortsatt TST/DEV).

- [ ] **Step 3: Omskriv komponenten**

Erstatt hele `src/components/ServiceCard.jsx` med:

```jsx
import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { HeartIcon, UploadIcon } from '@entur/icons';
import PieChart from './PieChart.jsx';
import {
    dotColor, cardTint, prdColorKey, healthColorKey, deployColorKey,
    pickMetric, responseBreakdown, formatUptime15m, formatMs,
    envStateLabel, timeAgo
} from '../lib/statusFormat.js';

function Heartbeat({ health }) {
    const color = dotColor(healthColorKey(health?.state));
    const label = health?.up === true ? 'Oppe' : health?.up === false ? 'Nede' : '–';
    const uptime = health?.uptime15m === null || health?.uptime15m === undefined
        ? 'oppetid ukjent siste 15 min'
        : `${formatUptime15m(health.uptime15m)} oppe siste 15 min`;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span data-testid="heart" style={{ color, display: 'flex' }}>
                <HeartIcon size={34} color={color} />
            </span>
            <div>
                <Text variant="body" margin="none" style={{ fontWeight: 800, fontSize: 18, color }}>{label}</Text>
                <Text variant="caption" margin="none" style={{ opacity: 0.8 }}>{uptime}</Text>
            </div>
        </div>
    );
}

function ResponseTime({ metrics }) {
    const avg = pickMetric(metrics, 'avgMs');
    return (
        <div>
            <Text variant="caption" margin="none" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.7 }}>Snitt responstid</Text>
            <Text variant="body" margin="none" style={{ fontWeight: 800, fontSize: 22 }}>{formatMs(avg)}</Text>
        </div>
    );
}

function Legend() {
    const item = (color, label) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />{label}
        </span>
    );
    return (
        <div style={{ display: 'flex', gap: 14, fontSize: 12, opacity: 0.8 }}>
            {item(dotColor('success'), '2xx')}
            {item(dotColor('warning'), '4xx')}
            {item(dotColor('negative'), '5xx')}
        </div>
    );
}

function DeploySection({ env, now }) {
    const secondary = env.state === 'success' ? `Deployet ${timeAgo(env.at, now)}` : envStateLabel(env.state);
    return (
        <div data-testid="deploy" style={{ borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UploadIcon size={20} color={dotColor(deployColorKey(env.state))} />
                {env.sha && <Text variant="body" margin="none" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{env.sha}</Text>}
                {secondary && <Text variant="body" margin="none" style={{ opacity: 0.85 }}>{secondary}</Text>}
            </div>
            {env.commitMessage && (
                <Text
                    variant="caption"
                    margin="none"
                    data-testid="commit-subject"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', opacity: 0.75 }}
                >
                    {env.commitMessage}
                </Text>
            )}
        </div>
    );
}

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy, health, metrics } = service;
    const prd = deploy.environments.find((e) => e.env === 'prd');
    return (
        <div style={{
            background: cardTint(prdColorKey(service)), borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 12, minHeight: 0
        }}>
            <Heading as="h3" variant="title-1" margin="none" style={{ fontSize: 28 }}>{service.name}</Heading>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <PieChart breakdown={responseBreakdown(metrics)} size={118} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                    <Heartbeat health={health} />
                    <ResponseTime metrics={metrics} />
                </div>
            </div>
            <Legend />
            {prd && <DeploySection env={prd} now={now} />}
        </div>
    );
}
```

- [ ] **Step 4: Kjør testene og bekreft at de passerer**

Run: `yarn vitest run src/components/ServiceCard.test.jsx`
Expected: PASS.

Merk: `screen.getByText('–')` i «tom kake»-testen forventer at nøyaktig ett element har teksten `–` (snitt responstid). Om et annet element også blir bare `–`, bytt til `getAllByText('–')`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ServiceCard.jsx src/components/ServiceCard.test.jsx
git commit -m "feat: ServiceCard v2 med hjerte, kake og deploy-seksjon (kun prod)"
```

---

## Task 4: Fjern død kode i `statusFormat.js`

Etter Task 3 refererer ingenting lenger til `successRate`, `metricColorKey`, `SUCCESS_RATE_THRESHOLDS` eller `P95_THRESHOLDS` (de leste døde `health.p95Ms`/`errorRate*`-felt).

**Files:**
- Modify: `src/lib/statusFormat.js`
- Modify: `src/lib/statusFormat.test.js`

**Interfaces:**
- Consumes: —
- Produces: `statusFormat.js` uten de fire eksportene.

- [ ] **Step 1: Bekreft at ingenting bruker dem**

Run: `grep -rn "successRate\|metricColorKey\|SUCCESS_RATE_THRESHOLDS\|P95_THRESHOLDS" src`
Expected: kun treff i `src/lib/statusFormat.js` og `src/lib/statusFormat.test.js`. (Hvis andre filer dukker opp, stopp og rydd der først.)

- [ ] **Step 2: Fjern funksjonene og tersklene**

I `src/lib/statusFormat.js`, slett `export function successRate(...)`, `export const SUCCESS_RATE_THRESHOLDS`, `export const P95_THRESHOLDS` og `export function metricColorKey(...)` (linjene 96–117 i dagens fil — hele blokka fra `export function successRate` til slutten av `metricColorKey`).

- [ ] **Step 3: Fjern tilhørende tester**

I `src/lib/statusFormat.test.js`: slett `describe('successRate', ...)` og `describe('metricColorKey', ...)`, og fjern `successRate, metricColorKey, SUCCESS_RATE_THRESHOLDS, P95_THRESHOLDS` fra import-linja øverst.

- [ ] **Step 4: Kjør hele testsuiten**

Run: `yarn vitest run`
Expected: PASS — ingen referanser til fjernet kode, alle tester grønne.

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusFormat.js src/lib/statusFormat.test.js
git commit -m "chore: fjern død suksessrate/p95-terskelkode fra statusFormat"
```

---

## Self-Review

**Spec-dekning:**
- Hjerte (oppe + oppetid 15 min) → Task 3 `Heartbeat`, Task 1 `formatUptime15m`. ✔
- Kake 2xx/4xx/5xx (window→lifetime) → Task 2 `PieChart`, Task 1 `responseBreakdown`/`pickMetric`. ✔
- Snitt responstid → Task 3 `ResponseTime`, Task 1 `pickMetric('avgMs')`. ✔
- Deploy-seksjon med upload-ikon, sha, tid, commit → Task 3 `DeploySection`. ✔
- Kun prod → Task 3 (finner prd, ingen andre rader) + test. ✔
- Hjerte + kake mest fokus (layout B) → Task 3 hero-rad. ✔
- Kortbakgrunn tintes etter prod-status → beholdt `prdColorKey`/`cardTint` + test. ✔
- Fjerne død kode (`successRate` m.fl.) → Task 4. ✔
- Null-sikkerhet for tjenester uten metrics/health → `pickMetric`/`responseBreakdown` returnerer null; `Heartbeat` bruker `?.`. ✔

**Placeholder-skann:** Ingen TBD/TODO; all kode er konkret.

**Type-konsistens:** `responseBreakdown` → `{ok,c4,c5}` konsumeres som `breakdown`-prop i `PieChart`; `pickMetric(metrics, field)`-signaturen er lik i alle tasks; `formatUptime15m` brukes i `Heartbeat`. Konsistent.

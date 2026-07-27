# ServiceCard-redesign med helse-indikatorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesigne tjenestekortet slik at prod-status fremheves, helse vises som tre fargede ikon-indikatorer under navnet, og test/dev vises kompakt.

**Architecture:** To lag. `statusFormat.js` får rene hjelpefunksjoner (suksessrate, terskel→farge, prd-basert tint). `ServiceCard.jsx` bygges om til: navn → helse-indikatorrad (Heart/Like/Measure) → fremhevet PROD-blokk → kompakte TST/DEV-rader. All farge går via eksisterende `dotColor`/`cardTint`.

**Tech Stack:** React (JSX), Vite, Vitest + @testing-library/react, `@entur/icons` (v8.4.6), `@entur/typography/beta`, `@entur/tokens`.

## Global Constraints

- Testkommando: `yarn test` (kjører `vitest run`). Enkelttest: `yarn vitest run <fil> -t "<navn>"`.
- Norsk (bokmål) i all bruker-tekst og commit-meldinger.
- Ikoner importeres fra `@entur/icons` (ikke `/beta`). Typografi fra `@entur/typography/beta`.
- Ingen endringer i collector / `stacolber`. "Commits bak HEAD" og egen responstid er utenfor scope.
- Farger hentes kun via `dotColor(colorKey)` / `cardTint(colorKey)` — ingen nye hardkodede farger.
- Prosent formateres med `formatPct` (komma-desimal), millisekunder med `formatMs`.

---

### Task 1: Hjelpefunksjoner i statusFormat.js

**Files:**
- Modify: `src/lib/statusFormat.js`
- Test: `src/lib/statusFormat.test.js`

**Interfaces:**
- Consumes: eksisterende `combineSeverity(deployState, healthState)`, `healthColorKey(state)` fra samme fil.
- Produces:
  - `successRate(health) → number | null` — `1 - errorRate4xx - errorRate5xx`, eller `null` hvis en av ratene er `null`/`undefined`.
  - `metricColorKey(value, thresholds) → 'success' | 'warning' | 'negative' | 'neutral'`.
  - Konstanter `SUCCESS_RATE_THRESHOLDS = { good: 0.995, warn: 0.99, higherIsBetter: true }` og `P95_THRESHOLDS = { good: 300, warn: 800, higherIsBetter: false }`.
  - `prdColorKey(service) → colorKey` — kombinerer prd-miljøets deploy-state med `health.state` via `combineSeverity`; `'neutral'` hvis prd mangler.

- [ ] **Step 1: Skriv de feilende testene**

Legg til i `src/lib/statusFormat.test.js` (behold eksisterende innhold og importer):

```js
import {
    successRate,
    metricColorKey,
    prdColorKey,
    SUCCESS_RATE_THRESHOLDS,
    P95_THRESHOLDS
} from './statusFormat.js';

describe('successRate', () => {
    it('regner ut andelen som ikke er 4xx/5xx', () => {
        expect(successRate({ errorRate4xx: 0.011, errorRate5xx: 0.002 })).toBeCloseTo(0.987, 5);
    });
    it('returnerer null når en rate mangler', () => {
        expect(successRate({ errorRate4xx: null, errorRate5xx: 0.002 })).toBeNull();
        expect(successRate({ errorRate4xx: 0.01, errorRate5xx: undefined })).toBeNull();
    });
});

describe('metricColorKey', () => {
    it('higherIsBetter: grønn/gul/rød etter terskel', () => {
        expect(metricColorKey(0.999, SUCCESS_RATE_THRESHOLDS)).toBe('success');
        expect(metricColorKey(0.995, SUCCESS_RATE_THRESHOLDS)).toBe('success');
        expect(metricColorKey(0.992, SUCCESS_RATE_THRESHOLDS)).toBe('warning');
        expect(metricColorKey(0.98, SUCCESS_RATE_THRESHOLDS)).toBe('negative');
    });
    it('lowerIsBetter: grønn/gul/rød etter terskel', () => {
        expect(metricColorKey(142, P95_THRESHOLDS)).toBe('success');
        expect(metricColorKey(300, P95_THRESHOLDS)).toBe('success');
        expect(metricColorKey(500, P95_THRESHOLDS)).toBe('warning');
        expect(metricColorKey(1200, P95_THRESHOLDS)).toBe('negative');
    });
    it('returnerer neutral for null/undefined', () => {
        expect(metricColorKey(null, P95_THRESHOLDS)).toBe('neutral');
        expect(metricColorKey(undefined, SUCCESS_RATE_THRESHOLDS)).toBe('neutral');
    });
});

describe('prdColorKey', () => {
    const mk = (prdState, healthState) => ({
        deploy: { environments: [{ env: 'prd', state: prdState }, { env: 'dev', state: 'failure' }] },
        health: { state: healthState }
    });
    it('bruker prd-miljøet, ikke dev', () => {
        expect(prdColorKey(mk('success', 'unknown'))).toBe('success');
        expect(prdColorKey(mk('failure', 'unknown'))).toBe('negative');
    });
    it('kombinerer med helse-state (verste vinner)', () => {
        expect(prdColorKey(mk('success', 'down'))).toBe('negative');
    });
    it('neutral når prd mangler', () => {
        expect(prdColorKey({ deploy: { environments: [{ env: 'dev', state: 'success' }] }, health: { state: 'unknown' } })).toBe('neutral');
    });
});
```

- [ ] **Step 2: Kjør testene og bekreft at de feiler**

Run: `yarn vitest run src/lib/statusFormat.test.js`
Expected: FAIL — `successRate is not a function` / `metricColorKey is not a function` / `prdColorKey is not a function`.

- [ ] **Step 3: Implementer funksjonene**

Legg til nederst i `src/lib/statusFormat.js`:

```js
export function successRate(health) {
    const r4 = health?.errorRate4xx;
    const r5 = health?.errorRate5xx;
    if (r4 === null || r4 === undefined || r5 === null || r5 === undefined) return null;
    return 1 - r4 - r5;
}

export const SUCCESS_RATE_THRESHOLDS = { good: 0.995, warn: 0.99, higherIsBetter: true };
export const P95_THRESHOLDS = { good: 300, warn: 800, higherIsBetter: false };

export function metricColorKey(value, thresholds) {
    if (value === null || value === undefined) return 'neutral';
    const { good, warn, higherIsBetter } = thresholds;
    if (higherIsBetter) {
        if (value >= good) return 'success';
        if (value >= warn) return 'warning';
        return 'negative';
    }
    if (value <= good) return 'success';
    if (value <= warn) return 'warning';
    return 'negative';
}

export function prdColorKey(service) {
    const prd = service.deploy.environments.find((e) => e.env === 'prd');
    if (!prd) return 'neutral';
    return combineSeverity(prd.state, service.health.state);
}
```

- [ ] **Step 4: Kjør testene og bekreft at de passerer**

Run: `yarn vitest run src/lib/statusFormat.test.js`
Expected: PASS (alle, inkl. de eksisterende).

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusFormat.js src/lib/statusFormat.test.js
git commit -m "feat: hjelpefunksjoner for suksessrate, metrikk-farge og prd-tint"
```

---

### Task 2: Redesign av ServiceCard

**Files:**
- Modify: `src/components/ServiceCard.jsx`
- Test: `src/components/ServiceCard.test.jsx`

**Interfaces:**
- Consumes fra Task 1: `successRate`, `metricColorKey`, `prdColorKey`, `SUCCESS_RATE_THRESHOLDS`, `P95_THRESHOLDS`. Fra før: `dotColor`, `cardTint`, `healthColorKey`, `formatMs`, `formatPct`, `timeAgo`, `envStateLabel`.
- Produces: uendret komponent-API — `ServiceCard({ service, now })`.

Layout etter redesign: navn → `data-testid="health-row"` med tre indikatorer (Heart uten verdi, Like med suksessrate-%, Measure med p95) → fremhevet prd-rad (14px prikk, commit-melding) → kompakte tst/dev-rader (8px prikk, ingen commit-melding).

- [ ] **Step 1: Oppdater/erstatt testene til å matche ny layout**

Erstatt innholdet i `src/components/ServiceCard.test.jsx` med:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';
import { dotColor, cardTint } from '../lib/statusFormat.js';

const now = new Date('2026-07-24T10:00:00Z');

const deploy = {
    state: 'success',
    environments: [
        { env: 'prd', state: 'success', sha: '965bd60', at: '2026-06-15T10:21:07Z', commitMessage: 'feat: øk timeout for katalog-oppslag', url: 'https://x/prd' },
        { env: 'tst', state: 'in_progress', sha: '6edc092', at: '2026-07-24T09:00:00Z', commitMessage: 'chore: bump avhengigheter', url: 'https://x/tst' },
        { env: 'dev', state: 'success', sha: '6edc092', at: '2026-07-24T08:00:00Z', commitMessage: 'chore: bump avhengigheter', url: 'https://x/dev' }
    ]
};
const unknownHealth = { state: 'unknown', up: null, p95Ms: null, errorRate5xx: null, errorRate4xx: null };
const upHealth = { state: 'up', up: true, p95Ms: 142, errorRate5xx: 0.002, errorRate4xx: 0.011 };

const asRgb = (hex) => {
    if (hex === 'white') return 'white';
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('ServiceCard', () => {
    it('viser tjenestenavn og alle tre miljøene', () => {
        render(<ServiceCard now={now} service={{ name: 'products-api', repo: 'entur/products-api', deploy, health: unknownHealth }} />);
        expect(screen.getByText('products-api')).toBeInTheDocument();
        expect(screen.getByText('PRD')).toBeInTheDocument();
        expect(screen.getByText('TST')).toBeInTheDocument();
        expect(screen.getByText('DEV')).toBeInTheDocument();
        expect(screen.getByText('965bd60')).toBeInTheDocument();
        expect(screen.getAllByText('6edc092')).toHaveLength(2);
    });

    it('viser helse-indikatorraden med tre ikoner', () => {
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: upHealth }} />);
        const row = container.querySelector('[data-testid="health-row"]');
        expect(row).toBeInTheDocument();
        expect(row.querySelectorAll('svg')).toHaveLength(3);
    });

    it('viser suksessrate og p95 som verdier (ikke 4xx/5xx-tekst)', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: upHealth }} />);
        // suksessrate = 1 - 0,011 - 0,002 = 0,987
        expect(screen.getByText('98,7 %')).toBeInTheDocument();
        expect(screen.getByText('142 ms')).toBeInTheDocument();
        expect(screen.queryByText(/5xx/)).not.toBeInTheDocument();
        expect(screen.queryByText(/4xx/)).not.toBeInTheDocument();
    });

    it('viser – for verdiene når helse er unknown', () => {
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        const row = container.querySelector('[data-testid="health-row"]');
        expect(row.textContent).toContain('–');
    });

    it('viser commit-melding kun for prd, ikke for tst/dev', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        expect(screen.getByText('feat: øk timeout for katalog-oppslag')).toBeInTheDocument();
        expect(screen.queryByText('chore: bump avhengigheter')).not.toBeInTheDocument();
    });

    it('fremhever prd-prikken (14px) og gjør tst/dev kompakte (8px)', () => {
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        const dots = [...container.querySelectorAll('span')].filter((s) => s.style.borderRadius === '50%');
        const big = dots.filter((s) => s.style.width === '14px');
        const small = dots.filter((s) => s.style.width === '8px');
        expect(big).toHaveLength(1);
        expect(small).toHaveLength(2);
    });

    it('viser statustekst for in_progress i kompakt rad', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        expect(screen.getByText('deployer …')).toBeInTheDocument();
    });

    it('tinter kort-bakgrunnen etter prd-status', () => {
        const successDeploy = { state: 'success', environments: [{ env: 'prd', state: 'success', sha: 'aaaaaaa', at: '2026-06-15T10:21:07Z', commitMessage: null, url: 'https://x' }] };
        const failDeploy = { state: 'failure', environments: [{ env: 'prd', state: 'failure', sha: 'bbbbbbb', at: '2026-07-24T08:00:00Z', commitMessage: null, url: 'https://x' }] };
        const unknownDeploy = { state: 'unknown', environments: [{ env: 'prd', state: 'unknown', sha: null, at: null, commitMessage: null, url: 'https://x' }] };

        const { container: cS } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: successDeploy, health: unknownHealth }} />);
        expect(cS.firstChild.style.background).toBe(asRgb(cardTint('success')));
        const { container: cF } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: failDeploy, health: unknownHealth }} />);
        expect(cF.firstChild.style.background).toBe(asRgb(cardTint('negative')));
        const { container: cU } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: unknownDeploy, health: unknownHealth }} />);
        expect(cU.firstChild.style.background).toBe('white');
    });
});
```

- [ ] **Step 2: Kjør testene og bekreft at de feiler**

Run: `yarn vitest run src/components/ServiceCard.test.jsx`
Expected: FAIL — ny layout finnes ikke ennå (mangler `health-row`, `98,7 %`, 14px/8px-prikker, commit kun for prd).

- [ ] **Step 3: Skriv om ServiceCard.jsx**

Erstatt hele `src/components/ServiceCard.jsx` med:

```jsx
import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { HeartIcon, LikeIcon, MeasureIcon } from '@entur/icons';
import {
    dotColor, cardTint, prdColorKey, healthColorKey, deployColorKey,
    successRate, metricColorKey, SUCCESS_RATE_THRESHOLDS, P95_THRESHOLDS,
    formatMs, formatPct, envStateLabel, timeAgo
} from '../lib/statusFormat.js';

function HealthIndicator({ Icon, value, colorKey }) {
    const color = dotColor(colorKey);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon size={26} color={color} />
            {value !== undefined && (
                <Text variant="body" margin="none" style={{ color, fontWeight: 700 }}>{value}</Text>
            )}
        </div>
    );
}

function HealthIndicatorRow({ health }) {
    const sr = successRate(health);
    return (
        <div data-testid="health-row" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <HealthIndicator Icon={HeartIcon} colorKey={healthColorKey(health.state)} />
            <HealthIndicator
                Icon={LikeIcon}
                value={sr === null ? '–' : formatPct(sr)}
                colorKey={metricColorKey(sr, SUCCESS_RATE_THRESHOLDS)}
            />
            <HealthIndicator
                Icon={MeasureIcon}
                value={formatMs(health.p95Ms)}
                colorKey={metricColorKey(health.p95Ms, P95_THRESHOLDS)}
            />
        </div>
    );
}

function ProdRow({ env, now }) {
    const secondary = env.state === 'success' ? `Deployet ${timeAgo(env.at, now)}` : envStateLabel(env.state);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: dotColor(deployColorKey(env.state)), flex: '0 0 auto' }} />
                <Text variant="body" margin="none" style={{ fontWeight: 700, minWidth: 40, fontSize: 18 }}>PRD</Text>
                {env.sha && <Text variant="body" margin="none" style={{ fontFamily: 'monospace', fontSize: 18 }}>{env.sha}</Text>}
            </div>
            {secondary && <Text variant="body" margin="none" style={{ marginLeft: 24, fontWeight: 600 }}>{secondary}</Text>}
            {env.commitMessage && (
                <Text
                    variant="caption"
                    margin="none"
                    data-testid="commit-subject"
                    style={{ marginLeft: 24, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', opacity: 0.8 }}
                >
                    {env.commitMessage}
                </Text>
            )}
        </div>
    );
}

function CompactRow({ env, now }) {
    const secondary = env.state === 'success' ? timeAgo(env.at, now) : envStateLabel(env.state);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.85 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(deployColorKey(env.state)), flex: '0 0 auto' }} />
            <Text variant="caption" margin="none" style={{ fontWeight: 600, minWidth: 30 }}>{env.env.toUpperCase()}</Text>
            {env.sha && <Text variant="caption" margin="none" style={{ fontFamily: 'monospace' }}>{env.sha}</Text>}
            {secondary && <Text variant="caption" margin="none" style={{ opacity: 0.75 }}>{secondary}</Text>}
        </div>
    );
}

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy, health } = service;
    const prd = deploy.environments.find((e) => e.env === 'prd');
    const others = deploy.environments.filter((e) => e.env !== 'prd');
    return (
        <div style={{
            background: cardTint(prdColorKey(service)), borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 12, minHeight: 0
        }}>
            <Heading as="h3" variant="title-1" margin="none" style={{ fontSize: 30 }}>{service.name}</Heading>
            <HealthIndicatorRow health={health} />
            {prd && <ProdRow env={prd} now={now} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {others.map((env) => <CompactRow key={env.env} env={env} now={now} />)}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Kjør komponent-testene og bekreft at de passerer**

Run: `yarn vitest run src/components/ServiceCard.test.jsx`
Expected: PASS (alle).

- [ ] **Step 5: Kjør hele testsuiten**

Run: `yarn test`
Expected: PASS — ingen regresjon i øvrige tester.

- [ ] **Step 6: Commit**

```bash
git add src/components/ServiceCard.jsx src/components/ServiceCard.test.jsx
git commit -m "feat: redesign ServiceCard med helse-indikatorer og fremhevet prod"
```

---

### Task 3: Visuell verifisering i appen

**Files:** ingen kodeendringer (kun verifisering).

- [ ] **Step 1: Bygg for å fange type-/import-feil**

Run: `yarn build`
Expected: bygger uten feil.

- [ ] **Step 2: Verifiser visuelt**

Start `yarn dev` og bekreft i nettleser:
- Tre ikoner (hjerte, tommel, målebånd) vises under navnet, grå med `–` (helse er `unknown` i live-data).
- PRD-blokken er tydelig størst; TST/DEV er mindre og dempet.
- Prd-fargede kort-bakgrunner matcher prd deploy-status (grønn/rød/hvit).

Ingen commit — dette er en verifiseringsoppgave.

---

## Self-Review

**Spec coverage:**
- Prod fremheves → Task 2 (ProdRow, 14px, prd-tint). ✓
- 3 indikatorer under navnet (Heart/Like/Measure) → Task 2 (HealthIndicatorRow). ✓
- Like = suksessrate (ikke 4xx/5xx) → Task 1 `successRate`, Task 2 visning. ✓
- Én latens-indikator (p95, klokke droppet) → Task 2 (kun Measure). ✓
- Grønn/gul/rød/grå → Task 1 `metricColorKey` + `healthColorKey`. ✓
- Tst/dev kompakt, ingen commit-melding → Task 2 (CompactRow). ✓
- Prd-basert tint → Task 1 `prdColorKey`. ✓
- Grått/`–` ved unknown → Task 1 (neutral/null) + Task 2-test. ✓
- Utelat commits-bak-head / egen responstid → ikke implementert (utenfor scope). ✓

**Placeholder scan:** ingen TBD/TODO; all kode er konkret.

**Type consistency:** `successRate`, `metricColorKey`, `prdColorKey`, `SUCCESS_RATE_THRESHOLDS`, `P95_THRESHOLDS` er definert i Task 1 og brukt med samme navn/signatur i Task 2. `deployColorKey` og `healthColorKey` finnes fra før i `statusFormat.js`.

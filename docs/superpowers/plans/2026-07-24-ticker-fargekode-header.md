# Fargekodet ticker og forenklet header – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forenkle headeren til kun Entur-logoen, og bytt driftsstatus-tickeren til Statuspage JSON-API med fargekode (grønn/gul/rød) og en fast «Driftsstatus»-etikett.

**Architecture:** Nytt datalag `src/lib/statusFeed.js` med rene funksjoner (`parseStatusFeed`, `utledOverall`) + tynn `fetchStatusFeed`-wrapper. `StatusTicker` får nye props (`messages`, `overall`) og fargekodes. `App.jsx` forenkler headeren og bytter datakilde.

**Tech Stack:** React 19, Vite 7, Vitest 2, @testing-library/react, @entur/* komponenter.

## Global Constraints

- Testkjøring: `yarn test` (vitest run). Enkelttest: `yarn vitest run <fil>`.
- Rene, testbare funksjoner skilles fra fetch/DOM (samme mønster som `parseRssTitles`/`fetchStatus`).
- Ved feil skal forrige visning beholdes; ingen krasj (mønster fra dagens `App.jsx`).
- Fail-safe: ugyldig/uventet data gir `{ messages: [], overall: 'green' }`.
- Norsk brukertekst.

---

### Task 1: Datalag – `parseStatusFeed` og `utledOverall`

**Files:**
- Create: `src/lib/statusFeed.js`
- Test: `src/lib/statusFeed.test.js`

**Interfaces:**
- Produces:
  - `utledOverall(messages: {title: string, kind: 'ongoing'|'planned'}[]) => 'red'|'yellow'|'green'`
  - `parseStatusFeed(json: object) => { messages: {title: string, kind: 'ongoing'|'planned'}[], overall: 'red'|'yellow'|'green' }`

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/statusFeed.test.js
import { describe, it, expect } from 'vitest';
import { parseStatusFeed, utledOverall } from './statusFeed.js';

describe('utledOverall', () => {
    it('gir green for tom liste', () => {
        expect(utledOverall([])).toBe('green');
    });
    it('gir yellow når kun planlagt', () => {
        expect(utledOverall([{ title: 'Vedlikehold', kind: 'planned' }])).toBe('yellow');
    });
    it('gir red når minst én pågående', () => {
        expect(utledOverall([{ title: 'Feil', kind: 'ongoing' }])).toBe('red');
    });
    it('prioriterer red over yellow ved blanding', () => {
        expect(utledOverall([
            { title: 'Vedlikehold', kind: 'planned' },
            { title: 'Feil', kind: 'ongoing' },
        ])).toBe('red');
    });
});

describe('parseStatusFeed', () => {
    it('tar uløste hendelser som ongoing og gir red', () => {
        const json = {
            incidents: [{ name: 'Problemer med billettering', status: 'investigating' }],
            scheduled_maintenances: [],
        };
        const r = parseStatusFeed(json);
        expect(r.messages).toEqual([{ title: 'Problemer med billettering', kind: 'ongoing' }]);
        expect(r.overall).toBe('red');
    });
    it('tar kommende og aktivt vedlikehold som planned og gir yellow', () => {
        const json = {
            incidents: [],
            scheduled_maintenances: [
                { name: 'Planlagt vedlikehold', status: 'scheduled' },
                { name: 'Pågående vedlikehold', status: 'in_progress' },
            ],
        };
        const r = parseStatusFeed(json);
        expect(r.messages).toEqual([
            { title: 'Planlagt vedlikehold', kind: 'planned' },
            { title: 'Pågående vedlikehold', kind: 'planned' },
        ]);
        expect(r.overall).toBe('yellow');
    });
    it('filtrerer bort løste hendelser og fullført vedlikehold', () => {
        const json = {
            incidents: [{ name: 'Løst', status: 'resolved' }],
            scheduled_maintenances: [{ name: 'Ferdig', status: 'completed' }],
        };
        const r = parseStatusFeed(json);
        expect(r.messages).toEqual([]);
        expect(r.overall).toBe('green');
    });
    it('er fail-safe for tomt/ugyldig objekt', () => {
        expect(parseStatusFeed(null)).toEqual({ messages: [], overall: 'green' });
        expect(parseStatusFeed({})).toEqual({ messages: [], overall: 'green' });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/lib/statusFeed.test.js`
Expected: FAIL – «Failed to resolve import './statusFeed.js'» / funksjoner ikke definert.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/statusFeed.js
const RESOLVED_INCIDENT = new Set(['resolved', 'postmortem']);
const DONE_MAINTENANCE = new Set(['completed']);

export function utledOverall(messages) {
    if (messages.some((m) => m.kind === 'ongoing')) return 'red';
    if (messages.some((m) => m.kind === 'planned')) return 'yellow';
    return 'green';
}

export function parseStatusFeed(json) {
    if (!json || typeof json !== 'object') {
        return { messages: [], overall: 'green' };
    }
    const incidents = Array.isArray(json.incidents) ? json.incidents : [];
    const maintenances = Array.isArray(json.scheduled_maintenances) ? json.scheduled_maintenances : [];

    const messages = [];
    for (const inc of incidents) {
        if (!RESOLVED_INCIDENT.has(inc.status)) {
            messages.push({ title: inc.name ?? '', kind: 'ongoing' });
        }
    }
    for (const m of maintenances) {
        if (!DONE_MAINTENANCE.has(m.status)) {
            messages.push({ title: m.name ?? '', kind: 'planned' });
        }
    }
    return { messages, overall: utledOverall(messages) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run src/lib/statusFeed.test.js`
Expected: PASS (alle 8 tester).

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusFeed.js src/lib/statusFeed.test.js
git commit -m "feat: statusFeed – parseStatusFeed og utledOverall"
```

---

### Task 2: `fetchStatusFeed` – henter og parser summary.json

**Files:**
- Modify: `src/lib/statusFeed.js` (legg til `fetchStatusFeed` nederst)
- Test: `src/lib/statusFeed.test.js` (legg til describe-blokk)

**Interfaces:**
- Consumes: `parseStatusFeed` fra Task 1.
- Produces: `fetchStatusFeed(url: string, fetchImpl = fetch) => Promise<{ messages, overall }>`

- [ ] **Step 1: Write the failing test**

Legg til i `src/lib/statusFeed.test.js`:

```js
import { fetchStatusFeed } from './statusFeed.js';

describe('fetchStatusFeed', () => {
    it('henter og parser summary.json', async () => {
        const fakeFetch = async () => ({
            ok: true,
            json: async () => ({
                incidents: [{ name: 'Feil', status: 'investigating' }],
                scheduled_maintenances: [],
            }),
        });
        const r = await fetchStatusFeed('/x', fakeFetch);
        expect(r.overall).toBe('red');
        expect(r.messages).toHaveLength(1);
    });
    it('kaster ved ikke-ok respons', async () => {
        const fakeFetch = async () => ({ ok: false, status: 503 });
        await expect(fetchStatusFeed('/x', fakeFetch)).rejects.toThrow();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run src/lib/statusFeed.test.js`
Expected: FAIL – `fetchStatusFeed is not a function`.

- [ ] **Step 3: Write minimal implementation**

Legg til nederst i `src/lib/statusFeed.js`:

```js
export async function fetchStatusFeed(url, fetchImpl = fetch) {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`summary.json ${res.status}`);
    const data = await res.json();
    return parseStatusFeed(data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run src/lib/statusFeed.test.js`
Expected: PASS (alle tester, inkl. de nye).

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusFeed.js src/lib/statusFeed.test.js
git commit -m "feat: fetchStatusFeed henter summary.json"
```

---

### Task 3: `StatusTicker` – fast etikett + fargekode

**Files:**
- Modify: `src/components/StatusTicker.jsx` (full omskriving)
- Modify: `src/css/main.css` (ticker-stiler)
- Test: `src/components/StatusTicker.test.jsx` (erstatt innhold)

**Interfaces:**
- Consumes: `{ messages: {title, kind}[], overall: 'red'|'yellow'|'green' }` fra Task 1/2.
- Produces: `<StatusTicker messages={...} overall={...} />`

- [ ] **Step 1: Write the failing tests (erstatt filinnhold)**

```jsx
// src/components/StatusTicker.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusTicker from './StatusTicker.jsx';

describe('StatusTicker', () => {
    it('viser alltid den faste Driftsstatus-etiketten', () => {
        render(<StatusTicker messages={[]} overall="green" />);
        expect(screen.getByText('Driftsstatus')).toBeInTheDocument();
    });
    it('viser standardtekst når det ikke er avvik', () => {
        render(<StatusTicker messages={[]} overall="green" />);
        expect(screen.getByText(/ingen avvik/i)).toBeInTheDocument();
    });
    it('viser meldingstitler når det finnes avvik', () => {
        render(<StatusTicker messages={[{ title: 'Feil A', kind: 'ongoing' }]} overall="red" />);
        expect(screen.getAllByText('Feil A').length).toBeGreaterThan(0);
    });
    it('setter data-overall for fargekoding', () => {
        const { container } = render(<StatusTicker messages={[]} overall="yellow" />);
        expect(container.querySelector('[data-overall="yellow"]')).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/components/StatusTicker.test.jsx`
Expected: FAIL – finner ikke «Driftsstatus»/«ingen avvik» (gammel komponent bruker `items`).

- [ ] **Step 3: Write minimal implementation (erstatt filinnhold)**

```jsx
// src/components/StatusTicker.jsx
import React from 'react';

const COLORS = {
    green: { bg: '#2d8a4e', fg: '#ffffff' },
    yellow: { bg: '#f5c542', fg: '#1a1a1a' },
    red: { bg: '#c4271e', fg: '#ffffff' },
};

export default function StatusTicker({ messages = [], overall = 'green' }) {
    const c = COLORS[overall] || COLORS.green;
    const hasMessages = overall !== 'green' && messages.length > 0;
    const titles = messages.map((m) => m.title);

    return (
        <div
            className="ticker-bar"
            data-overall={overall}
            style={{ background: c.bg, color: c.fg }}
        >
            <div className="ticker-label">Driftsstatus</div>
            <div className="ticker-scroll-wrap">
                {hasMessages ? (
                    <div className="ticker-track">
                        {[...titles, ...titles].map((title, idx) => (
                            <span key={idx} className="ticker-item">
                                <span aria-hidden="true" style={{ opacity: 0.6, marginRight: 12 }}>●</span>
                                {title}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="ticker-static">Ingen avvik – alle systemer i normal drift</span>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Add CSS**

Legg til nederst i `src/css/main.css` (behold eksisterende `@keyframes ticker-scroll` og `.ticker-track`-animasjon):

```css
.ticker-bar {
    display: flex;
    align-items: center;
    width: 100%;
    overflow: hidden;
}
.ticker-label {
    flex: 0 0 auto;
    font-weight: 700;
    padding: 10px 24px;
    white-space: nowrap;
    border-right: 1px solid rgba(255, 255, 255, 0.35);
}
.ticker-scroll-wrap {
    flex: 1 1 0%;
    min-width: 0;
    overflow: hidden;
    padding: 10px 0;
}
.ticker-item {
    padding: 0 32px;
    font-size: 1rem;
}
.ticker-static {
    padding: 0 24px;
    font-size: 1rem;
}
```

Behold den eksisterende `.ticker-track`-regelen (display:inline-flex + animation).

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn vitest run src/components/StatusTicker.test.jsx`
Expected: PASS (4 tester).

- [ ] **Step 6: Commit**

```bash
git add src/components/StatusTicker.jsx src/components/StatusTicker.test.jsx src/css/main.css
git commit -m "feat: fargekodet ticker med fast Driftsstatus-etikett"
```

---

### Task 4: `App.jsx` – forenklet header + ny datakilde

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `fetchStatusFeed` (Task 2), `<StatusTicker messages overall />` (Task 3).

- [ ] **Step 1: Erstatt import og datakilde**

I `src/App.jsx`:

- Fjern importene `parseRssTitles` og `Heading`.
- Legg til: `import { fetchStatusFeed } from './lib/statusFeed.js';`
- Erstatt konstantene:

```js
const STATUS_URL = import.meta.env.VITE_STATUS_URL || '/status.json';
const STATUSPAGE_URL = 'https://status.entur.org/api/v2/summary.json';
const REFRESH_MS = 5 * 60 * 1000;
```

- Erstatt `rssItems`-state med:

```js
const [feed, setFeed] = useState({ messages: [], overall: 'green' });
```

- I `load()`, erstatt RSS-blokken (fetch av `RSS_URL` + `setRssItems`) med:

```js
try {
    const f = await fetchStatusFeed(STATUSPAGE_URL);
    if (!cancelled) setFeed(f);
} catch (e) {
    // behold forrige visning ved feil
}
```

- [ ] **Step 2: Forenkle headeren og ticker-bruken**

Erstatt `<Contrast>...</Contrast>`-blokken med kun logoen (større):

```jsx
<Contrast style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.fill.background.contrast.light, flex: '0 0 auto', padding: '10px 24px' }}>
    <img src="/logo.svg" alt="Entur" style={{ height: 64, width: 'auto', objectFit: 'contain' }} />
</Contrast>
```

Erstatt ticker-bruken:

```jsx
<div style={{ flex: '0 0 auto' }}>
    <StatusTicker messages={feed.messages} overall={feed.overall} />
</div>
```

- [ ] **Step 3: Run full test suite**

Run: `yarn test`
Expected: PASS (alle tester, ingen referanser til gammel `items`-prop igjen).

- [ ] **Step 4: Verify build**

Run: `yarn build`
Expected: Bygger uten feil.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: forenklet header og statuspage-basert ticker i App"
```

---

### Task 5: Fjern ubrukt RSS-parsing

**Files:**
- Delete: `src/lib/parseRssTitles.js`, `src/lib/parseRssTitles.test.js`

**Interfaces:** ingen (kun opprydding).

- [ ] **Step 1: Bekreft at parseRssTitles ikke brukes**

Run: `grep -rn "parseRssTitles" src`
Expected: Ingen treff utenom filene som skal slettes (App.jsx skal være ryddet i Task 4).

- [ ] **Step 2: Slett filene**

```bash
git rm src/lib/parseRssTitles.js src/lib/parseRssTitles.test.js
```

- [ ] **Step 3: Run full test suite**

Run: `yarn test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: fjern ubrukt parseRssTitles"
```

---

## Self-Review

**Spec coverage:**
- Header kun logo, større → Task 4 (steg 2, høyde 64). ✔
- «Driftsstatus» flyttet til fast etikett i ticker → Task 3. ✔
- Kun aktive/framtidige meldinger → Task 1 (`parseStatusFeed` filtrerer resolved/completed). ✔
- Fargekode grønn/gul/rød + prioritet rød>gul>grønn → Task 1 (`utledOverall`) + Task 3 (COLORS). ✔
- Aktivt vedlikehold = gul → Task 1 (maintenance → `planned`). ✔
- Datakilde summary.json → Task 2 + Task 4. ✔

**Placeholder scan:** ingen TBD/TODO; all kode er konkret.

**Type consistency:** `{title, kind}` og `overall`-verdiene ('red'|'yellow'|'green') er konsistente på tvers av Task 1→3→4. `fetchStatusFeed(url, fetchImpl)` matcher bruk i Task 4.

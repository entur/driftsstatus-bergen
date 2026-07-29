# Sau-placeholder ved manglende data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Vise Entur Linje-sauen i stedet for hero-raden når en tjeneste mangler hero-data.

**Architecture:** Ren frontend. Ny hjelpefunksjon `hasCompleteHeroData` i `statusFormat.js` avgjør; `ServiceCard` rendrer enten dagens hero eller en `SheepPlaceholder` (bruker `/sheep.svg` fra `public/`).

**Tech Stack:** React 18, `@entur/typography`, Vitest + @testing-library/react.

## Global Constraints

- Norsk (bokmål) brukervendt tekst.
- Ingen ny avhengighet; bruk `public/sheep.svg` (servert på `/sheep.svg`).
- Kjør tester med `yarn vitest run <sti>`.

---

## Task 1: `hasCompleteHeroData` i `statusFormat.js`

**Files:**
- Modify: `src/lib/statusFormat.js`
- Test: `src/lib/statusFormat.test.js`

**Interfaces:**
- Consumes: eksisterende `responseBreakdown`, `pickMetric`.
- Produces: `hasCompleteHeroData(service) → boolean` — `true` bare når `service.health.state` er kjent og ≠ `'unknown'`, `service.health.uptime15m != null`, `responseBreakdown(service.metrics) != null`, og `pickMetric(service.metrics,'avgMs') != null`.

- [ ] **Step 1: Skriv de feilende testene**

Utvid import-linja i `src/lib/statusFormat.test.js` med `hasCompleteHeroData`, og legg til:

```js
describe('hasCompleteHeroData', () => {
    const full = { health: { state: 'up', up: true, uptime15m: 1 }, metrics: { window: { avgMs: 71, errorRate4xx: 0, errorRate5xx: 0 } } };
    it('true når health og metrics er komplett', () => {
        expect(hasCompleteHeroData(full)).toBe(true);
    });
    it('false når health.state er unknown', () => {
        expect(hasCompleteHeroData({ ...full, health: { state: 'unknown', up: null, uptime15m: null } })).toBe(false);
    });
    it('false når uptime15m mangler', () => {
        expect(hasCompleteHeroData({ ...full, health: { state: 'up', up: true, uptime15m: null } })).toBe(false);
    });
    it('false når metrics mangler', () => {
        expect(hasCompleteHeroData({ ...full, metrics: { window: {}, lifetime: {} } })).toBe(false);
    });
    it('false når avgMs mangler i begge vindu', () => {
        expect(hasCompleteHeroData({ ...full, metrics: { window: { avgMs: null, errorRate4xx: 0, errorRate5xx: 0 } } })).toBe(false);
    });
});
```

- [ ] **Step 2: Kjør og bekreft fail**

Run: `yarn vitest run src/lib/statusFormat.test.js -t "hasCompleteHeroData"`
Expected: FAIL — `hasCompleteHeroData is not a function`.

- [ ] **Step 3: Implementer**

Legg til nederst i `src/lib/statusFormat.js`:

```js
export function hasCompleteHeroData(service) {
    const state = service?.health?.state;
    if (!state || state === 'unknown') return false;
    if (service.health.uptime15m === null || service.health.uptime15m === undefined) return false;
    if (responseBreakdown(service.metrics) === null) return false;
    if (pickMetric(service.metrics, 'avgMs') === null) return false;
    return true;
}
```

- [ ] **Step 4: Kjør og bekreft pass**

Run: `yarn vitest run src/lib/statusFormat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusFormat.js src/lib/statusFormat.test.js
git commit -m "feat: hasCompleteHeroData i statusFormat"
```

---

## Task 2: `SheepPlaceholder` og valg i `ServiceCard`

**Files:**
- Modify: `src/components/ServiceCard.jsx`
- Test: `src/components/ServiceCard.test.jsx`

**Interfaces:**
- Consumes: `hasCompleteHeroData` (Task 1).
- Produces: intern `SheepPlaceholder()`; `ServiceCard` rendrer hero når `hasCompleteHeroData(service)`, ellers `SheepPlaceholder`. `DeploySection` uendret i begge tilfeller.

- [ ] **Step 1: Skriv de feilende testene**

Legg til i `src/components/ServiceCard.test.jsx` (bruk eksisterende `svc`, `now`, `deploy`, `health`, `metrics`):

```js
describe('ServiceCard sau-placeholder', () => {
    it('viser sau og skjuler hero når metrics mangler', () => {
        const { container } = render(<ServiceCard now={now} service={svc({ metrics: { window: {}, lifetime: {} } })} />);
        const sheep = container.querySelector('img[src="/sheep.svg"]');
        expect(sheep).toBeInTheDocument();
        expect(screen.getByText('Venter på data')).toBeInTheDocument();
        expect(container.querySelector('[data-testid="pie"]')).not.toBeInTheDocument();
        expect(container.querySelector('[data-testid="heart"]')).not.toBeInTheDocument();
        expect(container.querySelector('[data-testid="deploy"]')).toBeInTheDocument();
    });
    it('viser sau når health er unknown selv om metrics finnes', () => {
        const { container } = render(<ServiceCard now={now} service={svc({ health: { state: 'unknown', up: null, uptime15m: null } })} />);
        expect(container.querySelector('img[src="/sheep.svg"]')).toBeInTheDocument();
    });
    it('viser hero (ikke sau) når data er komplett', () => {
        const { container } = render(<ServiceCard now={now} service={svc()} />);
        expect(container.querySelector('img[src="/sheep.svg"]')).not.toBeInTheDocument();
        expect(container.querySelector('[data-testid="pie"]')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Kjør og bekreft fail**

Run: `yarn vitest run src/components/ServiceCard.test.jsx -t "sau-placeholder"`
Expected: FAIL (ingen sau-img; hero vises alltid).

- [ ] **Step 3: Implementer**

I `src/components/ServiceCard.jsx`: legg `hasCompleteHeroData` til import fra `../lib/statusFormat.js`. Legg til komponenten:

```jsx
function SheepPlaceholder() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <img src="/sheep.svg" alt="" width={130} height={130} style={{ maxWidth: '100%', height: 'auto' }} />
            <Text variant="body" margin="none" style={{ fontWeight: 600, opacity: 0.8 }}>Venter på data</Text>
        </div>
    );
}
```

Erstatt hero-blokka + `<Legend />` i `ServiceCard` med et betinget valg. Konkret, bytt ut disse linjene:

```jsx
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <PieChart breakdown={responseBreakdown(metrics)} size={118} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                    <Heartbeat health={health} />
                    <ResponseTime metrics={metrics} />
                </div>
            </div>
            <Legend />
```

med:

```jsx
            {hasCompleteHeroData(service) ? (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <PieChart breakdown={responseBreakdown(metrics)} size={118} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                            <Heartbeat health={health} />
                            <ResponseTime metrics={metrics} />
                        </div>
                    </div>
                    <Legend />
                </>
            ) : (
                <SheepPlaceholder />
            )}
```

- [ ] **Step 4: Kjør og bekreft pass**

Run: `yarn vitest run src/components/ServiceCard.test.jsx`
Expected: PASS (nye + eksisterende v2-tester).

- [ ] **Step 5: Commit**

```bash
git add src/components/ServiceCard.jsx src/components/ServiceCard.test.jsx
git commit -m "feat: sau-placeholder i ServiceCard ved manglende data"
```

---

## Self-Review

- Trigger «noe mangler» → `hasCompleteHeroData` (Task 1) + betinget render (Task 2). ✔
- Sau erstatter hero, beholder navn + deploy → Task 2 conditional. ✔
- Asset `/sheep.svg`, ingen ny avhengighet → `SheepPlaceholder`. ✔
- Type-konsistens: `hasCompleteHeroData(service)` samme signatur i begge tasks. ✔
- Placeholder-skann: ingen TBD; all kode konkret. ✔

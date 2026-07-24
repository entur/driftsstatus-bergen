# Fase 2 – Prometheus-helse — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fyll `health`-feltet i `status.json` med live Prometheus-data (up/down, p95-responstid, og 5xx-/4xx-andel siste 15 min), og vis det på tjeneste-kortene med kombinert deploy+helse-farge.

**Architecture:** Collectoren (Node, i GitHub Actions) spør GMPs Prometheus-query-API per tjeneste med et GCP-access-token, regner ut `health`, og skriver det inn i `status.json`. Rene, testbare funksjoner bygger PromQL, parser svar og utleder helse-state. Frontend leser feltet og rendrer en metrikk-linje + kombinert fargeprikk.

**Tech Stack:** Node 22 (ESM), Vitest + @testing-library/react, GitHub Actions, Google Managed Prometheus (query API), @entur design system, Firebase Hosting.

## Global Constraints

- Node 22 i CI; `yarn install --frozen-lockfile`; ESM (`import`/`export`).
- All bruker-synlig tekst på **norsk (bokmål)**; UI bruker `@entur/*`.
- GCP-auth er nøkkelløs via `entur/gha-meta/.github/actions/cloud-auth@v1` (env `prd`, `vars.WORKLOAD_IDENTITY_PROVIDER`, `vars.SERVICE_ACCOUNT`).
- **Terskler:** `WARN_5XX = 0.01`, `CRIT_5XX = 0.05` (navngitte konstanter).
- **Health-form (nøyaktig):** `{ state, up, p95Ms, errorRate5xx, errorRate4xx }` der `state ∈ {up, degraded, down, unknown}`.
- **Fargenøkler** (uendret fra fase 1): `success | warning | negative | neutral`.
- **GMP query-endpoint:** `https://monitoring.googleapis.com/v1/projects/<project>/location/global/prometheus/api/v1/query`.
- **Degradering:** manglende GCP-token eller feilende query ⇒ `health.state = "unknown"` og collectoren kjører videre (aldri hard-feil).
- Default metrikk-navn: `http_server_requests_seconds_count` / `http_server_requests_seconds_bucket` (overstyrbare per tjeneste).

---

## Filstruktur

**Collector:**
- `scripts/status/metrics.js` — NYE rene funksjoner: `buildQueries`, `parseInstantVector`, `computeHealth`, `fetchMetrics`, konstanter `WARN_5XX`/`CRIT_5XX`/`UNKNOWN_HEALTH`.
- `scripts/status/metrics.test.js` — tester for modulet.
- `scripts/status/buildStatus.js` — MODIFISERES: ny signatur `buildStatusJson(services, fetchRuns, fetchHealth, generatedAt)`; bruker `UNKNOWN_HEALTH` fra metrics.js.
- `scripts/status/buildStatus.test.js` — MODIFISERES for ny signatur/form.
- `scripts/status/services.js` — MODIFISERES: legg til `metricsProject`, `metricsSelector` (+ ev. navn-overrides), fylt med bekreftede verdier (Task 1).
- `scripts/collect-status.mjs` — MODIFISERES: GMP-query-funksjon, `GCP_TOKEN`-env, wire `fetchHealth`.

**Workflow:**
- `.github/workflows/status-collector.yml` — MODIFISERES: rekkefølge + GCP-token.
- `.github/workflows/deploy.yml` — MODIFISERES: samme.

**Frontend:**
- `src/lib/statusFormat.js` — MODIFISERES: `healthColorKey`, `combineSeverity`, `formatMs`, `formatPct`.
- `src/lib/statusFormat.test.js` — MODIFISERES: nye tester.
- `src/components/ServiceCard.jsx` — MODIFISERES: kombinert farge + metrikk-linje.
- `src/components/ServiceCard.test.jsx` — MODIFISERES: ny health-form + metrikk-linje-tester.

---

## Task 1: Forutsetning – bekreft metrikker og gi IAM-tilgang (gate)

> Ingen kode-artefakt utover å fylle konfigverdier i Task 4. Krever GCP-tilgang / Grafana. Må fullføres før PromQL-en kan verifiseres mot ekte miljø, men de rene funksjonene (Task 2) kan bygges parallelt siden de er navn-parameteriserte.

**Files:**
- (verdier brukes senere i `scripts/status/services.js`, Task 4)

- [ ] **Step 1: Gi CI-tjenestekontoen lesetilgang på metrikker**

For hvert av `ent-products-prd` og `ent-distchapi-prd` (krever prosjekt-admin der). Erstatt `<SA_EMAIL>` med verdien bak `vars.SERVICE_ACCOUNT` i repoets `prd`-environment:
```bash
gcloud projects add-iam-policy-binding ent-products-prd \
  --member=serviceAccount:<SA_EMAIL> --role=roles/monitoring.viewer
gcloud projects add-iam-policy-binding ent-distchapi-prd \
  --member=serviceAccount:<SA_EMAIL> --role=roles/monitoring.viewer
```
Expected: oppdatert IAM-policy uten feil på begge.

- [ ] **Step 2: Bekreft metrikknavn og identifiserende labels**

Finn i Grafana (eller via `gcloud`) de faktiske navnene og labelene for de tre tjenestene:
- HTTP-request-count-metrikken med en `status`-label (default-antakelse: `http_server_requests_seconds_count`).
- Latency-histogrammet (`..._bucket` med `le`) (default: `http_server_requests_seconds_bucket`).
- Hvilken label-kombinasjon som identifiserer **hver** tjeneste. Merk: `products-api` og `products-spring` deler namespace `products`, så det trengs en label (f.eks. `service`, `app`, `container` eller `job`) som skiller dem.

Noter for hver tjeneste: `metricsProject`, `metricsSelector` (label-map), og ev. navn-overrides. Disse fylles inn i Task 4.

- [ ] **Step 3: Verifiser at en query gir data**

Bekreft mot ekte miljø (bruk de bekreftede navnene/labelene):
```bash
TOKEN=$(gcloud auth print-access-token)
curl -sG "https://monitoring.googleapis.com/v1/projects/ent-products-prd/location/global/prometheus/api/v1/query" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'query=sum(rate(http_server_requests_seconds_count{namespace="products"}[15m]))'
```
Expected: `{"status":"success","data":{"resultType":"vector","result":[{...,"value":[<ts>,"<tall>"]}]}}` med et ikke-tomt `result`. Hvis tomt: juster metrikknavn/labels til `result` er ikke-tomt, og bruk de verdiene videre.

---

## Task 2: metrics.js – rene funksjoner (PromQL, parsing, helse)

**Files:**
- Create: `scripts/status/metrics.js`
- Test: `scripts/status/metrics.test.js`

**Interfaces:**
- Produces:
  - `WARN_5XX = 0.01`, `CRIT_5XX = 0.05`
  - `UNKNOWN_HEALTH = { state:'unknown', up:null, p95Ms:null, errorRate5xx:null, errorRate4xx:null }`
  - `buildQueries(service): { up, p95, fivexx, fourxx, total }` (PromQL-strenger)
  - `parseInstantVector(json): number | null`
  - `computeHealth({ up, p95Ms, fivexx, fourxx, total }, { warn, crit }): health`

- [ ] **Step 1: Skriv de feilende testene**

Opprett `scripts/status/metrics.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildQueries, parseInstantVector, computeHealth, WARN_5XX, CRIT_5XX, UNKNOWN_HEALTH } from './metrics.js';

const svc = {
    name: 'products-api',
    metricsProject: 'ent-products-prd',
    metricsSelector: { namespace: 'products' }
};

describe('buildQueries', () => {
    const q = buildQueries(svc);
    it('bygger up-query fra selector', () => {
        expect(q.up).toBe('sum(up{namespace="products"})');
    });
    it('bygger p95 i ms fra histogram_quantile', () => {
        expect(q.p95).toBe('histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{namespace="products"}[15m]))) * 1000');
    });
    it('bygger 5xx/4xx/total med status-filter', () => {
        expect(q.fivexx).toBe('sum(rate(http_server_requests_seconds_count{namespace="products",status=~"5.."}[15m]))');
        expect(q.fourxx).toBe('sum(rate(http_server_requests_seconds_count{namespace="products",status=~"4.."}[15m]))');
        expect(q.total).toBe('sum(rate(http_server_requests_seconds_count{namespace="products"}[15m]))');
    });
    it('respekterer navn-overrides', () => {
        const q2 = buildQueries({ ...svc, requestCountMetric: 'http_requests_total', latencyBucketMetric: 'http_latency_bucket' });
        expect(q2.total).toBe('sum(rate(http_requests_total{namespace="products"}[15m]))');
        expect(q2.p95).toContain('http_latency_bucket');
    });
});

describe('parseInstantVector', () => {
    it('henter første verdi som tall', () => {
        const json = { status: 'success', data: { resultType: 'vector', result: [{ metric: {}, value: [1700000000, '142.5'] }] } };
        expect(parseInstantVector(json)).toBe(142.5);
    });
    it('returnerer null for tomt result', () => {
        expect(parseInstantVector({ status: 'success', data: { resultType: 'vector', result: [] } })).toBeNull();
    });
    it('returnerer null for malformert svar', () => {
        expect(parseInstantVector({})).toBeNull();
        expect(parseInstantVector({ data: { result: [{ value: [1, 'NaN'] }] } })).toBeNull();
    });
});

describe('computeHealth', () => {
    const t = { warn: WARN_5XX, crit: CRIT_5XX };
    it('up når feilrate lav', () => {
        const h = computeHealth({ up: true, p95Ms: 120, fivexx: 0.001, fourxx: 0.02, total: 10 }, t);
        expect(h.state).toBe('up');
        expect(h.errorRate5xx).toBeCloseTo(0.0001);
        expect(h.errorRate4xx).toBeCloseTo(0.002);
        expect(h.p95Ms).toBe(120);
    });
    it('degraded når 5xx over warn', () => {
        expect(computeHealth({ up: true, p95Ms: 100, fivexx: 0.2, fourxx: 0, total: 10 }, t).state).toBe('degraded');
    });
    it('down når 5xx over crit', () => {
        expect(computeHealth({ up: true, p95Ms: 100, fivexx: 0.6, fourxx: 0, total: 10 }, t).state).toBe('down');
    });
    it('down når up=false uansett feilrate', () => {
        expect(computeHealth({ up: false, p95Ms: null, fivexx: 0, fourxx: 0, total: 10 }, t).state).toBe('down');
    });
    it('null trafikk gir null feilrater, state fra up', () => {
        const h = computeHealth({ up: true, p95Ms: null, fivexx: 0, fourxx: 0, total: 0 }, t);
        expect(h.errorRate5xx).toBeNull();
        expect(h.errorRate4xx).toBeNull();
        expect(h.state).toBe('up');
    });
    it('unknown når ingen data', () => {
        expect(computeHealth({ up: null, p95Ms: null, fivexx: null, fourxx: null, total: null }, t).state).toBe('unknown');
    });
});
```

- [ ] **Step 2: Kjør testene og verifiser at de feiler**

Run: `yarn test scripts/status/metrics.test.js`
Expected: FAIL — `Failed to resolve import './metrics.js'`.

- [ ] **Step 3: Implementer metrics.js (rene funksjoner)**

Opprett `scripts/status/metrics.js`:
```js
export const WARN_5XX = 0.01;
export const CRIT_5XX = 0.05;

export const UNKNOWN_HEALTH = {
    state: 'unknown',
    up: null,
    p95Ms: null,
    errorRate5xx: null,
    errorRate4xx: null
};

function selectorString(labels) {
    return Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
}

export function buildQueries(service) {
    const sel = selectorString(service.metricsSelector);
    const count = service.requestCountMetric || 'http_server_requests_seconds_count';
    const bucket = service.latencyBucketMetric || 'http_server_requests_seconds_bucket';
    return {
        up: `sum(up{${sel}})`,
        p95: `histogram_quantile(0.95, sum by (le) (rate(${bucket}{${sel}}[15m]))) * 1000`,
        fivexx: `sum(rate(${count}{${sel},status=~"5.."}[15m]))`,
        fourxx: `sum(rate(${count}{${sel},status=~"4.."}[15m]))`,
        total: `sum(rate(${count}{${sel}}[15m]))`
    };
}

export function parseInstantVector(json) {
    const result = json?.data?.result;
    if (!Array.isArray(result) || result.length === 0) return null;
    const raw = result[0]?.value?.[1];
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
}

export function computeHealth({ up, p95Ms, fivexx, fourxx, total }, { warn, crit }) {
    const errorRate5xx = total > 0 && fivexx !== null ? fivexx / total : null;
    const errorRate4xx = total > 0 && fourxx !== null ? fourxx / total : null;

    let state;
    if (up === null && errorRate5xx === null && p95Ms === null) {
        state = 'unknown';
    } else if (up === false || (errorRate5xx !== null && errorRate5xx > crit)) {
        state = 'down';
    } else if (errorRate5xx !== null && errorRate5xx > warn) {
        state = 'degraded';
    } else {
        state = 'up';
    }
    return { state, up, p95Ms, errorRate5xx, errorRate4xx };
}
```

- [ ] **Step 4: Kjør testene og verifiser at de passerer**

Run: `yarn test scripts/status/metrics.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/status/metrics.js scripts/status/metrics.test.js
git commit -m "feat: metrics.js – PromQL, parsing og helse-utledning"
```

---

## Task 3: fetchMetrics + buildStatusJson-integrasjon

**Files:**
- Modify: `scripts/status/metrics.js` (legg til `fetchMetrics`)
- Modify: `scripts/status/buildStatus.js`
- Test: `scripts/status/metrics.test.js` (legg til fetchMetrics-tester)
- Test: `scripts/status/buildStatus.test.js` (oppdater for ny signatur)

**Interfaces:**
- Consumes: `buildQueries`, `parseInstantVector`, `computeHealth`, `UNKNOWN_HEALTH`, `WARN_5XX`, `CRIT_5XX` (Task 2); `selectDeployRun`, `buildDeploy` (fase 1).
- Produces:
  - `fetchMetrics(service, queryFn): Promise<health>` der `queryFn(project, promql): Promise<object>` (Prometheus-JSON). Per-query-feil → det feltet null; total feil håndteres av kaller.
  - `buildStatusJson(services, fetchRuns, fetchHealth, generatedAt)` der `fetchHealth(service): Promise<health>`.

- [ ] **Step 1: Skriv de feilende testene (fetchMetrics)**

Legg til i `scripts/status/metrics.test.js`:
```js
import { fetchMetrics } from './metrics.js';

describe('fetchMetrics', () => {
    const svc = { name: 'a', metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products' } };
    const vec = (v) => ({ status: 'success', data: { resultType: 'vector', result: [{ metric: {}, value: [1, String(v)] }] } });

    it('samler helse fra fem queries', async () => {
        const queryFn = async (_project, promql) => {
            if (promql.includes('up{')) return vec(2);
            if (promql.includes('histogram_quantile')) return vec(150);
            if (promql.includes('status=~"5..')) return vec(0.05);
            if (promql.includes('status=~"4..')) return vec(0.1);
            return vec(10); // total
        };
        const h = await fetchMetrics(svc, queryFn);
        expect(h.up).toBe(true);
        expect(h.p95Ms).toBe(150);
        expect(h.errorRate5xx).toBeCloseTo(0.005);
        expect(h.errorRate4xx).toBeCloseTo(0.01);
        expect(h.state).toBe('up');
    });

    it('en feilende query gir null for det feltet, ikke krasj', async () => {
        const queryFn = async (_project, promql) => {
            if (promql.includes('histogram_quantile')) throw new Error('boom');
            if (promql.includes('up{')) return vec(1);
            return vec(0); // rates + total 0
        };
        const h = await fetchMetrics(svc, queryFn);
        expect(h.p95Ms).toBeNull();
        expect(h.up).toBe(true);
    });

    it('up=0 gir up=false', async () => {
        const h = await fetchMetrics(svc, async () => vec(0));
        expect(h.up).toBe(false);
    });
});
```

- [ ] **Step 2: Kjør og verifiser RED**

Run: `yarn test scripts/status/metrics.test.js`
Expected: FAIL — `fetchMetrics is not a function` / import mangler.

- [ ] **Step 3: Implementer fetchMetrics i metrics.js**

Legg til nederst i `scripts/status/metrics.js`:
```js
export async function fetchMetrics(service, queryFn) {
    const q = buildQueries(service);
    const get = async (promql) => {
        try {
            return parseInstantVector(await queryFn(service.metricsProject, promql));
        } catch {
            return null;
        }
    };
    const [upVal, p95Ms, fivexx, fourxx, total] = await Promise.all([
        get(q.up), get(q.p95), get(q.fivexx), get(q.fourxx), get(q.total)
    ]);
    const up = upVal === null ? null : upVal > 0;
    return computeHealth({ up, p95Ms, fivexx, fourxx, total }, { warn: WARN_5XX, crit: CRIT_5XX });
}
```

- [ ] **Step 4: Kjør og verifiser GREEN**

Run: `yarn test scripts/status/metrics.test.js`
Expected: PASS (alle grupper).

- [ ] **Step 5: Oppdater buildStatus-testene for ny signatur**

Erstatt innholdet i `scripts/status/buildStatus.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildStatusJson } from './buildStatus.js';
import { UNKNOWN_HEALTH } from './metrics.js';

const services = [
    { name: 'svc-a', repo: 'entur/svc-a', deployWorkflowNames: ['cd'], branch: 'main' },
    { name: 'svc-b', repo: 'entur/svc-b', deployWorkflowNames: ['cd'], branch: 'main' }
];

const okRun = [{ name: 'cd', status: 'completed', conclusion: 'success', head_sha: 'abcdef1234', run_started_at: '2026-07-24T08:00:00Z', html_url: 'https://x/a' }];
const fetchRuns = (runsByRepo) => async (repo) => runsByRepo[repo] ?? [];
const healthUp = { state: 'up', up: true, p95Ms: 100, errorRate5xx: 0, errorRate4xx: 0 };

describe('buildStatusJson', () => {
    it('kombinerer deploy og helse per tjeneste', async () => {
        const fh = async (svc) => (svc.name === 'svc-a' ? healthUp : { ...UNKNOWN_HEALTH });
        const result = await buildStatusJson(services, fetchRuns({ 'entur/svc-a': okRun }), fh, '2026-07-24T09:00:00Z');
        expect(result.generatedAt).toBe('2026-07-24T09:00:00Z');
        expect(result.services[0].deploy.state).toBe('success');
        expect(result.services[0].health).toEqual(healthUp);
        expect(result.services[1].health.state).toBe('unknown');
    });

    it('feilende fetchHealth degraderer til unknown health uten å velte tjenesten', async () => {
        const fh = async (svc) => { if (svc.name === 'svc-b') throw new Error('boom'); return healthUp; };
        const result = await buildStatusJson(services, fetchRuns({}), fh, '2026-07-24T09:00:00Z');
        expect(result.services[0].health).toEqual(healthUp);
        expect(result.services[1].health).toEqual(UNKNOWN_HEALTH);
    });

    it('feilende fetchRuns gir unknown deploy', async () => {
        const fh = async () => ({ ...UNKNOWN_HEALTH });
        const fr = async () => { throw new Error('gh'); };
        const result = await buildStatusJson(services, fr, fh, '2026-07-24T09:00:00Z');
        expect(result.services[0].deploy.state).toBe('unknown');
    });
});
```

- [ ] **Step 6: Kjør og verifiser RED**

Run: `yarn test scripts/status/buildStatus.test.js`
Expected: FAIL (gammel buildStatusJson ignorerer fetchHealth / feil arg-rekkefølge).

- [ ] **Step 7: Implementer ny buildStatus.js**

Erstatt innholdet i `scripts/status/buildStatus.js`:
```js
import { selectDeployRun, buildDeploy } from './deploy.js';
import { UNKNOWN_HEALTH } from './metrics.js';

export async function buildStatusJson(services, fetchRuns, fetchHealth, generatedAt) {
    const results = await Promise.all(
        services.map(async (svc) => {
            let deploy;
            try {
                const runs = await fetchRuns(svc.repo, svc.branch);
                const run = selectDeployRun(runs, svc.deployWorkflowNames);
                deploy = buildDeploy(run, svc.repo);
            } catch {
                deploy = buildDeploy(null, svc.repo);
            }
            let health;
            try {
                health = await fetchHealth(svc);
            } catch {
                health = { ...UNKNOWN_HEALTH };
            }
            return { name: svc.name, repo: svc.repo, deploy, health };
        })
    );
    return { generatedAt, services: results };
}
```

- [ ] **Step 8: Kjør begge testfilene og verifiser GREEN**

Run: `yarn test scripts/status`
Expected: PASS (deploy, metrics, buildStatus).

- [ ] **Step 9: Commit**

```bash
git add scripts/status/metrics.js scripts/status/metrics.test.js scripts/status/buildStatus.js scripts/status/buildStatus.test.js
git commit -m "feat: fetchMetrics + buildStatusJson med helse-innhenting"
```

---

## Task 4: collect-status.mjs + services.js (wiring)

**Files:**
- Modify: `scripts/collect-status.mjs`
- Modify: `scripts/status/services.js`

**Interfaces:**
- Consumes: `SERVICES` (utvidet), `buildStatusJson` (ny signatur), `fetchMetrics`, `UNKNOWN_HEALTH`.

- [ ] **Step 1: Utvid services.js med metrikk-config**

Fyll inn de **bekreftede** verdiene fra Task 1. Med default-navn og bekreftede selektorer blir `scripts/status/services.js`:
```js
export const SERVICES = [
    {
        name: 'products-api', repo: 'entur/products-api', deployWorkflowNames: ['cd'], branch: 'main',
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-api' }
    },
    {
        name: 'products-spring', repo: 'entur/products-spring', deployWorkflowNames: ['cd'], branch: 'main',
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-spring' }
    },
    {
        name: 'distribution-channels-api', repo: 'entur/distribution-channels-api', deployWorkflowNames: ['cd'], branch: 'main',
        metricsProject: 'ent-distchapi-prd', metricsSelector: { namespace: 'distribution-channels-api' }
    }
];
```
**Merk:** `service`-labelen (og ev. metrikk-navn-overrides) må matche det som ble bekreftet i Task 1 steg 2/3. Juster label-nøkkel/-verdi til queryen i Task 1 steg 3 ga ikke-tomt `result` for hver tjeneste.

- [ ] **Step 2: Oppdater collect-status.mjs**

Erstatt innholdet i `scripts/collect-status.mjs`:
```js
import { writeFile } from 'node:fs/promises';
import { SERVICES } from './status/services.js';
import { buildStatusJson } from './status/buildStatus.js';
import { fetchMetrics, UNKNOWN_HEALTH } from './status/metrics.js';

const GH_API = 'https://api.github.com';
const token = process.env.GH_TOKEN;
const gcpToken = process.env.GCP_TOKEN;

async function fetchRuns(repo, branch) {
    // per_page=100 (maks GitHub tillater) for å redusere sjansen for at siste
    // relevante run faller utenfor sida på et travelt repo med mange workflows.
    const url = `${GH_API}/repos/${repo}/actions/runs?branch=${branch}&per_page=100`;
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${repo}`);
    const body = await res.json();
    return body.workflow_runs ?? [];
}

async function queryPrometheus(project, promql) {
    const url = `https://monitoring.googleapis.com/v1/projects/${project}/location/global/prometheus/api/v1/query`;
    const res = await fetch(`${url}?query=${encodeURIComponent(promql)}`, {
        headers: { Authorization: `Bearer ${gcpToken}` }
    });
    if (!res.ok) throw new Error(`GMP ${res.status} for ${project}`);
    return res.json();
}

async function main() {
    if (!token) {
        console.warn('GH_TOKEN mangler — deploy-status blir "unknown" for alle tjenester.');
    }
    const fetchHealth = gcpToken
        ? (svc) => fetchMetrics(svc, queryPrometheus)
        : async () => ({ ...UNKNOWN_HEALTH });
    if (!gcpToken) {
        console.warn('GCP_TOKEN mangler — helse blir "unknown" for alle tjenester.');
    }

    const outputPath = process.env.STATUS_OUTPUT || 'status.json';
    const status = await buildStatusJson(SERVICES, fetchRuns, fetchHealth, new Date().toISOString());
    await writeFile(outputPath, JSON.stringify(status, null, 2));
    console.log(`Skrev ${outputPath} med ${status.services.length} tjenester.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
```

- [ ] **Step 3: Røyktest lokalt (uten tokens)**

Run: `node scripts/collect-status.mjs && cat status.json && rm -f status.json`
Expected: advarsler om manglende `GH_TOKEN` og `GCP_TOKEN`, gyldig `status.json` med 3 tjenester, alle `deploy.state:"unknown"` og `health.state:"unknown"` (ny health-form med `up/p95Ms/errorRate5xx/errorRate4xx`). Ingen krasj.

- [ ] **Step 4: Commit**

```bash
git add scripts/collect-status.mjs scripts/status/services.js
git commit -m "feat: collector henter helse fra GMP når GCP_TOKEN finnes"
```

---

## Task 5: Workflow-endringer (GCP-token til collect)

**Files:**
- Modify: `.github/workflows/status-collector.yml`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `scripts/collect-status.mjs` (leser `GCP_TOKEN`).

- [ ] **Step 1: Endre status-collector.yml (auth før collect + token)**

I `.github/workflows/status-collector.yml`, endre stegrekkefølgen slik at GCP-auth skjer FØR collect, og eksporter tokenet. Erstatt `steps:`-blokken slik at den blir:
```yaml
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Authenticate to Google Cloud (keyless)
        uses: entur/gha-meta/.github/actions/cloud-auth@v1
        with:
          environment: prd
          cloud_provider: gcp
          gcp_workload_identity_provider: ${{ vars.WORKLOAD_IDENTITY_PROVIDER }}
          gcp_service_account: ${{ vars.SERVICE_ACCOUNT }}

      - name: Collect status into public/
        env:
          GH_TOKEN: ${{ secrets.STATUS_GH_TOKEN }}
          STATUS_OUTPUT: public/status.json
        run: |
          export GCP_TOKEN="$(gcloud auth print-access-token)"
          node scripts/collect-status.mjs

      - name: Build
        run: yarn build

      - name: Deploy to Firebase Hosting
        run: yarn firebase deploy --only hosting --project ent-statusber-prd --non-interactive
```

- [ ] **Step 2: Endre deploy.yml på samme måte**

I `.github/workflows/deploy.yml`, flytt GCP-auth-steget til FØR collect-steget, og sett `GCP_TOKEN` i collect-steget. Resultatet av `steps:` skal ha rekkefølgen: checkout → setup-node → install → **auth** → collect (med `GH_TOKEN`, `STATUS_OUTPUT`, og `export GCP_TOKEN=$(gcloud auth print-access-token)`) → build → deploy. Bruk nøyaktig samme collect-steg som i Step 1 (med `export GCP_TOKEN=...` foran `node scripts/collect-status.mjs`). Behold det eksisterende `Deploy to Firebase Hosting`-steget og `Build`-steget.

- [ ] **Step 3: Valider YAML**

Run: `npx --yes @action-validator/cli .github/workflows/status-collector.yml .github/workflows/deploy.yml`
Expected: ingen strukturfeil (glob-advarsel for `paths` er OK).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/status-collector.yml .github/workflows/deploy.yml
git commit -m "ci: gi collect-steget GCP-token for helse-innhenting"
```

---

## Task 6: statusFormat – helse-formattering og farge

**Files:**
- Modify: `src/lib/statusFormat.js`
- Test: `src/lib/statusFormat.test.js`

**Interfaces:**
- Consumes: `deployColorKey` (finnes).
- Produces:
  - `healthColorKey(state): 'success'|'warning'|'negative'|'neutral'`
  - `combineSeverity(deployState, healthState): 'success'|'warning'|'negative'|'neutral'`
  - `formatMs(n): string` — `n` null → `'–'`; ellers `'<avrundet> ms'`
  - `formatPct(frac): string` — null → `'–'`; ellers prosent med norsk desimalkomma og 1 desimal + `' %'`

- [ ] **Step 1: Skriv de feilende testene**

Legg til i `src/lib/statusFormat.test.js`:
```js
import { healthColorKey, combineSeverity, formatMs, formatPct } from './statusFormat.js';

describe('healthColorKey', () => {
    it('mapper helse-state til fargenøkkel', () => {
        expect(healthColorKey('up')).toBe('success');
        expect(healthColorKey('degraded')).toBe('warning');
        expect(healthColorKey('down')).toBe('negative');
        expect(healthColorKey('unknown')).toBe('neutral');
    });
});

describe('combineSeverity', () => {
    it('tar verste av deploy og helse', () => {
        expect(combineSeverity('success', 'up')).toBe('success');
        expect(combineSeverity('success', 'degraded')).toBe('warning');
        expect(combineSeverity('success', 'down')).toBe('negative');
        expect(combineSeverity('failure', 'up')).toBe('negative');
        expect(combineSeverity('in_progress', 'up')).toBe('warning');
    });
    it('lar helse løfte ukjent deploy, og motsatt', () => {
        expect(combineSeverity('unknown', 'up')).toBe('success');
        expect(combineSeverity('success', 'unknown')).toBe('success');
        expect(combineSeverity('unknown', 'unknown')).toBe('neutral');
    });
});

describe('formatMs', () => {
    it('avrunder og legger på ms', () => {
        expect(formatMs(142.7)).toBe('143 ms');
    });
    it('null gir tankestrek', () => {
        expect(formatMs(null)).toBe('–');
    });
});

describe('formatPct', () => {
    it('formatterer brøk som prosent med komma', () => {
        expect(formatPct(0.002)).toBe('0,2 %');
        expect(formatPct(0.011)).toBe('1,1 %');
    });
    it('null gir tankestrek', () => {
        expect(formatPct(null)).toBe('–');
    });
});
```

- [ ] **Step 2: Kjør og verifiser RED**

Run: `yarn test src/lib/statusFormat.test.js`
Expected: FAIL — de fire nye importene mangler.

- [ ] **Step 3: Implementer funksjonene**

Legg til nederst i `src/lib/statusFormat.js`:
```js
const HEALTH_COLORS = {
    up: 'success',
    degraded: 'warning',
    down: 'negative',
    unknown: 'neutral'
};
export function healthColorKey(state) {
    return HEALTH_COLORS[state] ?? 'neutral';
}

const RANK = { neutral: 0, success: 1, warning: 2, negative: 3 };
const BY_RANK = ['neutral', 'success', 'warning', 'negative'];
export function combineSeverity(deployState, healthState) {
    const r = Math.max(RANK[deployColorKey(deployState)], RANK[healthColorKey(healthState)]);
    return BY_RANK[r];
}

export function formatMs(n) {
    if (n === null || n === undefined) return '–';
    return `${Math.round(n)} ms`;
}

export function formatPct(frac) {
    if (frac === null || frac === undefined) return '–';
    return `${(frac * 100).toFixed(1).replace('.', ',')} %`;
}
```

- [ ] **Step 4: Kjør og verifiser GREEN**

Run: `yarn test src/lib/statusFormat.test.js`
Expected: PASS (også de eksisterende fase-1-testene).

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusFormat.js src/lib/statusFormat.test.js
git commit -m "feat: helse-farge og -formattering i statusFormat"
```

---

## Task 7: ServiceCard – kombinert farge + metrikk-linje

**Files:**
- Modify: `src/components/ServiceCard.jsx`
- Test: `src/components/ServiceCard.test.jsx`

**Interfaces:**
- Consumes: `combineSeverity`, `healthColorKey`, `formatMs`, `formatPct`, `deployLabel`, `timeAgo` (statusFormat).

- [ ] **Step 1: Oppdater/legg til tester**

Erstatt innholdet i `src/components/ServiceCard.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';

const now = new Date('2026-07-24T10:00:00Z');
const deploy = (state, extra = {}) => ({ state, sha: 'abc1234', at: '2026-07-24T09:00:00Z', url: 'https://x', version: null, ...extra });
const unknownHealth = { state: 'unknown', up: null, p95Ms: null, errorRate5xx: null, errorRate4xx: null };
const upHealth = { state: 'up', up: true, p95Ms: 142, errorRate5xx: 0.002, errorRate4xx: 0.011 };

describe('ServiceCard', () => {
    it('viser navn og deploy-status', () => {
        render(<ServiceCard now={now} service={{ name: 'products-api', repo: 'entur/products-api', deploy: deploy('success'), health: unknownHealth }} />);
        expect(screen.getByText('products-api')).toBeInTheDocument();
        expect(screen.getByText('Deployet')).toBeInTheDocument();
    });

    it('skjuler metrikk-linja når helse er unknown', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: deploy('success'), health: unknownHealth }} />);
        expect(screen.queryByText(/p95/)).not.toBeInTheDocument();
    });

    it('viser metrikk-linja med p95, 5xx og 4xx når helse finnes', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: deploy('success'), health: upHealth }} />);
        expect(screen.getByText(/p95 142 ms/)).toBeInTheDocument();
        expect(screen.getByText(/5xx 0,2 %/)).toBeInTheDocument();
        expect(screen.getByText(/4xx 1,1 %/)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Kjør og verifiser RED**

Run: `yarn test src/components/ServiceCard.test.jsx`
Expected: FAIL (metrikk-linja finnes ikke ennå).

- [ ] **Step 3: Oppdater ServiceCard.jsx**

Erstatt innholdet i `src/components/ServiceCard.jsx`:
```jsx
import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { semantic } from '@entur/tokens';
import { deployLabel, combineSeverity, formatMs, formatPct, timeAgo } from '../lib/statusFormat.js';

const DOT = {
    success: semantic.fill.success.default,
    warning: semantic.fill.warning.default,
    negative: semantic.fill.negative.default,
    neutral: '#9aa0a6'
};

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy, health } = service;
    const colorKey = combineSeverity(deploy.state, health.state);
    const showMetrics = health.state !== 'unknown';
    return (
        <div style={{
            background: 'white', borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 8, minHeight: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: DOT[colorKey], flex: '0 0 auto' }} />
                <Heading as="h3" variant="subtitle-1" margin="none">{service.name}</Heading>
            </div>
            <Text variant="body" margin="none">{deployLabel(deploy.state)}</Text>
            {deploy.sha && (
                <Text variant="caption" margin="none">
                    {deploy.sha}{deploy.at ? ` · ${timeAgo(deploy.at, now)}` : ''}
                </Text>
            )}
            {showMetrics && (
                <Text variant="caption" margin="none">
                    {`p95 ${formatMs(health.p95Ms)} · 5xx ${formatPct(health.errorRate5xx)} · 4xx ${formatPct(health.errorRate4xx)}`}
                </Text>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Kjør og verifiser GREEN**

Run: `yarn test src/components/ServiceCard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Full suite + build**

Run: `yarn test && yarn build`
Expected: alle tester grønne (collector + frontend), build uten feil.

- [ ] **Step 6: Commit**

```bash
git add src/components/ServiceCard.jsx src/components/ServiceCard.test.jsx
git commit -m "feat: ServiceCard viser kombinert helse-farge og metrikk-linje"
```

---

## Self-review-notater (dekning mot spec)

- **Helsesjekk (up/down):** Task 2 `computeHealth` + `fetchMetrics` (up-query). ✅
- **Responstid p95:** Task 2 `buildQueries.p95` + Task 7 metrikk-linje. ✅
- **5xx/4xx hver for seg:** Task 2 (egne queries + rater) + Task 7 (`5xx …% · 4xx …%`). ✅
- **Helse-state med terskler (1%/5%) + up:** Task 2 `computeHealth` + `WARN_5XX`/`CRIT_5XX`. ✅
- **Kombinert kort-farge (matrise):** Task 6 `combineSeverity` + Task 7. ✅
- **Utvidet datakontrakt:** Task 2 (`UNKNOWN_HEALTH`) + Task 3 (buildStatusJson). ✅
- **GMP query-API med SA-token:** Task 4 `queryPrometheus` + Task 5 (`GCP_TOKEN`). ✅
- **Degradering uten token/ved feil:** Task 3 (try/catch) + Task 4 (fetchHealth-fallback) + Task 2 (per-query null). ✅
- **Null-trafikk-edge:** Task 2 `computeHealth`-test. ✅
- **Forutsetninger (IAM + metrikknavn):** Task 1. ✅

## Avhengigheter som må være på plass

1. `roles/monitoring.viewer` til CI-SA på `ent-products-prd` + `ent-distchapi-prd` (Task 1).
2. Bekreftede metrikknavn/labels i `services.js` (Task 1 → Task 4).
3. Endringene må merges til `main` før collector-workflowen kjører med dem.

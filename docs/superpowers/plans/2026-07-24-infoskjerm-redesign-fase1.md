# Infoskjerm-redesign Fase 1 — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstatt den skjermfyllende RSS-visningen med et grid av tjeneste-kort som viser deploy-status for team-produkts tjenester, og demote RSS-feeden til en tynn ticker nederst.

**Architecture:** Siden forblir en statisk React/Vite-app på Firebase Hosting. En ny planlagt GitHub Action (`status-collector.yml`) henter siste deploy-workflow-status per konfigurert repo fra GitHub API, bygger en `status.json`, og laster den opp til en offentlig GCS-bucket. Frontend henter `status.json` fra bucketen og rendrer tjeneste-kort + en RSS-ticker.

**Tech Stack:** React 19, Vite 7, @entur design system, Node 22 (collector-script, ESM), Vitest + @testing-library/react (test), GitHub Actions, Google Cloud Storage, `entur/gha-meta` for nøkkelløs GCP-auth.

## Global Constraints

- Node 22 i CI (`actions/setup-node@v4` med `node-version: 22`).
- Pakkehåndtering: `yarn install --frozen-lockfile`.
- ESM overalt (`"type": "module"` i package.json) — bruk `import`/`export`, ikke `require`.
- All bruker-synlig tekst på **norsk (bokmål)**.
- UI-komponenter bruker `@entur/*`-pakker der det er naturlig (typography, layout, icons).
- GCP-prosjekt: `ent-statusber-prd`. GCP-auth er nøkkelløs via `entur/gha-meta/.github/actions/cloud-auth@v1` med `vars.WORKLOAD_IDENTITY_PROVIDER` og `vars.SERVICE_ACCOUNT`, environment `prd`.
- Deploy-workflow-navnet i mål-repoene er `cd` (bekreftet for products-spring og distribution-channels-api; default for alle).
- GCS-bucket (default): `ent-statusber-prd-status`, objekt `status.json`, offentlig lesbar, CORS-aktivert.
- Frontend leser status fra `VITE_STATUS_URL`, default `https://storage.googleapis.com/ent-statusber-prd-status/status.json`.

---

## Filstruktur

**Collector (Node, kjører i CI):**
- `scripts/status/services.js` — konfigurasjonsliste over tjenester som overvåkes.
- `scripts/status/deploy.js` — rene funksjoner: velg deploy-run, map til status.
- `scripts/status/buildStatus.js` — bygger hele `status.json`-objektet (injisert fetch).
- `scripts/collect-status.mjs` — entry-point: henter fra GitHub, skriver `status.json` til disk.
- `scripts/status/deploy.test.js`, `scripts/status/buildStatus.test.js` — tester.

**Frontend:**
- `src/lib/fetchStatus.js` — henter og validerer `status.json`.
- `src/lib/statusFormat.js` — status→farge/etikett, stale-sjekk, tid-siden.
- `src/lib/parseRssTitles.js` — parser RSS-XML til titler.
- `src/components/ServiceCard.jsx` — ett tjeneste-kort.
- `src/components/ServiceHealthGrid.jsx` — grid + stale-banner.
- `src/components/StatusTicker.jsx` — rullende RSS-ticker.
- `src/App.jsx` — modifiseres: slank header + grid + ticker.
- `src/components/ServiceAlert.jsx` — slettes.
- `src/lib/*.test.js`, `src/components/*.test.jsx` — tester.

**Infra / CI:**
- `.github/workflows/status-collector.yml` — planlagt collector-workflow.
- `infra/gcs-cors.json` — CORS-konfig for bucketen.

---

## Task 1: Testverktøy (Vitest + Testing Library)

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `vitest.setup.js`
- Create: `src/lib/smoke.test.js` (slettes i slutten av tasken)

**Interfaces:**
- Produces: `yarn test` kjører Vitest i jsdom-miljø med `@testing-library/jest-dom`-matchers tilgjengelig.

- [ ] **Step 1: Legg til dev-avhengigheter**

Run:
```bash
yarn add -D vitest@^2 jsdom@^25 @testing-library/react@^16 @testing-library/dom@^10 @testing-library/jest-dom@^6
```

- [ ] **Step 2: Legg til test-script i package.json**

I `package.json` under `"scripts"`, legg til:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Konfigurer Vitest i vite.config.js**

Erstatt innholdet i `vite.config.js` med:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    base: '/',
    server: {
        port: 3000
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.js']
    }
})
```

- [ ] **Step 4: Lag setup-fil**

Opprett `vitest.setup.js`:
```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Skriv en smoke-test**

Opprett `src/lib/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
    it('kjører testrammeverket', () => {
        expect(1 + 1).toBe(2);
    });
});
```

- [ ] **Step 6: Kjør testene og verifiser at de passerer**

Run: `yarn test`
Expected: 1 passed. Ingen konfigfeil.

- [ ] **Step 7: Fjern smoke-testen og commit**

```bash
rm src/lib/smoke.test.js
git add package.json yarn.lock vite.config.js vitest.setup.js
git commit -m "chore: sett opp Vitest og Testing Library"
```

---

## Task 2: Deploy-status-mapping (rene funksjoner)

**Files:**
- Create: `scripts/status/services.js`
- Create: `scripts/status/deploy.js`
- Test: `scripts/status/deploy.test.js`

**Interfaces:**
- Produces:
  - `SERVICES: Array<{name: string, repo: string, deployWorkflowNames: string[], branch: string}>` fra `services.js`.
  - `selectDeployRun(runs: object[], workflowNames: string[]): object | null` — nyeste run (etter `run_started_at`) hvis `run.name` er i `workflowNames`, ellers `null`.
  - `mapDeployState(run: object): 'success' | 'failure' | 'in_progress'`.
  - `buildDeploy(run: object | null, repo: string): {state, sha, at, url, version}` — `state` er `'unknown'` når `run` er `null`.

- [ ] **Step 1: Skriv de feilende testene**

Opprett `scripts/status/deploy.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { selectDeployRun, mapDeployState, buildDeploy } from './deploy.js';

const cdOld = { name: 'cd', status: 'completed', conclusion: 'success', head_sha: 'aaaaaaa000', run_started_at: '2026-07-24T06:00:00Z', html_url: 'https://x/1' };
const cdNew = { name: 'cd', status: 'completed', conclusion: 'failure', head_sha: 'bbbbbbb111', run_started_at: '2026-07-24T08:00:00Z', html_url: 'https://x/2' };
const ci = { name: 'ci-pr', status: 'completed', conclusion: 'success', head_sha: 'ccccccc222', run_started_at: '2026-07-24T09:00:00Z', html_url: 'https://x/3' };

describe('selectDeployRun', () => {
    it('velger nyeste run med matchende workflow-navn', () => {
        const run = selectDeployRun([cdOld, cdNew, ci], ['cd']);
        expect(run).toBe(cdNew);
    });
    it('ignorerer runs som ikke matcher navnet', () => {
        const run = selectDeployRun([ci], ['cd']);
        expect(run).toBeNull();
    });
    it('returnerer null for tom liste', () => {
        expect(selectDeployRun([], ['cd'])).toBeNull();
    });
});

describe('mapDeployState', () => {
    it('mapper fullført suksess til success', () => {
        expect(mapDeployState({ status: 'completed', conclusion: 'success' })).toBe('success');
    });
    it('mapper fullført feil/kansellert til failure', () => {
        expect(mapDeployState({ status: 'completed', conclusion: 'failure' })).toBe('failure');
        expect(mapDeployState({ status: 'completed', conclusion: 'cancelled' })).toBe('failure');
    });
    it('mapper ikke-fullført (waiting/queued/in_progress) til in_progress', () => {
        expect(mapDeployState({ status: 'waiting', conclusion: '' })).toBe('in_progress');
        expect(mapDeployState({ status: 'in_progress', conclusion: null })).toBe('in_progress');
    });
});

describe('buildDeploy', () => {
    it('bygger deploy-objekt fra run med kort sha', () => {
        const d = buildDeploy(cdNew, 'entur/products-api');
        expect(d).toEqual({ state: 'failure', sha: 'bbbbbbb', at: '2026-07-24T08:00:00Z', url: 'https://x/2', version: null });
    });
    it('returnerer unknown-state når run er null', () => {
        const d = buildDeploy(null, 'entur/products-api');
        expect(d).toEqual({ state: 'unknown', sha: null, at: null, url: 'https://github.com/entur/products-api/actions', version: null });
    });
});
```

- [ ] **Step 2: Kjør testene og verifiser at de feiler**

Run: `yarn test scripts/status/deploy.test.js`
Expected: FAIL — `Failed to resolve import './deploy.js'`.

- [ ] **Step 3: Skriv tjenestekonfigurasjonen**

Opprett `scripts/status/services.js`:
```js
export const SERVICES = [
    { name: 'products-api', repo: 'entur/products-api', deployWorkflowNames: ['cd'], branch: 'main' },
    { name: 'products-spring', repo: 'entur/products-spring', deployWorkflowNames: ['cd'], branch: 'main' },
    { name: 'distribution-channels-api', repo: 'entur/distribution-channels-api', deployWorkflowNames: ['cd'], branch: 'main' }
];
```

- [ ] **Step 4: Implementer mapping-funksjonene**

Opprett `scripts/status/deploy.js`:
```js
export function selectDeployRun(runs, workflowNames) {
    const matching = runs.filter((r) => workflowNames.includes(r.name));
    if (matching.length === 0) return null;
    return matching.reduce((newest, r) =>
        new Date(r.run_started_at) > new Date(newest.run_started_at) ? r : newest
    );
}

export function mapDeployState(run) {
    if (run.status !== 'completed') return 'in_progress';
    return run.conclusion === 'success' ? 'success' : 'failure';
}

export function buildDeploy(run, repo) {
    if (!run) {
        return { state: 'unknown', sha: null, at: null, url: `https://github.com/${repo}/actions`, version: null };
    }
    return {
        state: mapDeployState(run),
        sha: run.head_sha.slice(0, 7),
        at: run.run_started_at,
        url: run.html_url,
        version: null
    };
}
```

- [ ] **Step 5: Kjør testene og verifiser at de passerer**

Run: `yarn test scripts/status/deploy.test.js`
Expected: PASS (alle grupper grønne).

- [ ] **Step 6: Commit**

```bash
git add scripts/status/services.js scripts/status/deploy.js scripts/status/deploy.test.js
git commit -m "feat: deploy-status-mapping for collector"
```

---

## Task 3: Bygg status.json + collector-entry

**Files:**
- Create: `scripts/status/buildStatus.js`
- Create: `scripts/collect-status.mjs`
- Test: `scripts/status/buildStatus.test.js`

**Interfaces:**
- Consumes: `SERVICES` (Task 2), `selectDeployRun`, `buildDeploy` (Task 2).
- Produces:
  - `buildStatusJson(services, fetchRuns, generatedAt): Promise<{generatedAt, services}>` der `fetchRuns(repo, branch): Promise<object[]>` returnerer GitHub workflow-runs-arrayet, og hver tjeneste får `{name, repo, deploy, health}` med `health = {state: 'unknown', errorRate: null, p95Ms: null}`.

- [ ] **Step 1: Skriv de feilende testene**

Opprett `scripts/status/buildStatus.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildStatusJson } from './buildStatus.js';

const services = [
    { name: 'svc-a', repo: 'entur/svc-a', deployWorkflowNames: ['cd'], branch: 'main' },
    { name: 'svc-b', repo: 'entur/svc-b', deployWorkflowNames: ['cd'], branch: 'main' }
];

function fakeFetchRuns(runsByRepo) {
    return async (repo) => runsByRepo[repo] ?? [];
}

describe('buildStatusJson', () => {
    it('bygger status for alle tjenester med injisert tidspunkt', async () => {
        const runs = {
            'entur/svc-a': [{ name: 'cd', status: 'completed', conclusion: 'success', head_sha: 'abcdef1234', run_started_at: '2026-07-24T08:00:00Z', html_url: 'https://x/a' }]
        };
        const result = await buildStatusJson(services, fakeFetchRuns(runs), '2026-07-24T09:00:00Z');
        expect(result.generatedAt).toBe('2026-07-24T09:00:00Z');
        expect(result.services).toHaveLength(2);
        expect(result.services[0]).toEqual({
            name: 'svc-a',
            repo: 'entur/svc-a',
            deploy: { state: 'success', sha: 'abcdef1', at: '2026-07-24T08:00:00Z', url: 'https://x/a', version: null },
            health: { state: 'unknown', errorRate: null, p95Ms: null }
        });
    });
    it('gir unknown-deploy når et repo ikke har matchende runs', async () => {
        const result = await buildStatusJson(services, fakeFetchRuns({}), '2026-07-24T09:00:00Z');
        expect(result.services[1].deploy.state).toBe('unknown');
        expect(result.services[1].health.state).toBe('unknown');
    });
    it('lar en feilende fetch for én tjeneste gi unknown uten å velte resten', async () => {
        const fetchRuns = async (repo) => {
            if (repo === 'entur/svc-b') throw new Error('boom');
            return [{ name: 'cd', status: 'completed', conclusion: 'success', head_sha: 'abcdef1234', run_started_at: '2026-07-24T08:00:00Z', html_url: 'https://x/a' }];
        };
        const result = await buildStatusJson(services, fetchRuns, '2026-07-24T09:00:00Z');
        expect(result.services[0].deploy.state).toBe('success');
        expect(result.services[1].deploy.state).toBe('unknown');
    });
});
```

- [ ] **Step 2: Kjør testene og verifiser at de feiler**

Run: `yarn test scripts/status/buildStatus.test.js`
Expected: FAIL — `Failed to resolve import './buildStatus.js'`.

- [ ] **Step 3: Implementer buildStatusJson**

Opprett `scripts/status/buildStatus.js`:
```js
import { selectDeployRun, buildDeploy } from './deploy.js';

const UNKNOWN_HEALTH = { state: 'unknown', errorRate: null, p95Ms: null };

export async function buildStatusJson(services, fetchRuns, generatedAt) {
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
            return { name: svc.name, repo: svc.repo, deploy, health: { ...UNKNOWN_HEALTH } };
        })
    );
    return { generatedAt, services: results };
}
```

- [ ] **Step 4: Kjør testene og verifiser at de passerer**

Run: `yarn test scripts/status/buildStatus.test.js`
Expected: PASS.

- [ ] **Step 5: Skriv collector-entry**

Opprett `scripts/collect-status.mjs`:
```js
import { writeFile } from 'node:fs/promises';
import { SERVICES } from './status/services.js';
import { buildStatusJson } from './status/buildStatus.js';

const GH_API = 'https://api.github.com';
const token = process.env.GH_TOKEN;

async function fetchRuns(repo, branch) {
    const url = `${GH_API}/repos/${repo}/actions/runs?branch=${branch}&per_page=30`;
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

async function main() {
    if (!token) {
        console.warn('GH_TOKEN mangler — deploy-status blir "unknown" for alle tjenester.');
    }
    const status = await buildStatusJson(SERVICES, fetchRuns, new Date().toISOString());
    await writeFile('status.json', JSON.stringify(status, null, 2));
    console.log(`Skrev status.json med ${status.services.length} tjenester.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
```

- [ ] **Step 6: Kjør collectoren lokalt (røyktest, ingen token)**

Run: `node scripts/collect-status.mjs && cat status.json`
Expected: Advarsel om manglende GH_TOKEN, deretter en gyldig `status.json` med 3 tjenester, alle `deploy.state: "unknown"` (uten token). Ingen krasj.

- [ ] **Step 7: Rydd bort lokal status.json og ignorer den**

Legg til `status.json` i `.gitignore`:
```
status.json
```
Deretter:
```bash
rm -f status.json
git add scripts/status/buildStatus.js scripts/status/buildStatus.test.js scripts/collect-status.mjs .gitignore
git commit -m "feat: collector bygger og skriver status.json"
```

---

## Task 4: GCS-bucket (infrastruktur, kjøres én gang)

> Denne tasken krever GCP-rettigheter til `ent-statusber-prd`. Kjøres én gang av en med tilgang. Ingen kode committes utover CORS-konfigen.

**Files:**
- Create: `infra/gcs-cors.json`

**Interfaces:**
- Produces: en offentlig lesbar bucket `gs://ent-statusber-prd-status` med CORS, og skrivetilgang for CI-tjenestekontoen. Objektet `status.json` blir tilgjengelig på `https://storage.googleapis.com/ent-statusber-prd-status/status.json`.

- [ ] **Step 1: Lag CORS-konfig**

Opprett `infra/gcs-cors.json`:
```json
[
  {
    "origin": ["*"],
    "method": ["GET"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 300
  }
]
```

- [ ] **Step 2: Opprett bucketen**

Run:
```bash
gcloud storage buckets create gs://ent-statusber-prd-status \
  --project=ent-statusber-prd \
  --location=europe-north1 \
  --uniform-bucket-level-access
```
Expected: `Creating gs://ent-statusber-prd-status/...` uten feil. (Hvis navnet er opptatt globalt: velg et nytt navn og oppdater `VITE_STATUS_URL`-defaulten i Task 6 og `BUCKET` i Task 5.)

- [ ] **Step 3: Gjør bucketen offentlig lesbar**

Run:
```bash
gcloud storage buckets add-iam-policy-binding gs://ent-statusber-prd-status \
  --member=allUsers --role=roles/storage.objectViewer
```
Expected: oppdatert IAM-policy uten feil.

- [ ] **Step 4: Sett CORS**

Run:
```bash
gcloud storage buckets update gs://ent-statusber-prd-status --cors-file=infra/gcs-cors.json
```
Expected: `Updating gs://ent-statusber-prd-status/...` uten feil.

- [ ] **Step 5: Gi CI-tjenestekontoen skrivetilgang**

Erstatt `<SERVICE_ACCOUNT_EMAIL>` med verdien bak `vars.SERVICE_ACCOUNT` i repoets `prd`-environment.
Run:
```bash
gcloud storage buckets add-iam-policy-binding gs://ent-statusber-prd-status \
  --member=serviceAccount:<SERVICE_ACCOUNT_EMAIL> --role=roles/storage.objectAdmin
```
Expected: oppdatert IAM-policy uten feil.

- [ ] **Step 6: Verifiser og commit**

Verifiser offentlig lesbarhet ved å legge opp en testfil:
```bash
echo '{"ok":true}' > /tmp/status-probe.json
gcloud storage cp /tmp/status-probe.json gs://ent-statusber-prd-status/status.json
curl -sic - https://storage.googleapis.com/ent-statusber-prd-status/status.json | head -n 20
```
Expected: `HTTP/2 200`, en `access-control-allow-origin`-header, og body `{"ok":true}`.
```bash
git add infra/gcs-cors.json
git commit -m "chore: CORS-konfig for status-bucket"
```

---

## Task 5: Collector-workflow (planlagt GitHub Action)

**Files:**
- Create: `.github/workflows/status-collector.yml`

**Interfaces:**
- Consumes: `scripts/collect-status.mjs` (Task 3), bucketen (Task 4), secret `STATUS_GH_TOKEN`.
- Produces: `status.json` oppdateres i bucketen hvert 5. minutt.

- [ ] **Step 1: Opprett workflow-fila**

Opprett `.github/workflows/status-collector.yml`:
```yaml
name: Collect service status

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

concurrency:
  group: status-collector
  cancel-in-progress: true

env:
  BUCKET: ent-statusber-prd-status

jobs:
  collect:
    name: Collect and publish status.json
    runs-on: ubuntu-24.04
    environment: prd
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Collect status
        env:
          GH_TOKEN: ${{ secrets.STATUS_GH_TOKEN }}
        run: node scripts/collect-status.mjs

      - name: Authenticate to Google Cloud (keyless)
        uses: entur/gha-meta/.github/actions/cloud-auth@v1
        with:
          environment: prd
          cloud_provider: gcp
          gcp_workload_identity_provider: ${{ vars.WORKLOAD_IDENTITY_PROVIDER }}
          gcp_service_account: ${{ vars.SERVICE_ACCOUNT }}

      - name: Upload to GCS
        run: |
          gcloud storage cp status.json gs://${BUCKET}/status.json \
            --cache-control=no-cache
```

- [ ] **Step 2: Verifiser YAML-syntaks**

Run: `yarn dlx @action-validator/cli .github/workflows/status-collector.yml || npx --yes @action-validator/cli .github/workflows/status-collector.yml`
Expected: ingen feil (validerer struktur). Hvis verktøyet ikke er tilgjengelig offline, hopp over og verifiser i steg 4.

- [ ] **Step 3: Opprett secret**

Dokumenter/utfør: opprett repo-secret `STATUS_GH_TOKEN` = en fine-grained PAT eller GitHub App-token med **Actions: read** på `entur/products-api`, `entur/products-spring`, `entur/distribution-channels-api`.
Run (med gh CLI av en med tilgang):
```bash
gh secret set STATUS_GH_TOKEN --repo entur/driftsstatus-bergen
```
Expected: `✓ Set secret STATUS_GH_TOKEN`.

- [ ] **Step 4: Commit og kjør manuelt**

```bash
git add .github/workflows/status-collector.yml
git commit -m "feat: planlagt collector-workflow som publiserer status.json til GCS"
```
Etter at branchen er merget til `main` (workflow må ligge på default-branch for schedule/dispatch):
```bash
gh workflow run "Collect service status" --repo entur/driftsstatus-bergen
sleep 60
curl -s https://storage.googleapis.com/ent-statusber-prd-status/status.json | head -n 40
```
Expected: en fersk `status.json` med de 3 tjenestene og reelle `deploy.state`-verdier (`success`/`failure`/`in_progress`), ikke `unknown`.

---

## Task 6: Frontend-bibliotek (fetch, formatering, RSS-parsing)

**Files:**
- Create: `src/lib/fetchStatus.js`
- Create: `src/lib/statusFormat.js`
- Create: `src/lib/parseRssTitles.js`
- Test: `src/lib/statusFormat.test.js`, `src/lib/parseRssTitles.test.js`, `src/lib/fetchStatus.test.js`

**Interfaces:**
- Produces:
  - `fetchStatus(url: string, fetchImpl=fetch): Promise<{generatedAt, services}>` — kaster ved ikke-OK respons.
  - `isStale(generatedAt: string, now: Date, maxAgeMs=900000): boolean`.
  - `deployLabel(state): string` og `deployColorKey(state): 'success'|'warning'|'negative'|'neutral'`.
  - `timeAgo(iso: string, now: Date): string` — norsk «for X siden» via date-fns.
  - `parseRssTitles(xmlText: string, limit=15): Array<{title, pubDate}>`.

- [ ] **Step 1: Skriv de feilende testene for statusFormat**

Opprett `src/lib/statusFormat.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { isStale, deployLabel, deployColorKey, timeAgo } from './statusFormat.js';

describe('isStale', () => {
    const now = new Date('2026-07-24T10:00:00Z');
    it('er fersk innenfor 15 min', () => {
        expect(isStale('2026-07-24T09:50:00Z', now)).toBe(false);
    });
    it('er utdatert etter 15 min', () => {
        expect(isStale('2026-07-24T09:40:00Z', now)).toBe(true);
    });
});

describe('deployLabel', () => {
    it('gir norske etiketter', () => {
        expect(deployLabel('success')).toBe('Deployet');
        expect(deployLabel('failure')).toBe('Deploy feilet');
        expect(deployLabel('in_progress')).toBe('Deployer …');
        expect(deployLabel('unknown')).toBe('Ukjent');
    });
});

describe('deployColorKey', () => {
    it('mapper state til fargenøkkel', () => {
        expect(deployColorKey('success')).toBe('success');
        expect(deployColorKey('in_progress')).toBe('warning');
        expect(deployColorKey('failure')).toBe('negative');
        expect(deployColorKey('unknown')).toBe('neutral');
    });
});

describe('timeAgo', () => {
    it('gir norsk relativ tid', () => {
        const now = new Date('2026-07-24T10:00:00Z');
        expect(timeAgo('2026-07-24T09:00:00Z', now)).toMatch(/time/);
    });
    it('gir tom streng for null', () => {
        expect(timeAgo(null, new Date())).toBe('');
    });
});
```

- [ ] **Step 2: Skriv de feilende testene for parseRssTitles**

Opprett `src/lib/parseRssTitles.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parseRssTitles } from './parseRssTitles.js';

const xml = `<?xml version="1.0"?><rss><channel>
  <item><title>Hendelse A</title><pubDate>Mon, 21 Jul 2026 10:00:00 GMT</pubDate></item>
  <item><title>Hendelse B</title><pubDate>Mon, 21 Jul 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;

describe('parseRssTitles', () => {
    it('henter ut titler og pubDate', () => {
        const items = parseRssTitles(xml);
        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ title: 'Hendelse A', pubDate: 'Mon, 21 Jul 2026 10:00:00 GMT' });
    });
    it('respekterer limit', () => {
        expect(parseRssTitles(xml, 1)).toHaveLength(1);
    });
    it('returnerer tom liste for ugyldig xml', () => {
        expect(parseRssTitles('', 5)).toEqual([]);
    });
});
```

- [ ] **Step 3: Skriv den feilende testen for fetchStatus**

Opprett `src/lib/fetchStatus.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { fetchStatus } from './fetchStatus.js';

describe('fetchStatus', () => {
    it('returnerer parset json ved OK', async () => {
        const payload = { generatedAt: 'x', services: [] };
        const fakeFetch = async () => ({ ok: true, json: async () => payload });
        await expect(fetchStatus('http://x', fakeFetch)).resolves.toEqual(payload);
    });
    it('kaster ved ikke-OK', async () => {
        const fakeFetch = async () => ({ ok: false, status: 500 });
        await expect(fetchStatus('http://x', fakeFetch)).rejects.toThrow('500');
    });
});
```

- [ ] **Step 4: Kjør testene og verifiser at de feiler**

Run: `yarn test src/lib`
Expected: FAIL — alle tre importene lar seg ikke resolve.

- [ ] **Step 5: Implementer statusFormat.js**

Opprett `src/lib/statusFormat.js`:
```js
import { formatDistance } from 'date-fns';
import { nb } from 'date-fns/locale';

export function isStale(generatedAt, now, maxAgeMs = 15 * 60 * 1000) {
    return now.getTime() - new Date(generatedAt).getTime() > maxAgeMs;
}

const LABELS = {
    success: 'Deployet',
    failure: 'Deploy feilet',
    in_progress: 'Deployer …',
    unknown: 'Ukjent'
};
export function deployLabel(state) {
    return LABELS[state] ?? LABELS.unknown;
}

const COLORS = {
    success: 'success',
    in_progress: 'warning',
    failure: 'negative',
    unknown: 'neutral'
};
export function deployColorKey(state) {
    return COLORS[state] ?? 'neutral';
}

export function timeAgo(iso, now) {
    if (!iso) return '';
    return formatDistance(new Date(iso), now, { addSuffix: true, locale: nb });
}
```

- [ ] **Step 6: Implementer parseRssTitles.js**

Opprett `src/lib/parseRssTitles.js`:
```js
export function parseRssTitles(xmlText, limit = 15) {
    try {
        const xml = new window.DOMParser().parseFromString(xmlText, 'application/xml');
        if (xml.querySelector('parsererror')) return [];
        const items = Array.from(xml.querySelectorAll('item')).slice(0, limit);
        return items.map((item) => ({
            title: item.querySelector('title')?.textContent ?? '',
            pubDate: item.querySelector('pubDate')?.textContent ?? ''
        }));
    } catch {
        return [];
    }
}
```

- [ ] **Step 7: Implementer fetchStatus.js**

Opprett `src/lib/fetchStatus.js`:
```js
export async function fetchStatus(url, fetchImpl = fetch) {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`status.json ${res.status}`);
    return res.json();
}
```

- [ ] **Step 8: Kjør testene og verifiser at de passerer**

Run: `yarn test src/lib`
Expected: PASS (alle tre filer).

- [ ] **Step 9: Commit**

```bash
git add src/lib
git commit -m "feat: frontend-bibliotek for status, formatering og rss-parsing"
```

---

## Task 7: ServiceCard-komponent

**Files:**
- Create: `src/components/ServiceCard.jsx`
- Test: `src/components/ServiceCard.test.jsx`

**Interfaces:**
- Consumes: `deployLabel`, `deployColorKey`, `timeAgo` (Task 6).
- Produces: `ServiceCard({ service, now })` — `service` har form `{name, repo, deploy:{state, sha, at, url, version}, health}`.

- [ ] **Step 1: Skriv de feilende testene**

Opprett `src/components/ServiceCard.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';

const now = new Date('2026-07-24T10:00:00Z');
const base = { name: 'products-api', repo: 'entur/products-api', health: { state: 'unknown', errorRate: null, p95Ms: null } };

describe('ServiceCard', () => {
    it('viser tjenestenavn og deployet-status', () => {
        render(<ServiceCard now={now} service={{ ...base, deploy: { state: 'success', sha: 'abc1234', at: '2026-07-24T09:00:00Z', url: 'https://x', version: null } }} />);
        expect(screen.getByText('products-api')).toBeInTheDocument();
        expect(screen.getByText('Deployet')).toBeInTheDocument();
        expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    });
    it('viser feil-status ved failure', () => {
        render(<ServiceCard now={now} service={{ ...base, deploy: { state: 'failure', sha: 'def5678', at: '2026-07-24T09:00:00Z', url: 'https://x', version: null } }} />);
        expect(screen.getByText('Deploy feilet')).toBeInTheDocument();
    });
    it('viser ukjent uten sha', () => {
        render(<ServiceCard now={now} service={{ ...base, deploy: { state: 'unknown', sha: null, at: null, url: 'https://x', version: null } }} />);
        expect(screen.getByText('Ukjent')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Kjør testene og verifiser at de feiler**

Run: `yarn test src/components/ServiceCard.test.jsx`
Expected: FAIL — `Failed to resolve import './ServiceCard.jsx'`.

- [ ] **Step 3: Implementer ServiceCard**

Opprett `src/components/ServiceCard.jsx`:
```jsx
import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { semantic } from '@entur/tokens';
import { deployLabel, deployColorKey, timeAgo } from '../lib/statusFormat.js';

const DOT = {
    success: semantic.fill.success.default,
    warning: semantic.fill.warning.default,
    negative: semantic.fill.negative.default,
    neutral: '#9aa0a6'
};

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy } = service;
    const colorKey = deployColorKey(deploy.state);
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
        </div>
    );
}
```

- [ ] **Step 4: Kjør testene og verifiser at de passerer**

Run: `yarn test src/components/ServiceCard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ServiceCard.jsx src/components/ServiceCard.test.jsx
git commit -m "feat: ServiceCard-komponent"
```

---

## Task 8: ServiceHealthGrid med stale-banner

**Files:**
- Create: `src/components/ServiceHealthGrid.jsx`
- Test: `src/components/ServiceHealthGrid.test.jsx`

**Interfaces:**
- Consumes: `ServiceCard` (Task 7), `isStale` (Task 6).
- Produces: `ServiceHealthGrid({ status, now })` — `status` er `{generatedAt, services}` eller `null`.

- [ ] **Step 1: Skriv de feilende testene**

Opprett `src/components/ServiceHealthGrid.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceHealthGrid from './ServiceHealthGrid.jsx';

const now = new Date('2026-07-24T10:00:00Z');
const svc = (name) => ({ name, repo: `entur/${name}`, deploy: { state: 'success', sha: 'abc1234', at: '2026-07-24T09:55:00Z', url: 'https://x', version: null }, health: { state: 'unknown', errorRate: null, p95Ms: null } });

describe('ServiceHealthGrid', () => {
    it('rendrer ett kort per tjeneste', () => {
        render(<ServiceHealthGrid now={now} status={{ generatedAt: '2026-07-24T09:58:00Z', services: [svc('a'), svc('b')] }} />);
        expect(screen.getByText('a')).toBeInTheDocument();
        expect(screen.getByText('b')).toBeInTheDocument();
    });
    it('viser stale-banner når data er gammelt', () => {
        render(<ServiceHealthGrid now={now} status={{ generatedAt: '2026-07-24T09:30:00Z', services: [svc('a')] }} />);
        expect(screen.getByText(/utdatert/i)).toBeInTheDocument();
    });
    it('viser ikke stale-banner for ferske data', () => {
        render(<ServiceHealthGrid now={now} status={{ generatedAt: '2026-07-24T09:58:00Z', services: [svc('a')] }} />);
        expect(screen.queryByText(/utdatert/i)).not.toBeInTheDocument();
    });
    it('viser lastemelding når status er null', () => {
        render(<ServiceHealthGrid now={now} status={null} />);
        expect(screen.getByText(/laster/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Kjør testene og verifiser at de feiler**

Run: `yarn test src/components/ServiceHealthGrid.test.jsx`
Expected: FAIL — import kan ikke resolves.

- [ ] **Step 3: Implementer ServiceHealthGrid**

Opprett `src/components/ServiceHealthGrid.jsx`:
```jsx
import React from 'react';
import { Text } from '@entur/typography/beta';
import ServiceCard from './ServiceCard.jsx';
import { isStale } from '../lib/statusFormat.js';

export default function ServiceHealthGrid({ status, now = new Date() }) {
    if (!status) {
        return <div style={{ padding: 40 }}><Text variant="body">Laster status …</Text></div>;
    }
    const stale = isStale(status.generatedAt, now);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', boxSizing: 'border-box', padding: 24, gap: 16 }}>
            {stale && (
                <div style={{ background: '#f9c66b', color: '#3d2b00', padding: '8px 16px', borderRadius: 8, fontWeight: 600 }}>
                    Data er utdatert — statusinnhenting kan være nede.
                </div>
            )}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16, alignContent: 'start', overflow: 'hidden'
            }}>
                {status.services.map((svc) => (
                    <ServiceCard key={svc.name} service={svc} now={now} />
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Kjør testene og verifiser at de passerer**

Run: `yarn test src/components/ServiceHealthGrid.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ServiceHealthGrid.jsx src/components/ServiceHealthGrid.test.jsx
git commit -m "feat: ServiceHealthGrid med stale-banner"
```

---

## Task 9: StatusTicker (rullende RSS)

**Files:**
- Create: `src/components/StatusTicker.jsx`
- Modify: `src/css/main.css` (marquee-animasjon)
- Test: `src/components/StatusTicker.test.jsx`

**Interfaces:**
- Produces: `StatusTicker({ items })` — `items` er `Array<{title, pubDate}>`. Rendrer en horisontalt rullende linje; tom liste gir en nøytral standardtekst.

- [ ] **Step 1: Skriv de feilende testene**

Opprett `src/components/StatusTicker.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusTicker from './StatusTicker.jsx';

describe('StatusTicker', () => {
    it('viser titlene fra feeden', () => {
        render(<StatusTicker items={[{ title: 'Hendelse A', pubDate: '' }, { title: 'Hendelse B', pubDate: '' }]} />);
        expect(screen.getAllByText('Hendelse A').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Hendelse B').length).toBeGreaterThan(0);
    });
    it('viser standardtekst når feeden er tom', () => {
        render(<StatusTicker items={[]} />);
        expect(screen.getByText(/ingen driftsmeldinger/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Kjør testene og verifiser at de feiler**

Run: `yarn test src/components/StatusTicker.test.jsx`
Expected: FAIL — import kan ikke resolves.

- [ ] **Step 3: Legg til marquee-animasjon i CSS**

Legg til på slutten av `src/css/main.css`:
```css
@keyframes ticker-scroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
}
.ticker-track {
    display: inline-flex;
    white-space: nowrap;
    will-change: transform;
    animation: ticker-scroll 40s linear infinite;
}
```

- [ ] **Step 4: Implementer StatusTicker**

Opprett `src/components/StatusTicker.jsx`:
```jsx
import React from 'react';

export default function StatusTicker({ items }) {
    if (!items || items.length === 0) {
        return (
            <div style={{ background: '#1a1a1a', color: 'white', padding: '10px 24px', fontSize: '1rem' }}>
                Ingen driftsmeldinger fra status.entur.org
            </div>
        );
    }
    const line = items.map((it) => it.title);
    return (
        <div style={{ background: '#1a1a1a', color: 'white', overflow: 'hidden', padding: '10px 0', width: '100%' }}>
            <div className="ticker-track">
                {[...line, ...line].map((title, idx) => (
                    <span key={idx} style={{ padding: '0 32px', fontSize: '1rem' }}>
                        <span aria-hidden="true" style={{ opacity: 0.5, marginRight: 12 }}>●</span>
                        {title}
                    </span>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Kjør testene og verifiser at de passerer**

Run: `yarn test src/components/StatusTicker.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/StatusTicker.jsx src/css/main.css src/components/StatusTicker.test.jsx
git commit -m "feat: StatusTicker med rullende rss"
```

---

## Task 10: App-integrasjon (layout, datainnhenting, opprydding)

**Files:**
- Modify: `src/App.jsx`
- Delete: `src/components/ServiceAlert.jsx`
- Modify: `.github/workflows/deploy.yml` (legg til `scripts/**` under `paths` er ikke nødvendig for siten; ingen endring kreves — verifiser i steg 5)

**Interfaces:**
- Consumes: `fetchStatus` (Task 6), `parseRssTitles` (Task 6), `ServiceHealthGrid` (Task 8), `StatusTicker` (Task 9).

- [ ] **Step 1: Skriv om App.jsx med slank header, grid og ticker**

Erstatt hele `src/App.jsx` med:
```jsx
import React, { useEffect, useState } from 'react';
import { Heading } from '@entur/typography/beta';
import { Contrast } from '@entur/layout';
import { semantic } from '@entur/tokens';
import ServiceHealthGrid from './components/ServiceHealthGrid.jsx';
import StatusTicker from './components/StatusTicker.jsx';
import { fetchStatus } from './lib/fetchStatus.js';
import { parseRssTitles } from './lib/parseRssTitles.js';

const STATUS_URL = import.meta.env.VITE_STATUS_URL
    || 'https://storage.googleapis.com/ent-statusber-prd-status/status.json';
const RSS_URL = 'https://status.entur.org/history.rss';
const REFRESH_MS = 5 * 60 * 1000;

function App() {
    const [status, setStatus] = useState(null);
    const [rssItems, setRssItems] = useState([]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const s = await fetchStatus(STATUS_URL);
                if (!cancelled) setStatus(s);
            } catch (e) {
                // behold forrige visning ved feil
            }
            try {
                const res = await fetch(RSS_URL);
                const text = await res.text();
                if (!cancelled) setRssItems(parseRssTitles(text));
            } catch (e) {
                if (!cancelled) setRssItems([]);
            }
        }
        load();
        const interval = setInterval(load, REFRESH_MS);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    return (
        <div style={{ minHeight: '100vh', width: '100vw', height: '100vh', boxSizing: 'border-box', margin: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Contrast style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: semantic.fill.background.contrast.light, flex: '0 0 auto', padding: '10px 24px' }}>
                <img src="/logo.svg" alt="Entur" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
                <Heading as="h1" variant="title-2" margin="none">Driftstatus</Heading>
                <img src="/sheep.svg" alt="" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
            </Contrast>

            <div style={{ flex: '1 1 0%', minHeight: 0, background: semantic.fill.background.secondary?.default || '#f2f2f2' }}>
                <ServiceHealthGrid status={status} />
            </div>

            <div style={{ flex: '0 0 auto' }}>
                <StatusTicker items={rssItems} />
            </div>
        </div>
    );
}

export default App;
```

- [ ] **Step 2: Slett gammel ServiceAlert-komponent**

Run: `git rm src/components/ServiceAlert.jsx`
Expected: fila fjernes. (Ingen andre filer importerer den — bekreft med `grep -r ServiceAlert src` → ingen treff.)

- [ ] **Step 3: Kjør hele testsuiten**

Run: `yarn test`
Expected: alle tester grønne (collector + lib + komponenter).

- [ ] **Step 4: Bygg og verifiser visuelt**

Run: `yarn build && yarn preview`
Åpne preview-URL-en. Forventet:
- Slank header øverst (logo + «Driftstatus» + sau).
- Grid av tjeneste-kort i midten (viser «Laster status …» til `status.json` er nådd; med gyldig bucket vises kort med status-prikker).
- Tynn, rullende ticker nederst med RSS-titler (eller «Ingen driftsmeldinger …»).
- Ingen horisontal scroll på body.

- [ ] **Step 5: Verifiser deploy-trigger**

Bekreft at `.github/workflows/deploy.yml` sine `paths` fortsatt dekker endringene: `src/**` er inkludert, som dekker alle nye komponenter. Ingen endring nødvendig. (Collector-scriptet under `scripts/**` skal *ikke* trigge site-deploy — det er riktig.)

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: nytt skjermoppsett med tjeneste-grid og rss-ticker"
```

---

## Self-review-notater (dekning mot spec)

- **Relevans for team-produkt:** Task 2–3 + 7–8 (deploy-status per tjeneste). ✅
- **Demote RSS til ticker:** Task 9 + 10. ✅
- **Statisk side + collector + GCS (valg A):** Task 3–5. ✅
- **Datakontrakt `status.json`:** Task 2–3 (health-felt = `unknown` i fase 1). ✅
- **Slank header + grid + ticker-layout:** Task 10. ✅
- **Stale-banner (>15 min):** Task 6 + 8. ✅
- **Feilhåndtering (behold visning ved fetch-feil):** Task 10 steg 1. ✅
- **Testing (collector + frontend):** hver task er TDD. ✅
- **Fase 2 (Prometheus-helse):** bevisst utenfor scope; `health`-feltet er forberedt i kontrakten.

## Avhengigheter som må være på plass før kjøring

1. Secret `STATUS_GH_TOKEN` (Actions: read på de tre mål-repoene) — Task 5.
2. GCS-bucket + IAM + CORS — Task 4 (krever GCP-rettigheter).
3. Workflow må ligge på `main` før `schedule`/`workflow_dispatch` fungerer — Task 5 steg 4.

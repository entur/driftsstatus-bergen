# Deploy-status per miljø – Implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vis på hvert tjeneste-kort hvilken versjon (SHA + ETU/PR-referanse) som er deployet til dev, tst og prd, hentet fra GitHubs Deployments API.

**Architecture:** Collectoren henter per miljø nyeste deployment som faktisk deployer/har deployet (hopper over `waiting`/avventer-godkjenning), normaliserer status, og trekker ETU-/PR-referanse ut av commit-tittelen. Resultatet skrives til `status.json` som `deploy.environments[]` med headline `deploy.state` = prd. `ServiceCard` viser én rad per miljø (PRD → TST → DEV).

**Integrasjon med fase 2:** Dette increment bygges oppå fase 2-branchen. Fase 2 har allerede landet `buildStatusJson(services, fetchRuns, fetchHealth, generatedAt)`, `scripts/status/metrics.js` og helse-wiring i `collect-status.mjs`. Vi **bytter bare deploy-kilden** (fetchRuns → Deployments API) og **beholder helse-innhentingen uendret**. `statusFormat.js` og `ServiceCard.jsx` er ennå ikke rørt av fase 2, så frontend-tasksene (4–5) står som opprinnelig. Fase 2 sine gjenstående frontend-tasks (helse-farge + metrikk-linje) legges senere oppå den per-miljø-kortet dette increment lager.

**Tech Stack:** Node ESM, vitest, React 19, `@entur/typography` + `@entur/tokens`, `date-fns` (nb-locale). Ingen nye avhengigheter.

## Global Constraints

- Rene funksjoner isoleres i moduler og testes med injiserte fetchers — ingen nettverk i enhetstester.
- Alle brukervendte tekster er på norsk.
- Miljø-rekkefølge overalt: `prd, tst, dev`.
- State-sett: `success | in_progress | failure | unknown`. `waiting` er kun et utvalgs-filter, aldri en vist/lagret state.
- DRY: per-miljø prikkfarge gjenbruker eksisterende `deployColorKey` (identiske states) — ingen ny fargefunksjon.
- Testkommando: `yarn test` (kjører `vitest run`). Enkelt-fil: `yarn test <sti>`.
- Ingen nye npm-avhengigheter.

---

### Task 1: Rene funksjoner i `deployEnvironments.js`

**Files:**
- Create: `scripts/status/deployEnvironments.js`
- Test: `scripts/status/deployEnvironments.test.js`

**Interfaces:**
- Consumes: ingenting (rene funksjoner).
- Produces:
  - `mapDeploymentState(githubState: string): 'success'|'in_progress'|'failure'|'unknown'`
  - `selectLatestDeployment(entries: {deployment, statusState, statusAt, statusUrl}[]): entry | null`
  - `extractTicket(message: string|null): string|null`
  - `extractPr(message: string|null): number|null`
  - `buildDeployEnvironment({env, sha, at, statusState, commitMessage, url, repo}): {env,state,sha,at,ticket,pr,url}`
  - `buildDeploy(environments: object[]): {state, environments}`

- [ ] **Step 1: Write the failing test**

```js
// scripts/status/deployEnvironments.test.js
import { describe, it, expect } from 'vitest';
import {
    mapDeploymentState,
    selectLatestDeployment,
    extractTicket,
    extractPr,
    buildDeployEnvironment,
    buildDeploy
} from './deployEnvironments.js';

describe('mapDeploymentState', () => {
    it('mapper success', () => {
        expect(mapDeploymentState('success')).toBe('success');
    });
    it('mapper in_progress/queued/pending til in_progress', () => {
        expect(mapDeploymentState('in_progress')).toBe('in_progress');
        expect(mapDeploymentState('queued')).toBe('in_progress');
        expect(mapDeploymentState('pending')).toBe('in_progress');
    });
    it('mapper failure/error/inactive til failure', () => {
        expect(mapDeploymentState('failure')).toBe('failure');
        expect(mapDeploymentState('error')).toBe('failure');
        expect(mapDeploymentState('inactive')).toBe('failure');
    });
    it('mapper waiting og ukjent til unknown', () => {
        expect(mapDeploymentState('waiting')).toBe('unknown');
        expect(mapDeploymentState(undefined)).toBe('unknown');
    });
});

describe('selectLatestDeployment', () => {
    const waiting = { deployment: { sha: 'newnew0' }, statusState: 'waiting' };
    const ok = { deployment: { sha: 'oldold0' }, statusState: 'success' };
    it('hopper over waiting og velger nyeste reelle', () => {
        expect(selectLatestDeployment([waiting, ok])).toBe(ok);
    });
    it('velger første når den er reell', () => {
        expect(selectLatestDeployment([ok])).toBe(ok);
    });
    it('returnerer null når alt er waiting', () => {
        expect(selectLatestDeployment([waiting])).toBeNull();
    });
    it('returnerer null for tom liste', () => {
        expect(selectLatestDeployment([])).toBeNull();
    });
    it('hopper over entries uten status', () => {
        expect(selectLatestDeployment([{ deployment: { sha: 'x' }, statusState: null }, ok])).toBe(ok);
    });
});

describe('extractTicket', () => {
    it('finner ETU-nummer i commit-tittel', () => {
        expect(extractTicket('chore: Bump Spring (ETU-73549) (#411)')).toBe('ETU-73549');
    });
    it('gir null når det mangler', () => {
        expect(extractTicket('chore(deps): Bump setup-java (#432)')).toBeNull();
    });
    it('gir null for null', () => {
        expect(extractTicket(null)).toBeNull();
    });
    it('bruker bare første linje', () => {
        expect(extractTicket('tittel uten\n\nETU-1 i body')).toBeNull();
    });
});

describe('extractPr', () => {
    it('finner PR-nummer', () => {
        expect(extractPr('chore: Bump (ETU-73549) (#411)')).toBe(411);
    });
    it('gir null når det mangler', () => {
        expect(extractPr('vanlig commit uten pr')).toBeNull();
    });
    it('gir null for null', () => {
        expect(extractPr(null)).toBeNull();
    });
});

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
            url: 'https://x/log'
        });
    });
    it('gir unknown-objekt når sha mangler', () => {
        const env = buildDeployEnvironment({ env: 'tst', sha: null, repo: 'entur/products-api' });
        expect(env).toEqual({
            env: 'tst',
            state: 'unknown',
            sha: null,
            at: null,
            ticket: null,
            pr: null,
            url: 'https://github.com/entur/products-api/deployments'
        });
    });
});

describe('buildDeploy', () => {
    const dev = { env: 'dev', state: 'success' };
    const tst = { env: 'tst', state: 'in_progress' };
    const prd = { env: 'prd', state: 'success' };
    it('sorterer prd, tst, dev og setter headline = prd', () => {
        const deploy = buildDeploy([dev, tst, prd]);
        expect(deploy.environments.map((e) => e.env)).toEqual(['prd', 'tst', 'dev']);
        expect(deploy.state).toBe('success');
    });
    it('gir unknown headline når prd mangler', () => {
        const deploy = buildDeploy([dev, tst]);
        expect(deploy.state).toBe('unknown');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test scripts/status/deployEnvironments.test.js`
Expected: FAIL med "Failed to resolve import './deployEnvironments.js'".

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/status/deployEnvironments.js
const IN_PROGRESS = ['in_progress', 'queued', 'pending'];
const FAILURE = ['failure', 'error', 'inactive'];

export function mapDeploymentState(githubState) {
    if (githubState === 'success') return 'success';
    if (IN_PROGRESS.includes(githubState)) return 'in_progress';
    if (FAILURE.includes(githubState)) return 'failure';
    return 'unknown';
}

export function selectLatestDeployment(entries) {
    for (const e of entries) {
        if (e.statusState && e.statusState !== 'waiting') return e;
    }
    return null;
}

const firstLine = (msg) => (msg ?? '').split('\n')[0];

export function extractTicket(message) {
    const m = firstLine(message).match(/ETU-\d+/i);
    return m ? m[0].toUpperCase() : null;
}

export function extractPr(message) {
    const m = firstLine(message).match(/#(\d+)/);
    return m ? Number(m[1]) : null;
}

export function buildDeployEnvironment({ env, sha, at, statusState, commitMessage, url, repo }) {
    if (!sha) {
        return { env, state: 'unknown', sha: null, at: null, ticket: null, pr: null, url: `https://github.com/${repo}/deployments` };
    }
    return {
        env,
        state: mapDeploymentState(statusState),
        sha: sha.slice(0, 7),
        at: at ?? null,
        ticket: extractTicket(commitMessage),
        pr: extractPr(commitMessage),
        url: url || `https://github.com/${repo}/deployments`
    };
}

const ENV_ORDER = ['prd', 'tst', 'dev'];

export function buildDeploy(environments) {
    const sorted = [...environments].sort(
        (a, b) => ENV_ORDER.indexOf(a.env) - ENV_ORDER.indexOf(b.env)
    );
    const prd = sorted.find((e) => e.env === 'prd');
    return { state: prd ? prd.state : 'unknown', environments: sorted };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test scripts/status/deployEnvironments.test.js`
Expected: PASS (alle beskrivelser grønne).

- [ ] **Step 5: Commit**

```bash
git add scripts/status/deployEnvironments.js scripts/status/deployEnvironments.test.js
git commit -m "feat: rene funksjoner for deploy-status per miljø"
```

---

### Task 2: Orkestrering `fetchDeployEnvironments`

**Files:**
- Modify: `scripts/status/deployEnvironments.js` (legg til `fetchDeployEnvironments`)
- Test: `scripts/status/deployEnvironments.test.js` (legg til describe-blokk)

**Interfaces:**
- Consumes: `selectLatestDeployment`, `buildDeployEnvironment`, `buildDeploy` fra Task 1.
- Produces: `fetchDeployEnvironments(service, fetchers): Promise<{state, environments}>`
  - `service`: `{ repo: string, environments?: string[] }` (default `['dev','tst','prd']`)
  - `fetchers`:
    - `listDeployments(repo, env): Promise<{id, sha, created_at}[]>` (nyeste først)
    - `getStatus(repo, deploymentId): Promise<{state, at, url}|null>`
    - `getCommitMessage(repo, sha): Promise<string|null>`

- [ ] **Step 1: Write the failing test**

```js
// legg til nederst i scripts/status/deployEnvironments.test.js
import { fetchDeployEnvironments } from './deployEnvironments.js';

describe('fetchDeployEnvironments', () => {
    const service = { name: 'svc', repo: 'entur/svc', environments: ['prd'] };

    it('hopper over deploy som avventer godkjenning', async () => {
        const fetchers = {
            listDeployments: async () => [
                { id: 2, sha: 'newnew0', created_at: '2026-07-24T09:00:00Z' },
                { id: 1, sha: 'oldold0', created_at: '2026-07-01T09:00:00Z' }
            ],
            getStatus: async (repo, id) => id === 2
                ? { state: 'waiting', at: '2026-07-24T09:01:00Z', url: 'https://x/2' }
                : { state: 'success', at: '2026-07-01T09:01:00Z', url: 'https://x/1' },
            getCommitMessage: async () => 'fix: noe (ETU-5) (#3)'
        };
        const deploy = await fetchDeployEnvironments(service, fetchers);
        const prd = deploy.environments[0];
        expect(prd.sha).toBe('oldold0');
        expect(prd.state).toBe('success');
        expect(prd.at).toBe('2026-07-01T09:01:00Z');
        expect(prd.ticket).toBe('ETU-5');
        expect(prd.pr).toBe(3);
        expect(deploy.state).toBe('success');
    });

    it('gir unknown for miljø når status-henting feiler', async () => {
        const fetchers = {
            listDeployments: async () => [{ id: 1, sha: 'aaaaaaa', created_at: '2026-07-24T09:00:00Z' }],
            getStatus: async () => { throw new Error('boom'); },
            getCommitMessage: async () => ''
        };
        const deploy = await fetchDeployEnvironments(service, fetchers);
        expect(deploy.environments[0].state).toBe('unknown');
        expect(deploy.state).toBe('unknown');
    });

    it('gir unknown når det ikke finnes deployments', async () => {
        const fetchers = {
            listDeployments: async () => [],
            getStatus: async () => null,
            getCommitMessage: async () => ''
        };
        const deploy = await fetchDeployEnvironments({ repo: 'entur/svc', environments: ['dev', 'tst', 'prd'] }, fetchers);
        expect(deploy.environments.map((e) => e.env)).toEqual(['prd', 'tst', 'dev']);
        expect(deploy.environments.every((e) => e.state === 'unknown')).toBe(true);
        expect(deploy.state).toBe('unknown');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test scripts/status/deployEnvironments.test.js`
Expected: FAIL med "fetchDeployEnvironments is not a function".

- [ ] **Step 3: Write minimal implementation**

```js
// legg til nederst i scripts/status/deployEnvironments.js
export async function fetchDeployEnvironments(service, fetchers) {
    const envs = service.environments ?? ['dev', 'tst', 'prd'];
    const results = await Promise.all(envs.map(async (env) => {
        try {
            const deployments = await fetchers.listDeployments(service.repo, env);
            const entries = [];
            for (const d of deployments) {
                const status = await fetchers.getStatus(service.repo, d.id);
                entries.push({
                    deployment: d,
                    statusState: status?.state ?? null,
                    statusAt: status?.at ?? null,
                    statusUrl: status?.url ?? null
                });
                if (status && status.state !== 'waiting') break;
            }
            const chosen = selectLatestDeployment(entries);
            if (!chosen) return buildDeployEnvironment({ env, sha: null, repo: service.repo });
            const commitMessage = await fetchers.getCommitMessage(service.repo, chosen.deployment.sha);
            return buildDeployEnvironment({
                env,
                sha: chosen.deployment.sha,
                at: chosen.statusAt ?? chosen.deployment.created_at,
                statusState: chosen.statusState,
                commitMessage,
                url: chosen.statusUrl,
                repo: service.repo
            });
        } catch {
            return buildDeployEnvironment({ env, sha: null, repo: service.repo });
        }
    }));
    return buildDeploy(results);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test scripts/status/deployEnvironments.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/status/deployEnvironments.js scripts/status/deployEnvironments.test.js
git commit -m "feat: fetchDeployEnvironments henter deploy per miljø via injiserte fetchers"
```

---

### Task 3: Koble `buildStatus.js` til per-miljø-deploy

**Files:**
- Modify: `scripts/status/buildStatus.js`
- Modify: `scripts/status/buildStatus.test.js` (skriv om)
- Delete: `scripts/status/deploy.js`, `scripts/status/deploy.test.js`

**Interfaces:**
- Consumes: `fetchDeployEnvironments(service, fetchers)` fra Task 2; `UNKNOWN_HEALTH` fra `metrics.js` (fase 2, allerede landet).
- Produces: `buildStatusJson(services, deployFetchers, fetchHealth, generatedAt): Promise<{generatedAt, services[]}>` der hver service er `{ name, repo, deploy: {state, environments}, health }`.
- **Integrasjon:** signaturen beholder fase 2 sin `fetchHealth`-parameter og helse-innhenting uendret; vi bytter kun deploy-delen fra `fetchRuns`/`selectDeployRun` til `fetchDeployEnvironments`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/status/buildStatus.test.js (erstatt hele filen)
import { describe, it, expect } from 'vitest';
import { buildStatusJson } from './buildStatus.js';

const services = [
    { name: 'svc-a', repo: 'entur/svc-a', environments: ['dev', 'tst', 'prd'] },
    { name: 'svc-b', repo: 'entur/svc-b', environments: ['dev', 'tst', 'prd'] }
];

const deployFetchers = {
    listDeployments: async (repo) => repo === 'entur/svc-a'
        ? [{ id: 1, sha: 'abcdef1234', created_at: '2026-07-24T08:00:00Z' }]
        : [],
    getStatus: async () => ({ state: 'success', at: '2026-07-24T08:05:00Z', url: 'https://x/log' }),
    getCommitMessage: async () => 'feat: noe (ETU-1) (#9)'
};

const fetchHealthOk = async () => ({ state: 'up', up: true, p95Ms: 100, errorRate5xx: 0, errorRate4xx: 0 });

describe('buildStatusJson', () => {
    it('bygger per-miljø-deploy og beholder helse for alle tjenester', async () => {
        const result = await buildStatusJson(services, deployFetchers, fetchHealthOk, '2026-07-24T09:00:00Z');
        expect(result.generatedAt).toBe('2026-07-24T09:00:00Z');
        expect(result.services).toHaveLength(2);

        const a = result.services[0];
        expect(a.name).toBe('svc-a');
        expect(a.deploy.state).toBe('success');
        expect(a.deploy.environments.map((e) => e.env)).toEqual(['prd', 'tst', 'dev']);
        expect(a.deploy.environments[0]).toMatchObject({ env: 'prd', state: 'success', sha: 'abcdef1', ticket: 'ETU-1', pr: 9 });
        expect(a.health).toEqual({ state: 'up', up: true, p95Ms: 100, errorRate5xx: 0, errorRate4xx: 0 });
    });

    it('gir unknown-deploy for tjeneste uten deployments', async () => {
        const result = await buildStatusJson(services, deployFetchers, fetchHealthOk, '2026-07-24T09:00:00Z');
        const b = result.services[1];
        expect(b.deploy.state).toBe('unknown');
        expect(b.deploy.environments.every((e) => e.state === 'unknown')).toBe(true);
    });

    it('gir unknown-helse når fetchHealth kaster', async () => {
        const failingHealth = async () => { throw new Error('boom'); };
        const result = await buildStatusJson(services, deployFetchers, failingHealth, '2026-07-24T09:00:00Z');
        expect(result.services[0].health.state).toBe('unknown');
    });

    it('lar en feilende deploy-fetch for én tjeneste gi unknown uten å velte resten', async () => {
        const failing = {
            listDeployments: async (repo) => {
                if (repo === 'entur/svc-b') throw new Error('boom');
                return [{ id: 1, sha: 'abcdef1234', created_at: '2026-07-24T08:00:00Z' }];
            },
            getStatus: async () => ({ state: 'success', at: '2026-07-24T08:05:00Z', url: 'https://x/log' }),
            getCommitMessage: async () => 'feat: noe (ETU-1) (#9)'
        };
        const result = await buildStatusJson(services, failing, fetchHealthOk, '2026-07-24T09:00:00Z');
        expect(result.services[0].deploy.state).toBe('success');
        expect(result.services[1].deploy.state).toBe('unknown');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test scripts/status/buildStatus.test.js`
Expected: FAIL (gammel `buildStatusJson` bruker `fetchRuns`/`selectDeployRun` for deploy, gir feil form på `deploy`).

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/status/buildStatus.js (erstatt hele filen)
import { fetchDeployEnvironments } from './deployEnvironments.js';
import { UNKNOWN_HEALTH } from './metrics.js';

export async function buildStatusJson(services, deployFetchers, fetchHealth, generatedAt) {
    const results = await Promise.all(
        services.map(async (svc) => {
            let deploy;
            try {
                deploy = await fetchDeployEnvironments(svc, deployFetchers);
            } catch {
                deploy = { state: 'unknown', environments: [] };
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

- [ ] **Step 4: Delete den utdaterte deploy-modulen**

```bash
git rm scripts/status/deploy.js scripts/status/deploy.test.js
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test scripts/status/buildStatus.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/status/buildStatus.js scripts/status/buildStatus.test.js
git commit -m "refactor: buildStatusJson bruker deploy-status per miljø"
```

---

### Task 4: `statusFormat` – hjelpere for miljø-rader

**Files:**
- Modify: `src/lib/statusFormat.js`
- Modify: `src/lib/statusFormat.test.js`

**Interfaces:**
- Consumes: eksisterende `deployColorKey` (gjenbrukes for prikkfarge — ingen ny farge­funksjon).
- Produces:
  - `envStateLabel(state): string` — `'deployer …' | 'feilet' | 'ingen data' | ''` (`''` for `success`)
  - `deployRef(env: {ticket, pr}): string` — `ticket` ellers `'PR: <pr>'` ellers `''`
- Fjerner: `deployLabel` (ikke lenger brukt etter Task 5).

- [ ] **Step 1: Write the failing test**

```js
// i src/lib/statusFormat.test.js: oppdater import-linjen og bytt ut deployLabel-blokka
// Import-linjen skal være:
//   import { isStale, deployColorKey, timeAgo, envStateLabel, deployRef } from './statusFormat.js';
// Slett describe('deployLabel', ...) helt, og legg til:

describe('envStateLabel', () => {
    it('gir norsk tekst for ikke-success states', () => {
        expect(envStateLabel('in_progress')).toBe('deployer …');
        expect(envStateLabel('failure')).toBe('feilet');
        expect(envStateLabel('unknown')).toBe('ingen data');
    });
    it('gir tom streng for success', () => {
        expect(envStateLabel('success')).toBe('');
    });
});

describe('deployRef', () => {
    it('foretrekker ETU-nummer', () => {
        expect(deployRef({ ticket: 'ETU-73549', pr: 411 })).toBe('ETU-73549');
    });
    it('faller tilbake til PR-nummer', () => {
        expect(deployRef({ ticket: null, pr: 432 })).toBe('PR: 432');
    });
    it('gir tom streng når begge mangler', () => {
        expect(deployRef({ ticket: null, pr: null })).toBe('');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/lib/statusFormat.test.js`
Expected: FAIL med "envStateLabel is not a function" (og import-feil for fjernet `deployLabel`).

- [ ] **Step 3: Write minimal implementation**

I `src/lib/statusFormat.js`: slett `LABELS`-objektet og `deployLabel`-funksjonen (linjene 8–16), behold `deployColorKey`, og legg til nederst:

```js
const ENV_STATE_LABELS = {
    in_progress: 'deployer …',
    failure: 'feilet',
    unknown: 'ingen data'
};
export function envStateLabel(state) {
    return ENV_STATE_LABELS[state] ?? '';
}

export function deployRef(env) {
    if (env.ticket) return env.ticket;
    if (env.pr) return `PR: ${env.pr}`;
    return '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/lib/statusFormat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusFormat.js src/lib/statusFormat.test.js
git commit -m "feat: statusFormat-hjelpere for miljø-rader (envStateLabel, deployRef)"
```

---

### Task 5: `ServiceCard` – én rad per miljø

**Files:**
- Modify: `src/components/ServiceCard.jsx`
- Modify: `src/components/ServiceCard.test.jsx` (skriv om)

**Interfaces:**
- Consumes: `deployColorKey`, `envStateLabel`, `deployRef`, `timeAgo` fra `statusFormat.js`; `service.deploy = {state, environments[]}` fra `status.json`.
- Produces: kort med topp-prikk = `deployColorKey(deploy.state)` og én rad per miljø (rekkefølge kommer ferdig sortert fra `buildDeploy`).

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/ServiceCard.test.jsx (erstatt hele filen)
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';

const now = new Date('2026-07-24T10:00:00Z');
const base = { name: 'products-api', repo: 'entur/products-api', health: { state: 'unknown', errorRate: null, p95Ms: null } };

const deploy = {
    state: 'success',
    environments: [
        { env: 'prd', state: 'success', sha: '965bd60', at: '2026-06-15T10:21:07Z', ticket: 'ETU-73549', pr: 411, url: 'https://x/prd' },
        { env: 'tst', state: 'in_progress', sha: '6edc092', at: '2026-07-24T09:00:00Z', ticket: null, pr: 432, url: 'https://x/tst' },
        { env: 'dev', state: 'success', sha: '6edc092', at: '2026-07-24T08:00:00Z', ticket: null, pr: 432, url: 'https://x/dev' }
    ]
};

describe('ServiceCard', () => {
    it('viser tjenestenavn og en rad per miljø', () => {
        render(<ServiceCard now={now} service={{ ...base, deploy }} />);
        expect(screen.getByText('products-api')).toBeInTheDocument();
        expect(screen.getByText('PRD')).toBeInTheDocument();
        expect(screen.getByText('TST')).toBeInTheDocument();
        expect(screen.getByText('DEV')).toBeInTheDocument();
        expect(screen.getByText('965bd60')).toBeInTheDocument();
        expect(screen.getAllByText('6edc092')).toHaveLength(2);
    });

    it('viser ETU-nummer for prd og PR-fallback for dev', () => {
        render(<ServiceCard now={now} service={{ ...base, deploy }} />);
        expect(screen.getByText('ETU-73549')).toBeInTheDocument();
        expect(screen.getAllByText('PR: 432').length).toBeGreaterThanOrEqual(1);
    });

    it('viser statustekst for in_progress', () => {
        render(<ServiceCard now={now} service={{ ...base, deploy }} />);
        expect(screen.getByText('deployer …')).toBeInTheDocument();
    });

    it('viser "ingen data" for ukjent miljø', () => {
        const unknownDeploy = {
            state: 'unknown',
            environments: [
                { env: 'prd', state: 'unknown', sha: null, at: null, ticket: null, pr: null, url: 'https://x' },
                { env: 'tst', state: 'unknown', sha: null, at: null, ticket: null, pr: null, url: 'https://x' },
                { env: 'dev', state: 'unknown', sha: null, at: null, ticket: null, pr: null, url: 'https://x' }
            ]
        };
        render(<ServiceCard now={now} service={{ ...base, deploy: unknownDeploy }} />);
        expect(screen.getAllByText('ingen data')).toHaveLength(3);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/components/ServiceCard.test.jsx`
Expected: FAIL (gammel `ServiceCard` viser `deployLabel`/`deploy.sha`, ikke miljø-rader).

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/components/ServiceCard.jsx (erstatt hele filen)
import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { semantic } from '@entur/tokens';
import { deployColorKey, envStateLabel, deployRef, timeAgo } from '../lib/statusFormat.js';

const DOT = {
    success: semantic.fill.success.default,
    warning: semantic.fill.warning.default,
    negative: semantic.fill.negative.default,
    neutral: '#9aa0a6'
};

function EnvRow({ env, now }) {
    const ref = deployRef(env);
    const secondary = env.state === 'success' ? timeAgo(env.at, now) : envStateLabel(env.state);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: DOT[deployColorKey(env.state)], flex: '0 0 auto' }} />
                <Text variant="body" margin="none" style={{ fontWeight: 600, minWidth: 34 }}>{env.env.toUpperCase()}</Text>
                {env.sha && <Text variant="body" margin="none" style={{ fontFamily: 'monospace' }}>{env.sha}</Text>}
                {ref && <Text variant="body" margin="none">{ref}</Text>}
            </div>
            {secondary && <Text variant="caption" margin="none" style={{ marginLeft: 18 }}>{secondary}</Text>}
        </div>
    );
}

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy } = service;
    return (
        <div style={{
            background: 'white', borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 10, minHeight: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: DOT[deployColorKey(deploy.state)], flex: '0 0 auto' }} />
                <Heading as="h3" variant="subtitle-1" margin="none">{service.name}</Heading>
            </div>
            {deploy.environments.map((env) => <EnvRow key={env.env} env={env} now={now} />)}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/components/ServiceCard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ServiceCard.jsx src/components/ServiceCard.test.jsx
git commit -m "feat: ServiceCard viser deploy per miljø (prd/tst/dev)"
```

---

### Task 6: Collector-wiring + config (ekte GitHub-fetchers)

**Files:**
- Modify: `scripts/collect-status.mjs`
- Modify: `scripts/status/services.js`

**Interfaces:**
- Consumes: `buildStatusJson(services, deployFetchers, generatedAt)` fra Task 3; `SERVICES` fra `services.js`.
- Produces: kjørbar collector som skriver `status.json` med per-miljø-deploy.

- [ ] **Step 1: Oppdater `services.js`** (behold fase 2 sine metrics-felt, legg til `environments`, fjern `deployWorkflowNames`/`branch`)

```js
// scripts/status/services.js (erstatt hele filen)
export const SERVICES = [
    {
        name: 'products-api', repo: 'entur/products-api', environments: ['dev', 'tst', 'prd'],
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-api' }
    },
    {
        name: 'products-spring', repo: 'entur/products-spring', environments: ['dev', 'tst', 'prd'],
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-spring' }
    },
    {
        name: 'distribution-channels-api', repo: 'entur/distribution-channels-api', environments: ['dev', 'tst', 'prd'],
        metricsProject: 'ent-distchapi-prd', metricsSelector: { namespace: 'distribution-channels-api' }
    }
];
```

- [ ] **Step 2: Oppdater `collect-status.mjs`** (behold GCP/helse-wiring, bytt `fetchRuns` → `deployFetchers`)

```js
// scripts/collect-status.mjs (erstatt hele filen)
import { writeFile } from 'node:fs/promises';
import { SERVICES } from './status/services.js';
import { buildStatusJson } from './status/buildStatus.js';
import { fetchMetrics, UNKNOWN_HEALTH } from './status/metrics.js';

const GH_API = 'https://api.github.com';
const token = process.env.GH_TOKEN;
const gcpToken = process.env.GCP_TOKEN;

const ghHeaders = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
};

async function ghJson(path) {
    const res = await fetch(`${GH_API}${path}`, { headers: ghHeaders });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
    return res.json();
}

const deployFetchers = {
    async listDeployments(repo, env) {
        const arr = await ghJson(`/repos/${repo}/deployments?environment=${env}&per_page=10`);
        return arr.map((d) => ({ id: d.id, sha: d.sha, created_at: d.created_at }));
    },
    async getStatus(repo, id) {
        const arr = await ghJson(`/repos/${repo}/deployments/${id}/statuses?per_page=1`);
        const s = arr[0];
        return s ? { state: s.state, at: s.created_at, url: s.log_url || s.target_url } : null;
    },
    async getCommitMessage(repo, sha) {
        const c = await ghJson(`/repos/${repo}/commits/${sha}`);
        return c.commit?.message ?? null;
    }
};

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
    const status = await buildStatusJson(SERVICES, deployFetchers, fetchHealth, new Date().toISOString());
    await writeFile(outputPath, JSON.stringify(status, null, 2));
    console.log(`Skrev ${outputPath} med ${status.services.length} tjenester.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
```

- [ ] **Step 3: Syntakssjekk + full testsuite**

Run: `node --check scripts/collect-status.mjs && yarn test`
Expected: Ingen syntaksfeil; alle testfiler PASS.

- [ ] **Step 4: Live røyktest mot GitHub (verifiser ekte data)**

Run:
```bash
GH_TOKEN=$(gh auth token) STATUS_OUTPUT=/private/tmp/claude-501/-Users-stunor-IdeaProjects-driftsstatus-bergen/bee6d7c8-172c-497d-ad95-ea4be96ec0c5/scratchpad/status.json node scripts/collect-status.mjs
cat /private/tmp/claude-501/-Users-stunor-IdeaProjects-driftsstatus-bergen/bee6d7c8-172c-497d-ad95-ea4be96ec0c5/scratchpad/status.json
```
Expected: `deploy.environments` for products-api viser prd på en annen SHA enn dev/tst, `deploy.state` = prd sin state, og ingen miljø står i `waiting`. (Hopp over dette steget hvis `gh` ikke er innlogget; enhetstestene dekker logikken.)

- [ ] **Step 5: Commit**

```bash
git add scripts/collect-status.mjs scripts/status/services.js
git commit -m "feat: collector henter deploy-status per miljø fra Deployments API"
```

---

## Merknad om workflows

`status-collector.yml` og `deploy.yml` (i dette repoet) kjører allerede collectoren med `GH_TOKEN`. Ingen workflow-endring kreves for denne funksjonen — men bekreft at token har lese­tilgang til Deployments- og Contents-API på de tre repoene (samme tilgang som fase 1 sin `actions/runs`-lesing). Dette er dekket av røyktesten i Task 6, Step 4.

## Self-Review

- **Spec-dekning:** Deployments API som kilde (Task 1–2, 6); hopp over `waiting` (Task 1 `selectLatestDeployment`, Task 2-test); state-normalisering (Task 1); kontrakt `deploy.environments[]` + headline = prd (Task 1 `buildDeploy`, Task 3); ETU/PR-uttrekk (Task 1); config uten `deployWorkflowNames`/`branch` (Task 6); frontend én rad per miljø PRD→TST→DEV (Task 5); `envStateLabel`/`deployRef` (Task 4); referanse ETU→PR→sha (Task 4 `deployRef` + Task 5 visning); testing (alle tasks). Dekket.
- **Placeholder-skann:** ingen TBD/TODO; all kode er komplett.
- **Type-konsistens:** `fetchDeployEnvironments(service, fetchers)`, `buildStatusJson(services, deployFetchers, generatedAt)`, `deploy = {state, environments[]}`, env-objekt `{env,state,sha,at,ticket,pr,url}` er konsistente på tvers av Task 1→6.
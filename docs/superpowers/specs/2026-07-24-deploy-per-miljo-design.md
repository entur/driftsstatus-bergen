# Deploy-status per miljø på tjeneste-kortet

**Dato:** 2026-07-24
**Status:** Godkjent design (klar for planlegging)
**Bygger på:** fase 1 (`2026-07-24-infoskjerm-redesign-design.md`)
**Forhold til fase 2:** eget, uavhengig increment. Komponerer med fase 2
(Prometheus-helse) men kan implementeres og merges hver for seg.

## Mål

Vis på hvert tjeneste-kort **hvilken versjon som er deployet til hvert miljø**
(dev, tst, prd), slik at man på avstand ser at miljøene kan ligge på ulik SHA.

Per miljø vises:

- **fargeprikk** (deploy-state)
- **miljø-etikett** (PRD / TST / DEV)
- **kort SHA** (7 tegn)
- **referanse**: `ETU-xxxxx` når den finnes, ellers `PR: <nr>`, ellers bare SHA
- **tid siden** deployet (`timeAgo`)

Rekkefølge på kortet: **PRD → TST → DEV** (produksjon øverst — viktigst).

## Datakilde: GitHub Deployments API

Deploy-status hentes fra GitHubs Deployments API, **ikke** fra workflow-runs som i
fase 1. Dette er uniformt på tvers av alle tre tjenestene uavhengig av:

- workflow-navn (`deploy` i products-api, `cd` i de to andre), og
- jobb-struktur (products-api/products-spring har `helm-deploy-{env}`-jobber,
  distribution-channels-api har én matrix-jobb `helm-deploy` med `[dev,tst,prd]`).

Alle tre bruker `entur/gha-helm` med job-nivå `environment: dev|tst|prd`, så GitHub
fører deployment-records per miljø med `sha`, `ref`, `created_at` og status.

Endepunkter (per tjeneste):

- `GET /repos/{repo}/deployments?environment=<env>&per_page=10` — nyeste deployments
  for miljøet (nyeste først).
- `GET /repos/{repo}/deployments/{id}/statuses?per_page=1` — gjeldende status for en
  deployment.
- `GET /repos/{repo}/commits/{sha}` — commit-melding (for ETU/PR-uttrekk).

Konsekvens: `deployWorkflowNames` og `branch` i `services.js` blir overflødige for
deploy og fjernes.

## Utvalg per miljø: hopp over «avventer godkjenning»

Vi ønsker **ikke** å vise deploys som venter på godkjenning. GitHub markerer disse
med status-state `waiting` (venter på required reviewers / wait-timer på miljøet).

Regel per miljø: gå gjennom de nyeste deploymentene (nyeste først) og velg den
**første som faktisk deployer eller har deployet** — dvs. gjeldende status-state er
`in_progress` / `queued` / `pending` / `success` / `failure` / `error`. Hopp over
alle med state `waiting`. Finnes ingen ikke-`waiting` deployment (eller ingen i det
hele tatt) → miljøet blir `unknown`.

Eksempel (products-api, 2026-07-24): nyeste tst-deployment (`6edc092`) har state
`waiting` → hoppes over; vi viser forrige reelle tst-deploy (`8796c83`). prd ligger
på `965bd60`, dev/tst-flyt på `6edc092`. Miljøene ligger altså på ulik SHA.

## Deploy-state (normalisert)

`mapDeploymentState(githubState)` normaliserer GitHubs status-states:

| GitHub status-state              | vår state     | farge  |
|----------------------------------|---------------|--------|
| `success`                        | `success`     | grønn  |
| `in_progress`,`queued`,`pending` | `in_progress` | gul    |
| `failure`,`error`,`inactive`     | `failure`     | rød    |
| (ingen deployment / kun `waiting`/ token mangler) | `unknown` | grå |

`waiting` inngår aldri i resultatet — det er utvalgs-filteret, ikke en vist state.

## Utvidet datakontrakt (`status.json`)

`deploy`-feltet fra fase 1 (ett objekt) erstattes av per-miljø-struktur:

```json
"deploy": {
  "state": "success",
  "environments": [
    { "env": "prd", "state": "success",     "sha": "965bd60", "at": "2026-06-15T10:21:07Z", "ticket": "ETU-73549", "pr": 411,  "url": "https://github.com/entur/products-api/actions/runs/…" },
    { "env": "tst", "state": "success",     "sha": "8796c83", "at": "2026-07-02T10:45:40Z", "ticket": null,        "pr": 424,  "url": "…" },
    { "env": "dev", "state": "success",     "sha": "6edc092", "at": "2026-07-20T13:48:02Z", "ticket": null,        "pr": 432,  "url": "…" }
  ]
}
```

- `deploy.state` (headline) = **prd sin state**. Produksjon er overskriften, og gir
  fase 2 sin `combineSeverity(deploy.state, health.state)` en veldefinert input.
- `environments[]` er alltid i rekkefølge `prd, tst, dev`.
- `env`: `dev | tst | prd`
- `state`: `success | in_progress | failure | unknown`
- `sha`: 7-tegns kort-SHA (null ved `unknown`)
- `at`: tidspunkt for gjeldende status (ISO, null ved `unknown`)
- `ticket`: `ETU-\d+` fra commit-tittel, ellers `null`
- `pr`: heltall fra `(#\d+)` i commit-tittel, ellers `null`
- `url`: lenke til deploy-loggen (`log_url`/`target_url` fra status), fallback
  `https://github.com/{repo}/deployments`

**Degradering:** mangler `GH_TOKEN` eller feiler alle kall for en tjeneste → alle
miljøer får `state: "unknown"`, `deploy.state: "unknown"`, tom/`unknown`
`environments`. Collectoren kjører videre (som fase 1).

## Collector

Nytt modul **`scripts/status/deployEnvironments.js`** (erstatter `deploy.js`) med
rene, testbare funksjoner:

- `selectLatestDeployment(deploymentsWithState)` → for ett miljø: nyeste deployment
  hvis state ≠ `waiting`; hopper over `waiting`; `null` hvis ingen kvalifiserer.
- `mapDeploymentState(githubState)` → normalisert state (tabell over).
- `extractTicket(commitMessage)` → `ETU-\d+` (første treff) eller `null`.
- `extractPr(commitMessage)` → heltall fra `(#\d+)` eller `null`.
- `buildDeployEnvironment({ env, deployment, statusState, commitMessage, repo })`
  → ett `environments[]`-objekt.
- `buildDeploy(environments)` → setter `state` (= prd) + sorterer `prd,tst,dev`.

Orkestrering **`fetchDeployEnvironments(service, fetchers)`** (fetchers injiseres for
testbarhet): for hvert miljø i `service.environments`, hent nyeste deployments, finn
første ikke-`waiting` (hent status per deployment til treff), hent commit-melding for
SHA-en, bygg objektet. Feil på ett miljø → det miljøet blir `unknown`; total feil →
alle `unknown`.

`buildStatus.js` kaller `fetchDeployEnvironments` i stedet for
`selectDeployRun`/`buildDeploy`. `health`-feltet er urørt (fase 1/2 eier det).

## Config (`services.js`)

```js
{ name: 'products-api', repo: 'entur/products-api', environments: ['dev','tst','prd'] }
```

- Ny valgfri `environments` (default `['dev','tst','prd']`).
- Fjern `deployWorkflowNames` og `branch` (ikke lenger i bruk for deploy).

## Frontend

**`ServiceCard`:** topp-prikk = `deploy.state` (prd). Under tittelen: én rad per miljø
i rekkefølge PRD → TST → DEV:

```
PRD  ● 965bd60  ETU-73549
     5 uker siden
TST  ● 8796c83  PR: 424
     3 uker siden
DEV  ● 6edc092  PR: 432
     4 dager siden
```

- Prikkfarge per rad = `envStateColorKey(env.state)`.
- Referanse: `env.ticket ?? (env.pr ? 'PR: ' + env.pr : env.sha)`.
- `in_progress` viser «deployer…» der tid ellers står; `failure` viser «feilet».
- `unknown`-miljø: grå prikk + «ingen data».

**`statusFormat.js`** — nye rene funksjoner:

- `envStateColorKey(state)` → `success | warning | negative | neutral`
- `envStateLabel(state)` → norsk tekst (`deployer…`, `feilet`, `ingen data`)
- `deployRef(env)` → referanse-strengen (ticket / `PR: n` / sha)

## Testing

- **Collector:** enhetstester på `selectLatestDeployment` (hopper over `waiting`,
  velger nyeste reelle, tom → null), `mapDeploymentState` (alle states + ukjent),
  `extractTicket`/`extractPr` (treff, manglende, flere), `buildDeploy` (rekkefølge
  prd/tst/dev, headline = prd), og `fetchDeployEnvironments` med injiserte fetchers
  (per-miljø-feil → unknown; total feil → alle unknown).
- **Frontend:** `statusFormat`-tester (`envStateColorKey`, `envStateLabel`,
  `deployRef`-fallback ticket→pr→sha). `ServiceCard`-tester: tre miljø-rader i riktig
  rekkefølge, referanse-fallback, farger per state, `in_progress`/`failure`/`unknown`-
  tekst, topp-prikk = prd.

## Forutsetninger

1. **Token-tilgang:** `GH_TOKEN` i collectoren må ha lese-tilgang til Deployments- og
   Contents-API på de tre repoene. Fase 1 leser allerede `actions/runs` på samme
   repoer med samme token, så tilgangen finnes trolig allerede.
2. **Deployment-records finnes:** bekreftet empirisk at `entur/gha-helm` sitt
   job-nivå `environment:` produserer deployment-records per dev/tst/prd for alle tre
   tjenestene.

## Avgrensning

- Samme tre tjenester som fase 1; config-drevet for utvidelse.
- Ingen historikk/grafer — kun gjeldende versjon per miljø.
- Uavhengig av fase 2; deler kun `ServiceCard` og `status.json`.
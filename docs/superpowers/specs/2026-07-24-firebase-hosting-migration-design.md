# Migrere driftsstatus-bergen til Firebase Hosting

**Dato:** 2026-07-24
**Status:** Godkjent design

## Mål

Speile deploy-oppsettet fra `entur/velkomsttavle-bergen` slik at `driftsstatus-bergen`
bygges med Vite og deployes til Firebase Hosting via AppFactory + GitHub Actions
(nøkkelløs Workload Identity-auth). Rydde bort det gamle `gh-pages`-deployoppsettet.

## Kontekst

- Appen er en Vite + React-app, tilnærmet identisk struktur som velkomsttavle-bergen.
- `.entur/application.yaml` (kind `GoogleCloudFirebaseApplication`, id `statusber`) og
  `.entur/cicd.yaml` er allerede satt opp riktig, men ikke committet.
- Dagens deploy skjer via `gh-pages`-scriptet i `package.json`. Det finnes **ingen**
  faktiske Vercel-filer i repoet (kun `.vercel`/`.output` i `.gitignore`).
- GCP-prosjektet `ent-statusber-prd` er ikke provisjonert enda (opprettes av AppFactory
  når `.entur`-manifestene merges). Navnet følger konvensjonen `ent-<app-id>-prd`.

## Filer som legges til (mirror av referansen)

### `firebase.json`
Identisk med referansen: hosting fra `dist`, SPA-rewrite (`**` → `/index.html`),
`Cache-Control: public, max-age=31536000, immutable` for `.mp4`, standard ignore-liste.

### `.firebaserc`
```json
{
  "projects": {
    "default": "ent-statusber-prd"
  }
}
```

### `.github/workflows/deploy.yml`
Mirror av referansen, med prosjekt-ID byttet fra `ent-tavleber-prd` til `ent-statusber-prd`:
- Trigger: push til `main` (kun relevante paths) + `workflow_dispatch`
- `concurrency: deploy-prd`, `cancel-in-progress: false`
- Node 22, `yarn install --frozen-lockfile`, `yarn build`
- Nøkkelløs GCP-auth via `entur/gha-meta/.github/actions/cloud-auth@v1`
- `firebase deploy --only hosting --project ent-statusber-prd --non-interactive`

## Endringer i eksisterende filer

### `package.json`
- Legg til `firebase-tools` i `devDependencies`.
- Legg til `"deploy:firebase": "vite build --config vite.config.js && firebase deploy --only hosting"`.
- **Fjern** `"deploy": "... gh-pages -d dist"` og `gh-pages` fra `devDependencies`.

### `vite.config.js`
- Fjern kommentaren «Base path for GitHub Pages deployment» (base `/` beholdes — passer Firebase).

### `.entur/application.yaml` + `.entur/cicd.yaml`
- Allerede korrekt (staged). Committes sammen med resten uten endring.

## Utenfor scope (YAGNI)

- `sync-floorplan.yml` og `scripts/` fra referansen (spesifikt for velkomsttavle sitt kartverk).
- Versjonsbump av `@entur/*` eller andre avhengigheter — kun deploy-migrering.
- Endring av `.vercel`/`.output` i `.gitignore` (harmløst, beholdes).

## Verifisering

- `yarn install` + `yarn build` skal produsere `dist/` lokalt.
- Faktisk Firebase-deploy kjører først når `.entur`-manifestene er merget og AppFactory
  har provisjonert `ent-statusber-prd` + Workload Identity. GitHub Actions-kjøringen kan
  ikke fullføres lokalt; build verifiseres lokalt.

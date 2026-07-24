# Tavla
This is just a simple Github Page project to host a single web-page that shows a combination of [Entur tavla](https://tavla.entur.no) and [Yr widget](https://developer.yr.no/doc/guides/available-widgets/).
The purpose of the project is just to have a screen at our office to show busses and trams and a weather-forecast so we can plan when its the best time to leave office.

## Tech Stack

This project is built with:
- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.


## Online

go to https://stunor92.github.io/entur-tavla/ or https://entur.sturle.dev/

## Driftstatus-collector (fase 1)

En planlagt GitHub Action (`.github/workflows/status-collector.yml`) henter deploy-status og publiserer `status.json` til GCS-bucketen `ent-statusber-prd-status`.

Forutsetninger som må settes opp manuelt én gang:
1. GCS-bucketen med offentlig lesing + CORS (se `infra/gcs-cors.json`) og skrivetilgang for CI-tjenestekontoen.
2. Repo-secret `STATUS_GH_TOKEN` med Actions:read på `entur/products-api`, `entur/products-spring`, `entur/distribution-channels-api`.

Merk: workflowen må ligge på `main` før `schedule`/`workflow_dispatch` virker.
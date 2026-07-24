# Design: header-forenkling og fargekodet driftsstatus-ticker

Dato: 2026-07-24

## Mål

1. Forenkle headeren: vis kun Entur-logoen, litt større. Fjern «Driftstatus»-teksten og saue-ikonet fra headeren.
2. Flytt «Driftsstatus»-teksten ned i tickeren, som en fast etikett i starten av linja (scroller ikke).
3. Vis kun driftsmeldinger som er aktive nå eller i framtiden.
4. Fargekod tickeren: grønn = ingen avvik, gul = planlagt hendelse, rød = pågående hendelse. Prioritet rød > gul > grønn.

## Datakilde

Bytt ticker-kilden fra `https://status.entur.org/history.rss` (hovedsakelig løste hendelser, ingen ren «aktiv/framtidig»- eller «planlagt vs. pågående»-info) til Statuspage sitt JSON-API:

```
https://status.entur.org/api/v2/summary.json
```

Relevante felter i svaret:

- `incidents[]` – API-et returnerer her kun uløste hendelser. Regnes som **pågående**.
- `scheduled_maintenances[]` – hvert element har `status ∈ {scheduled, in_progress, verifying, completed, ...}`. Vi tar med `scheduled`/`upcoming` og `in_progress`. Regnes som **planlagt**.

Filtreringen «kun aktiv nå eller i framtiden» oppnås dermed direkte: uløste hendelser og kommende/aktivt vedlikehold er per definisjon aktive nå eller i framtiden. Løste hendelser og fullført vedlikehold er ikke med i disse listene.

## Komponenter og dataflyt

### Ny/endret datalag: `src/lib/fetchStatusFeed.js`

Ren funksjon(er) med signatur omtrent:

```
fetchStatusFeed(url) -> Promise<{ messages: Message[], overall: Overall }>
parseStatusFeed(json) -> { messages: Message[], overall: Overall }   // ren, testbar
```

- `Message = { title: string, kind: 'ongoing' | 'planned' }`
  - `title` for hendelser: `incident.name`.
  - `title` for vedlikehold: `maintenance.name`.
- `Overall = 'red' | 'yellow' | 'green'`

Parsing skilles fra fetch slik at parsing kan enhetstestes med mock-JSON (samme mønster som dagens `parseRssTitles` vs. `fetchStatus`).

### Fargelogikk (ren funksjon)

```
utledOverall(messages):
  hvis minst én message.kind === 'ongoing'  -> 'red'
  ellers hvis minst én 'planned'            -> 'yellow'
  ellers                                     -> 'green'
```

Prioritet: rød > gul > grønn. Aktivt vedlikehold (`in_progress`) teller som `planned` (gul), etter avklaring – rød er reservert for uplanlagte hendelser.

Plasseres sammen med parsing i `fetchStatusFeed.js` (f.eks. eksportert `utledOverall`).

### Header: `src/App.jsx`

- Fjern `<Heading as="h1">Driftstatus</Heading>`.
- Fjern `<img src="/sheep.svg">`.
- Behold `Contrast`-baren; vis kun `<img src="/logo.svg">` med økt høyde (`40px → ca. 64px`), sentrert.

### Ticker: `src/components/StatusTicker.jsx` + `src/css/main.css`

Ny prop-form: `<StatusTicker messages={...} overall={...} />` (App sender ned resultatet fra `fetchStatusFeed`).

Layout (flex-rad):

1. **Fast etikett** «Driftsstatus» i starten av linja – scroller ikke.
2. Deretter scrollende meldinger (samme `ticker-scroll`-animasjon som i dag), duplisert for sømløs loop.

Farger på hele baren etter `overall`:

| overall | bakgrunn  | tekst  |
|---------|-----------|--------|
| green   | `#2d8a4e` | hvit   |
| yellow  | `#f5c542` | mørk   |
| red      | `#c4271e` | hvit   |

Nyansene justeres mot Entur-tokens (`@entur/tokens`) der passende token finnes; hex-verdiene over er utgangspunkt.

Tilstander:

- **green / ingen meldinger**: fast etikett + statisk tekst «Ingen avvik – alle systemer i normal drift». Ingen scroll.
- **yellow / red**: fast etikett + scrollende meldinger.

## Feilhåndtering

- Ved fetch-feil: behold forrige visning (samme som i dag i `App.jsx`). Ingen krasj.
- Ved ugyldig/uventet JSON: `parseStatusFeed` returnerer `{ messages: [], overall: 'green' }` (fail-safe: viser «ingen avvik» heller enn feil).

## Testing

Enhetstester (Vitest):

- `utledOverall`: alle kombinasjoner (kun ongoing, kun planned, blandet, tom) og at prioritet rød > gul > grønn holder.
- `parseStatusFeed`: mock `summary.json` med (a) uløst hendelse, (b) kommende vedlikehold, (c) aktivt vedlikehold, (d) tomt – verifiser `messages` og `overall`.
- `StatusTicker`: rendrer fast etikett; viser statisk grønn-tekst når tom; setter riktig bakgrunnsfarge per `overall`.

Oppdater/erstatt eksisterende `StatusTicker.test.jsx`. `parseRssTitles.js` og tilhørende test kan fjernes hvis den ikke brukes andre steder (verifiseres i implementasjonsplanen).

## Avgrensninger (YAGNI)

- Ingen visning av tidspunkt/varighet per melding i denne omgangen – kun tittel.
- Ingen lenking til `status.entur.org`-detaljside.
- Ingen egen håndtering av `status.indicator` fra API-et; `overall` utledes fra meldingslistene slik at fargelogikken er én kilde.

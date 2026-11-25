# Park HUD

A heads-up display for Meta Ray-Ban Display glasses that shows live ride wait
times for Disneyland and Disney California Adventure and points you to any
attraction with a compass reticle.

Built with the [Meta Wearables Web App toolkit](https://github.com/meta/meta-wearables-webapp)
scaffold (React, Vite, TypeScript) using its custom-UI mode, because the HUD look
is drawn by hand rather than with Meta's stock components. It follows the
toolkit's device rules: a fixed 600 by 600 canvas, pure black background (black is
transparent on the additive display), D-pad focus with no cursor, and no in-app
Back button.

## Using it

| Input | Wait list | Target view |
|---|---|---|
| Swipe up / down | Move through rides | |
| Swipe left / right | Switch park | |
| Pinch (Enter) | On SORT: cycle wait time, nearest, A to Z. On AREA: cycle through the park's lands. On a ride: lock it as the target | Rescan wait times |
| Back gesture (Escape) | | Return to the list |

The target view shows straight-line distance, an estimated walk time, the ride's
current wait, and an arrow toward it. The arrow uses the glasses' compass when
available, falls back to GPS direction of travel while you are walking, and
otherwise draws north-up with a cardinal direction.

## Data

- Wait times: [ThemeParks.wiki API](https://api.themeparks.wiki/docs/v1/), fetched
  from the browser every 30 seconds while the display is on. No key required.
  The last good reading is cached and marked with its age if the link drops.
- Lands: the source has no land data, so `src/lands.ts` assigns each ride by name,
  falling back to the land of the nearest known ride.
- Attraction coordinates: baked into `public/parks.json` by
  `scripts/fetch-parks.mjs` during each deploy.

This is an unofficial fan project and is not affiliated with Disney, Marvel, or Meta.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run build
```

Run Meta's quality gate from a checkout of the toolkit:

```sh
node <toolkit>/plugins/meta-wearables-webapp/skills/ai-glasses-webapp-test/scripts/check-webapp.mjs .
```

## Deploy

Pushing to `main` builds the site and publishes it to the `gh-pages` branch
through `.github/workflows/pages.yml`. GitHub Pages serves that branch
(**Settings > Pages > Source: Deploy from a branch, `gh-pages` / root**).

## Add to the glasses

In the Meta AI app: **Devices > Display Glasses settings > App connections >
Web apps > Add a web app**, then enter a name and the Pages URL.

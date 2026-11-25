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

Swipe left or right to move between five views. Swipe up or down to move through
the controls in a view, and pinch to act. The back gesture leaves a target lock.

| View | What it shows |
|---|---|
| OVERVIEW | Crowd gauge, average wait by land, and the three best rides to do next (wait plus walk, weighted toward headline rides and rides well below today's peak) |
| SCAN | Every ride with its wait, trend arrow, and land. Pinch SORT or AREA to cycle them, pinch a ride to lock it |
| RADAR | A scope of rides around you, coloured by wait. Swipe up or down to step through contacts, pinch to lock |
| MISSION | Your ride queue, ordered into a walking route with total walk and queue time. Arriving at a ride ticks it off |
| SYSTEM | Sound, location, alert and trend controls, plus voice command examples |

Locking a ride opens the target view: distance, walk time, current wait, a trend
sparkline, today's peak, and an arrow toward the ride. The arrow uses the glasses'
compass when available, falls back to GPS direction of travel, and otherwise draws
north-up. The heading is taken from where the display is facing, not from
its top edge, so it holds up when the display is worn or held upright. If the arrow
points the wrong way round on your device, flip COMPASS on the SYSTEM view. From there you can add the ride to the mission, set an alert for when its
wait drops below a threshold (or when it reopens), or rescan.

Location is only requested after you pinch something that needs it. Trends, the
mission, and alerts are stored on the device in `localStorage`. Alerts fire while
the app is open.

When Meta AI's WebMCP bridge is present the app registers voice tools: park
status, ride waits, navigate to a ride, recommend the next ride, set an alert, add
rides to the mission, and switch park.

## On a phone

Open the same URL on a phone and the app switches to a touch layout by itself. It
treats any touch screen that is not the glasses' 600 px square as a phone, scales
the HUD panes to fit, and re-measures on every resize, which is what a folding
phone reports when it opens or closes.

- **Folded iPhone Duo, or a small phone:** one pane.
- **Unfolded iPhone Duo, or a tall phone:** two panes. The second is a linked
  display that shows the radar (tracking the locked ride while navigating), or the
  overview while the main pane is the radar. Panes sit side by side in landscape
  and stack in portrait.

Tap the view tabs or swipe sideways to change view, drag up or down to move through
a list, tap to select, and use the BACK button or a rightward swipe to leave a
target lock. Add it to the Home Screen from Safari's share sheet to run it full
screen. Append `?mode=glasses`, `?mode=phone` or `?mode=duo` to force a layout.

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

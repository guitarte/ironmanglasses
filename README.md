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

Swipe left or right to move between eight views. Swipe up or down to move through
the controls in a view, and pinch to act. The back gesture leaves a target lock.

| View | What it shows |
|---|---|
| OVERVIEW | Crowd gauge, average wait by land, and the three best rides to do next (wait plus walk, weighted toward headline rides and rides well below today's peak) |
| SCAN | Every ride with its wait, trend arrow, and land. Pinch SORT or AREA to cycle them, pinch a ride to lock it |
| RADAR | A 3D scope of rides around you: a tilted disc with a pillar per ride, coloured and sized by wait. Swipe up or down to step through contacts, pinch to lock |
| MAP | A 3D map of the whole park that slowly orbits, with land labels, a pillar per ride and your mission route drawn across it |
| SIGHT | A look-around view: turn your head and rides slide along a compass tape in the direction they really are, with wait and distance. Pinch to lock the one you are facing. Without a compass, swipe down to pan |
| SHOWS | Park hours with time left, and upcoming showtimes soonest first. Pinch a show for a reminder 15 minutes before it starts |
| MISSION | Your ride queue, ordered into a walking route with total walk and queue time. Arriving at a ride ticks it off |
| SYSTEM | Sound, location, alert, trend, compass and colour theme controls, plus voice command examples |

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

The 3D views are drawn with three.js on a transparent canvas, with all text kept in
the DOM. The library is loaded only when a 3D view is first opened, so it does not
count against the first load. If WebGL will not start, RADAR falls back to the flat
scope, and 3D VIEWS on the SYSTEM view turns them off.

Screens change with a scan-bar wipe and cascading rows, a target lock opens like an
iris, and switching park flips the view. With reduced motion set, these become a
plain cross-fade and the 3D views stop animating.

## Ride displays

Lock a ride and choose **RIDE HUD** to open an on-ride display driven by the
motion sensors. It needs no input once open: the clock starts when the ride
moves and stops when the motion settles, and your best peak for each ride is
remembered. Each kind of ride gets its own original instrument panel and colours:

| Display | Rides | Instrument |
| --- | --- | --- |
| Starflight deck | Space Mountain | Artificial horizon |
| Mine train gauges | Big Thunder Mountain | Artificial horizon |
| Alpine sled computer | Matterhorn | Artificial horizon |
| Launch telemetry | Incredicoaster and other coasters | Artificial horizon |
| Race day dash | Radiator Springs Racers, Autopia | Artificial horizon |
| Drop shaft monitor | Mission: Breakout and other drops | Weightlessness gauge |
| River run log | Bayou Adventure, Grizzly River Run, Pirates | Weightlessness gauge |
| Expedition seismograph | Indiana Jones Adventure | Shake rings |
| Cockpit motion deck | Smugglers Run, Star Tours, Soarin' and similar | Shake rings |
| Dark ride drift meter | Haunted Mansion and Fantasyland dark rides | Shake rings |

Any other ride gets a general telemetry display. Follow the ride's own rules
about loose articles and glasses.

## Hands-free and head-worn extras

- **Head control** (System): flick your head left or right to change view and
  nod to pinch. In the sight view, holding your gaze on a ride locks it.
- **Glance mode** (System, glasses only): ten seconds after you lock a ride the
  display fades to just the compass and the turn cue. Any input wakes it.
- **My pin** (System): drop a pin where you are standing, such as a parked
  stroller or a meeting spot, then navigate back to it like any ride.
- The footer carries a ticker of park headlines, and the ring by the clock
  drains until the next refresh.

## On a phone

Open the same URL on a phone and the app switches to a touch layout by itself. It
treats any touch screen that is not the glasses' 600 px square as a phone, scales
the HUD panes to fit, and re-measures on every resize, which is what a folding
phone reports when it opens or closes.

The main pane always takes the full short side of the screen, and a deck fills
whatever is left with a live scope and tappable cards (best move or the ride being
tracked, next show, park hours). That covers every pose:

- **Folded, portrait or landscape:** pane plus a deck below or beside it.
- **Unfolded, portrait or landscape:** a full-size pane plus a deck.
- **Half folded (tabletop or tent):** when the browser reports two viewport
  segments, one pane sits on each half so nothing straddles the hinge: the main
  view on one and a linked radar or overview on the other. Add `?fold=side` or
  `?fold=stack` to force this.

Tap the view tabs or swipe sideways to change view, drag up or down to move through
a list, tap to select, and use the BACK button or a rightward swipe to leave a
target lock. Add it to the Home Screen from Safari's share sheet to run it full
screen. Append `?mode=glasses`, `?mode=phone` or `?mode=duo` to force a layout.

## Data

- Wait times: [ThemeParks.wiki API](https://api.themeparks.wiki/docs/v1/), fetched
  from the browser every 30 seconds while the display is on. No key required.
  The last good reading is cached and marked with its age if the link drops.
- Single rider waits, Lightning Lane return times and showtimes come from the same
  live feed; park hours from the API's schedule endpoint, cached for an hour.
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

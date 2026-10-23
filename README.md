# Cross Seminole

A long, quiet, first-person bike ride across central Florida.

You start in the driveway of an ordinary house on an Orlando cul-de-sac, roll out
through the neighborhood, pick up the trail at the trailhead, and keep going for
as long as you like. The trail ahead is generated as you ride, so it never ends
and is never the same twice. It passes through:

- shady oak hammocks hung with Spanish moss
- pine flatwoods and saw palmetto
- boardwalks over cypress swamps
- lakeshores with fishing piers
- citrus groves
- backyard stretches lined with privacy fences and screened pool cages
- road crossings
- little towns like Winter Springs, Oviedo, Longwood, Lake Mary, Sanford and
  Winter Park

Some stretches borrow from real Orlando-area trails:

- **Lake loops**, after Lake Underhill: a concrete path on the seawall, lamp
  posts and palms, aerating fountains out on the water, Lake Underhill Rd
  alongside, an expressway on piers overhead, and downtown on the horizon.
- **Greenways**, after the Cady Way Trail: a mowed power-line corridor with
  steel lattice towers and sagging wires, backyard chain-link, and a white
  arched pedestrian bridge high over six lanes of traffic.
- **Old rail beds**, after the Cross Seminole and Flagler trails: dead
  straight, with gravel shoulders, ditches on both sides, leftover telegraph
  poles, wooden trestles over creeks, and railroad crossbucks at the road
  crossings.
- **The Florida Trail**: narrow sand singletrack through palmetto, orange
  blazes on the pines, little footbridges and fallen logs, with hikers instead
  of cyclists.

Painted tree lines, rooftops, city blocks and the downtown skyline stand back
from the trail on both sides. They close the world in, so it feels like woods
and neighborhoods rather than an open lawn. Overhead, a field of cumulus
stretches across the whole sky. The clouds drift and reshape, they build
through the afternoon, and thunderheads with flat anvils tower on the horizon.

## Places worth a stop

Every couple of miles a brown sign points down a short spur to a place of
interest. These are built in much more detail than the trail itself, and
you're meant to stop. Roll into the little plaza, stop, and press **E** to
lean the bike on its kickstand and walk around on foot. When you're done,
walk back to the bike and press **E** again to ride on.

| | |
|---|---|
| **Springs** | A clear blue basin you can see right into. The boil turns over at the vent, mullet and bass drift over the sand, and turtles sun on a fallen log. A dock with a swim ladder reaches out over the water, under a shady hammock of oaks, palms and ferns. |
| **Observation towers** | A boardwalk across a wet prairie to a two-storey tower over open marsh. Climb both flights of stairs, then use the coin binoculars at the top to watch spoonbills, ibis, egrets, herons and the odd alligator. |
| **Ancient cypress** | One enormous bald cypress, its fluted trunk hung with moss and surrounded by knees, with a boardwalk loop all the way around it through the swamp. |
| **Trailside parks** | A pavilion with picnic tables, a playground with swings that move, restrooms, flower beds, a flag on the breeze, and a gopher tortoise out for a stroll near its burrow. |
| **Fish camps** | A bait shop up on stilts with a porch, airboats tied to the docks, canoes on a rack, a pickup by the ramp, and a heron waiting for scraps. |
| **Historic depots** | A board-and-batten station named for its town, a red caboose on a stub of track, a water tower, a baggage cart and a semaphore signal. |

Each place has interpretive signs. Walk up to one, face it and press **E** to
read about springs, alligators, Spanish moss, gopher tortoises, the
north-flowing St. Johns, Sanford's celery or rails-to-trails. Places you reach
are logged on the pause screen. At night, fireflies come out over the springs
and swamps.

The places match the land around them: springs and big trees in hammocks and
swamps, towers and fish camps by marsh and open water, parks in town, and
depots along the old rail beds. Real Central Florida names are used, like Rock
Springs, Big Tree Park, Black Hammock Landing and the Old Oviedo Depot.

The HUD stays out of the way. There's no on-screen speedometer or minimap.
Speed, distance, ride time and the clock are on a small cycle computer clipped
to your handlebars. When you ride into a new place, its name fades in at the
bottom of the screen for a few seconds and then fades out. Real signs along the
trail do the rest: city-limit signs, park entrance signs, street signs at
crossings and mile markers.

## Play

It's a static web page, with no build step and no dependencies to install
(Three.js is vendored in `vendor/`). ES modules don't load from `file://`, so
serve the folder over HTTP:

```sh
python3 -m http.server 8000
# or: npx http-server -p 8000
```

Then open <http://localhost:8000>. It also works as-is on GitHub Pages.

Every ride is a random route. To ride the same one again, use `?seed=12345`.
The route number is on the title screen and the pause screen.

## Controls

| | |
|---|---|
| **W** / **↑** | pedal |
| **S** / **↓** | brake |
| **A D** / **← →** | steer |
| **Shift** | pedal harder |
| **C** | cruise: holds a set speed and follows the trail on its own, so you can just look around |
| **−** / **+** (or **[** / **]**) | cruise speed, 2 mph at a time, from 4 up to 30 mph (starts at 14) |
| **Mouse** | look around (click to capture the mouse; your head drifts back to center when you stop moving it) |
| **Space** / **B** | ring the bell |
| **E** | when stopped: get off and walk around. On foot: get back on, read a sign, use binoculars |
| On foot | **W S** walk, **A D** sidestep, **← →** turn, mouse to look, **Shift** to run |
| **U** | switch between mph and km/h |
| **T** | skip ahead an hour |
| **R** | call in a thunderstorm now, or send the current one away |
| **M** | mute |
| **F** | fullscreen |
| **Esc** / **P** | pause |

On a gamepad: RT pedals, LT brakes, the left stick steers, the right stick looks
around, X toggles cruise, the D-pad sets cruise speed, A rings the bell, and B
gets you off and on the bike, reads signs and uses the binoculars. On foot, the
left stick walks.

The cruise speed is on the handlebar computer (`CRZ 14`) whenever cruise is on.

### Phones and tablets

The game plays on a touchscreen in either orientation. When you touch the
screen, a few translucent controls appear:

- **Steering slider** (bottom left): slide it sideways. It springs back to
  center when you let go.
- **Pedal** and **Brake** (bottom right): hold them.
- **Cruise** with **−** / **+**: turns cruise on and off and sets its speed.
- **Bell** and **pause** (top right).

Drag anywhere else on the screen to look around. The controls fade back once
you're just cruising.

When you stop at a place of interest, a **Walk around** button appears. On
foot, the steering slider becomes a move stick (push it all the way out to
run), and the same button changes to **Read**, **Binoculars** or **Ride**
depending on what you're next to.

The easiest way to ride on a phone is to tap Cruise and look around. On phones
the game also:

- goes fullscreen when you start
- pauses if you switch apps
- widens the view in portrait so you still see the trail ahead
- lowers resolution and shadow detail to keep the frame rate up

## Things you might notice

- Time passes at six times real speed. Leave at 8 a.m. and the cumulus thicken
  into lines across the sky while thunderheads build on the horizon. After about
  two hours of riding, the sun goes down, the crickets start and your headlight
  comes on.
- Most summer afternoons a thunderstorm builds over the interior. You see it
  first as a tower on the horizon. Then the sky closes over and goes grey, the
  wind comes up, and it pours, with lightning and thunder that arrives late if
  the strike was far away. Other trail users head home. The pavement goes dark
  and wet, the streetlights and trail lights click on in the gloom, and once it
  passes the frogs start up and the pavement dries out in the sun. Some days
  stay dry.
- Sunsets are what the storms leave behind. The sky goes from periwinkle
  overhead through rose and coral to a burning orange band at the horizon.
  Broken clouds light up salmon and gold from below, and thunderheads blush.
  Turn around for the pink belt of Venus over the blue earth shadow. Lakes,
  ponds and swamps reflect the whole sky in the ripples. After the sun goes
  down, the afterglow fades through magenta and violet while the streetlights
  come on.
- At dusk, knee-high bollard lights start to glow through towns, lake parks,
  greenways and neighborhood stretches. Each throws a dim pool of warm light
  across the pavement. The woods, swamps, groves and rail beds stay dark.
- The moon starts each ride as a waning half and moves an eighth of a cycle
  each night: waning crescent, new, waxing crescent, waxing half, waxing
  gibbous, full, waning gibbous, and back to half. It rises and sets with its
  phase. The waning half comes up around 1 a.m., and a full moon is up all
  night. Moonlight is as bright as the phase allows, so a full moon lights the
  trail blue and casts shadows, while a new moon leaves only your headlight.
  The pause screen shows tonight's moon.
- Bridge ramps are real climbs: you'll slow down going up and coast down the
  other side.
- Other trail users come the other way: cyclists, joggers, and people walking
  dogs. Most of them wave as you pass.
- Cars stop at crossings to let you through.
- In wetlands and ponds you'll see sandhill cranes, egrets and the occasional
  alligator. In downtown Oviedo there are chickens.
- Everything you hear is synthesized live: wind, tire hum, the freewheel ticking
  while you coast, planks on the boardwalk, cicadas, cardinals, mockingbirds,
  frogs and passing traffic.

## Code layout

| file | what it does |
|---|---|
| `src/main.js` | renderer, game loop, overlays |
| `src/path.js` | the endless trail polyline: curvature, boardwalks, crossings, nearest-point queries |
| `src/regions.js` | the sequence of places and the kind of landscape each one has |
| `src/world.js` | streams 200 m chunks around the rider and builds surfaces and scenery for each region type |
| `src/scenery.js` | low-poly prototypes (oaks, pines, palms, houses, pool cages, power towers, cars, signs) batched into instanced meshes |
| `src/poi.js` | places of interest: springs, towers, big trees, parks, fish camps, depots, their signs and boardwalks |
| `src/walker.js` | walking on foot: collisions, stairs and decks, water edges, footsteps |
| `src/walls.js` | procedurally painted backdrops (forest, pines, cypress, suburb, city, skyline, grove) |
| `src/bike.js` | bike physics, collisions, cruise autopilot, the first-person bike and rider, the cycle computer |
| `src/npc.js` | trail users and traffic |
| `src/sky.js` | time of day, sun, sky dome with the sunset and cloud field, thunderheads, stars, vultures |
| `src/weather.js` | afternoon thunderstorms: rain, lightning, thunder, wet pavement |
| `src/audio.js` | procedural WebAudio soundscape |
| `src/input.js` | keyboard, mouse, touch and gamepad |

The world is deterministic per seed. Chunks behind you are discarded and rebuilt
exactly the same if you turn around.

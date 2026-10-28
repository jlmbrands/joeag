# joe.ag

A small blocky town in Texas you walk around in first person. Every building is something Joseph built. Walk up to a door and press E to go in; the interiors have things to find. Other visitors appear as blocky people with their names over their heads, and you can see their fireworks. The Diner has a guestbook; what people write goes on its walls. The front of The Brief is today's front page, pulled from the Substack feed.

No build step, no framework, no npm packages. Three.js is vendored.

```
public/
  index.html       the page: start card, HUD, touch controls
  styles.css       the look
  blocks.js        block types; every texture is drawn into one atlas at load, nothing is fetched
  world.js         the voxel grid, terrain, water, roads, rail, trees, every building and interior, the secrets;
                   16x16 chunks with ambient occlusion; setBlock + flush for live edits
  sky.js           day and night on Texas time, sun, moon, stars, the lights coming on, rain, snow, storms, lightning
  audio.js         the ambient bed and narration (files), footsteps, splashes, thunder, the toll (synthesized)
  net.js           WebSocket client and the two fetches; silently does nothing without a server
  players.js       other visitors, Luke and Novy, the cows
  vehicles.js      the pickup on 287 and the train on the Santa Fe, both rideable
  fireworks.js     rockets, sparks, and the word they spell (WORD at the top)
  game.js          the player, physics, doors, prompts, building, toll, photo mode, map, input
  audio/           ambient.mp3, narration.mp3, thump.mp3, word.mp3, scene.mp3
  vendor/three.min.js   Three.js r160, unmodified
server.js          static files, the WebSocket relay, block edits and the guestbook on disk, /api/brief, /api/reset
package.json       start script and Node version
data/edits.json    appears once someone places a block
data/guestbook.json  appears once someone signs the book
_unused/           earlier versions, kept in case
```

## Run locally

```
node server.js
```

Open http://localhost:3000. Open it in two windows to see multiplayer.

## Deploy on Railway

1. Push this folder to a GitHub repo (or `railway init` from inside it).
2. New project from that repo. Railway detects `package.json` and runs `npm start`.
3. Add the custom domain `joe.ag` under Settings, Networking. Point DNS at the CNAME Railway gives you.
4. Optional but recommended: add a Volume mounted at `/data` and set the environment variable `DATA_DIR=/data`, so the blocks people place survive redeploys. Without it they reset on every deploy.
5. Set `RESET_KEY` to a long random string. Then `https://joe.ag/api/reset?key=THAT` clears everything people built and reloads everyone's page. You will need this.

The server reads `PORT` from the environment. WebSockets work on Railway without any extra configuration.

## What is in the town

- Downtown, north of 287: Savings & Loan (Earned Together), The Brief (today's front page on the facade, the press inside), the Diner (pleasetaste menu board, the guestbook lectern by the door, notes on the walls), the Arcade (BuddyAudit cabinets inside).
- You arrive on the overlook south of town with a worn path down to the Diner.
- South of 287: JLM Brands HQ (lobby with the five brands on the wall), the 1883 depot (haslet.net).
- The prairie: the water tower (haslet.net), a FOR LEASE billboard (d-a-l-l-a-s.com).
- Alliance: the radio tower with its red light (orbn), the $24 express-lane gantry (Who Owns Your Road; walk under it and you get charged), the crane (Chroma Consult).
- The ranch: Joe's place, Luke and Novy (they follow you), cows you can pet, hay, and a hatch in the corner of the house.
- The shed with 23 x's. A ring at the bottom of the lake. A sign at the north edge, and something past it in the corner.
- A train on the Santa Fe and a pickup on 287. Press E near either to ride; W and S drive the truck.

## Keys

W A S D walk, mouse look, Space jump or swim up, E visit/ride/pet/sign, F or right-click fireworks, B build mode (left click place, right click break, 1 to 8 pick a block), M map, P or the Photo button (saves a PNG; on phones it opens the share sheet), T skip an hour, R cycle the weather, Esc release the mouse. Phones get a stick and buttons. The name on the start card is remembered on that device.

## Editing the town

Everything is in `world.js`, in `buildTown()`. Coordinates are blocks; `C` is the town centre (96, 96), x runs east, z runs south.

- Add a building: call a builder (`house`, `flatBuilding`, `waterTower`, `radioTower`, `gantry`, `crane`, `billboard`, `shed`) with a position and `{ title, sub, href, kind }`. `kind` is `site`, `soon` or `lore` and colours the sign. Interiors are the `*Inside` functions.
- A place with `inside: true` only prompts when you are at its height, so basements and lake bottoms work.
- New block types go in `blocks.js`: a painter (16x16, canvas calls) and a `B(top, bottom, side)` entry. Build-mode blocks are `PALETTE` in `game.js`.
- `WORLD.spawn` is where people start.

From the browser console: `__set(yaw, pitch, x, z)` teleports, `__sky.skip(hours)` and `__sky.force('rain')` change the sky, `__game.photo()` takes the picture.

## Credits

Textures, buildings, animals and everything else here are original. It is a blocky world in the general style of voxel games; it uses none of their assets. The ambient bed and one-shots were generated in ElevenLabs; the narration is Joseph.

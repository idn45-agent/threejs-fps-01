# DUSTLINE — a three.js tactical FPS

A round-based tactical first-person shooter in the Counter-Strike style, built
on three.js 0.187.0 (vendored under `game/vendor/three/`). Single-player
against bots on an original desert-dusk map, **Ember Yard**: two bomb sites
(A and B), a mid lane, crates and walls forming lanes, corners and sightlines.

You attack as a lone operative; the defenders hold the sites. Win rounds by
eliminating the defenders or planting the charge at a site. Earn money each
round and spend it in the buy phase (Part 2 fills in the full economy).

Everything in the game — map, textures, sounds — is generated in code. No
downloaded assets, no network requests, no build step: plain static files.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Or serve `game/` with any
static file server.

## Controls

| Key | Action |
| --- | ------ |
| Click | Lock the mouse / play |
| Mouse | Look |
| W A S D | Move |
| Shift | Walk (quiet, accurate) |
| C or Ctrl | Crouch (slower, lower, more accurate) |
| Space | Jump |
| Mouse 1 | Fire |
| R | Reload |
| Esc | Release the mouse |

## Layout

- `main.ts` — Node 22 program that hands the entry in (copies `game/` and
  `screenshots/` to `/output`, writes `dossier.json`).
- `serve.ts` — tiny static server for local play.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.
- `game/index.html` — the game page (import map + HUD).
- `game/src/` — the game, one job per module:
  `state.js`, `textures.js`, `world.js`, `input.js`, `player.js`,
  `weapon.js`, `audio.js`, `bots.js`, `rounds.js`, `hud.js`, `main.js`.

## License

MIT — see `LICENSE`.

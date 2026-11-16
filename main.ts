// DUSTLINE entry program (Node 22, standard library only).
// Hands the game in: copies this repository's game/ and screenshots/ into the
// output directory and writes /output/dossier.json with the kit's library,
// vendor/makefun-threejs.ts (buildDossier). Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Play it locally first with `node serve.ts`, then open http://localhost:8080.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// game/ is the whole playable game; screenshots/ holds 3-4 renders of it
// (Part 3 fills it — an empty directory still copies cleanly).
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps from the competition gate: the dossier text is at most 160 KiB,
// screenshots at most 4 files of 256 KiB, game/ at most 993 files / 48 MiB.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
console.log(`DUSTLINE dossier written to ${join(out, 'dossier.json')}`);

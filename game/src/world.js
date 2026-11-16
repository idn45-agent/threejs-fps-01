// world.js — Ember Yard, the original DUSTLINE map.
// A desert-dusk depot, 64 x 44 m: attacker spawn west, two bomb sites east
// (A north, B south), a mid lane with a double-doors gap, crates and walls
// that make lanes, corners and sightlines. Every solid is an axis-aligned
// box; the same list drives both the meshes and the collision, so the player
// and the bots (Part 2) collide with exactly what they see.
import * as THREE from 'three';
import { makeTextures, PALETTE } from './textures.js';

// One box: [x1, z1, x2, z2, height, kind]. Kinds: 'wall' | 'crate' | 'pillar'.
// Pads (the site markers) are visual only and live in SITE_PADS below.
const BOXES = [
  // Outer walls (height 4)
  [-33, -23, 33, -22, 4, 'wall'], // north
  [-33, 22, 33, 23, 4, 'wall'], // south
  [-33, -22, -32, 22, 4, 'wall'], // west
  [32, -22, 33, 22, 4, 'wall'], // east
  // Mid wall with a 4 m gap at the double doors (z -2..2)
  [-0.6, -10, 0.6, -2, 3.2, 'wall'],
  [-0.6, 2, 0.6, 10, 3.2, 'wall'],
  // Mid-lane cover crates
  [-9, -1.6, -6.5, 1.6, 1.2, 'crate'],
  [6.5, -1.6, 9, 1.6, 1.2, 'crate'],
  // A approach: long wall with a gap, then site cover
  [12, -22, 13, -12, 3, 'wall'],
  [16, -18.5, 20, -16.5, 1.2, 'crate'],
  [24, -12, 26.5, -10, 1.2, 'crate'],
  [14, -10, 15, -6, 2.6, 'wall'],
  // B approach: mirror of A
  [12, 12, 13, 22, 3, 'wall'],
  [16, 16.5, 20, 18.5, 1.2, 'crate'],
  [24, 10, 26.5, 12, 1.2, 'crate'],
  [14, 6, 15, 10, 2.6, 'wall'],
  // Pillars guarding the crossroads
  [10, -8, 11, -7, 4, 'pillar'],
  [10, 7, 11, 8, 4, 'pillar'],
  [-12, -8, -11, -7, 4, 'pillar'],
  [-12, 7, -11, 8, 4, 'pillar'],
  // Spawn cover, so the attacker start is not one long sightline
  [-24, -5, -22.5, -2, 2.4, 'wall'],
  [-24, 2, -22.5, 5, 2.4, 'wall'],
  // Connector crates between mid and the sites
  [-4, -14, -2, -12, 1.2, 'crate'],
  [-4, 12, -2, 14, 1.2, 'crate'],
];

export const SITES = {
  A: { x: 22, z: -14, color: PALETTE.teal, label: 'A' },
  B: { x: 22, z: 14, color: PALETTE.amber, label: 'B' },
};

export const PLAYER_SPAWN = { x: -27, z: 0, yaw: -Math.PI / 2 };
export const BOT_SPAWNS = [
  { x: 24, z: -14 },
  { x: 19, z: -9 },
  { x: 24, z: 14 },
  { x: 19, z: 9 },
  { x: 8, z: 0 },
];

export const WORLD = {
  minX: -32, maxX: 32,
  minZ: -22, maxZ: 22,
};

// Collision: move a circle (the player's feet) by (dx, dz) against the boxes.
// Axis-separated: move x, resolve, then z, so sliding along walls works.
export function moveAndCollide(pos, dx, dz, radius) {
  pos.x += dx;
  resolveAxis(pos, radius, 'x');
  pos.z += dz;
  resolveAxis(pos, radius, 'z');
}

function resolveAxis(pos, radius, axis) {
  for (const b of BOXES) {
    const [x1, z1, x2, z2] = b;
    if (axis === 'x') {
      if (pos.z + radius <= z1 || pos.z - radius >= z2) continue;
      if (pos.x + radius > x1 && pos.x - radius < x2) {
        // push out on the side we came from: nearest face wins
        const pushLeft = pos.x + radius - x1; // overlap from the west face
        const pushRight = x2 - (pos.x - radius); // overlap from the east face
        pos.x = pushLeft < pushRight ? x1 - radius : x2 + radius;
      }
    } else {
      if (pos.x + radius <= x1 || pos.x - radius >= x2) continue;
      if (pos.z + radius > z1 && pos.z - radius < z2) {
        const pushUp = pos.z + radius - z1;
        const pushDown = z2 - (pos.z - radius);
        pos.z = pushUp < pushDown ? z1 - radius : z2 + radius;
      }
    }
  }
}

export function buildWorld(scene) {
  const tex = makeTextures();
  const group = new THREE.Group();
  group.name = 'Ember Yard';

  // Dusk sky: warm horizon fading to violet, with fog to soften the far edge.
  scene.background = new THREE.Color(0x3a2b4a);
  scene.fog = new THREE.Fog(0x4a3550, 55, 160);

  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2b2340, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-40, 55, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 160;
  scene.add(sun);

  // Ground: one big sand plane, dunes far outside the walls.
  const groundMat = new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const duneMat = new THREE.MeshStandardMaterial({ color: PALETTE.sandDark, roughness: 1 });
  const duneRand = [42, -58, 70, -80, 95, -20, -95, 30, 60, 85];
  for (let i = 0; i < 10; i++) {
    const dune = new THREE.Mesh(new THREE.ConeGeometry(18 + (i % 3) * 9, 7 + (i % 4) * 2, 7), duneMat);
    const a = (i / 10) * Math.PI * 2;
    dune.position.set(Math.cos(a) * duneRand[i % 10] * 1.4, 0, Math.sin(a) * 62);
    dune.rotation.y = a;
    group.add(dune);
  }

  // Low sun disc on the horizon, due west behind the attacker spawn.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(9, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc27a, fog: false }),
  );
  sunDisc.position.set(-120, 26, -40);
  sunDisc.lookAt(0, 10, 0);
  group.add(sunDisc);

  // Boxes: walls, crates, pillars.
  const wallMat = new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.95 });
  const crateMat = new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.9 });
  const pillarMat = new THREE.MeshStandardMaterial({ map: tex.metal, roughness: 0.6, metalness: 0.4 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x1, z1, x2, z2, h, kind] of BOXES) {
    const w = x2 - x1;
    const d = z2 - z1;
    const mesh = new THREE.Mesh(boxGeo, kind === 'crate' ? crateMat : kind === 'pillar' ? pillarMat : wallMat);
    mesh.scale.set(w, h, d);
    mesh.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Site pads: painted rings on the ground + a slim glowing beacon pillar,
  // so each site reads at a glance from across the map.
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(4.4, 40),
      new THREE.MeshStandardMaterial({ map: tex.sitePad, roughness: 0.9 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.x, 0.02, site.z);
    pad.receiveShadow = true;
    group.add(pad);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 9, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: site.color, transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beacon.position.set(site.x, 4.5, site.z);
    group.add(beacon);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.4, 0.07, 8, 48),
      new THREE.MeshBasicMaterial({ color: site.color }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(site.x, 0.06, site.z);
    group.add(ring);
  }

  scene.add(group);
  return { group, colliders: BOXES };
}

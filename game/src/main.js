// main.js — DUSTLINE entry point. Wires the modules together and runs the
// game: a fixed 60 Hz simulation step kept apart from rendering (the
// accumulator below), the renderer and camera setup, pointer-lock play flow.
// State lives in one object (state.js); this file owns no game numbers.
import * as THREE from 'three';
import { createState } from './state.js';
import { buildWorld, PLAYER_SPAWN } from './world.js';
import { createInput } from './input.js';
import { updatePlayer, eyePosition, lookDirection } from './player.js';
import { createWeapon, updateWeapon } from './weapon.js';
import { createAudio } from './audio.js';
import { spawnBots, updateBots, listHitMeshes, damageBot, hearShot } from './bots.js';
import { startBuyPhase, updateRounds, resetMatch } from './rounds.js';
import { createHud, updateHud } from './hud.js';

const STEP = 1 / 60; // fixed simulation step

const state = createState();
const audio = createAudio();
const canvas = document.getElementById('game');
const input = createInput(canvas);

// --- Renderer and camera.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = buildWorld(scene);
spawnBots(scene, state);
const weaponView = createWeapon(scene, camera);
// The weapon's view of the world: scene objects it raycasts and sounds with.
const view = {
  ...weaponView,
  scene,
  camera,
  audio,
  solids: collectSolids(world.group),
  bots: {
    listHitMeshes: () => listHitMeshes(state),
    damageBot: (id, dmg, head) => damageBot(state, id, dmg, head),
    hearShot: (s, x, z) => hearShot(s, x, z),
  },
};

// Only the map's solid meshes stop bullets (not the sky, beacons or ground
// ring); the ground plane is included so shots into the dirt puff.
function collectSolids(group) {
  const solids = [];
  group.traverse((m) => {
    if (m.isMesh && m.geometry && m.geometry.type === 'BoxGeometry') solids.push(m);
  });
  const ground = group.children.find((m) => m.isMesh && m.geometry.type === 'PlaneGeometry');
  if (ground) solids.push(ground);
  return solids;
}

const hud = createHud();

// --- Play flow: click to lock the mouse and start; Esc unlocks and pauses.
function startPlaying() {
  audio.unlock();
  input.lock();
  state.running = true;
}
hud.els.playBtn.addEventListener('click', startPlaying);
hud.els.restartBtn.addEventListener('click', () => {
  resetMatch(state, audio);
  startPlaying();
});
canvas.addEventListener('click', () => {
  if (!state.running) startPlaying();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state.running) {
    state.running = false; // Esc: back to the title screen, game frozen
    input.firing = false;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Fixed-step loop: simulate in 60 Hz slices, render once per frame.
// No allocations in the hot loop: the camera vectors are reused here.
const camPos = new THREE.Vector3();
let accumulator = 0;
let last = performance.now();

function step(dt) {
  state.elapsed += dt;
  // The player, weapon and bots only simulate during a live round: the
  // buy phase freezes the player at spawn, the banner pauses the fight.
  const live = state.round.phase === 'live';
  if (live) {
    updatePlayer(state, input, dt);
    updateWeapon(state, input, dt, view);
    updateBots(state, dt, { audio });
  }
  updateRounds(state, dt, audio, input);
  // Match over: release the mouse so the restart button is clickable.
  if (state.round.phase === 'matchover' && state.running) {
    state.running = false;
    input.unlock();
    input.firing = false;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let frameDt = (now - last) / 1000;
  last = now;
  if (frameDt > 0.25) frameDt = 0.25; // tab-away spike: never spiral

  if (state.running) {
    accumulator += frameDt;
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
  }

  // Camera follows the player every frame, even on the title screen.
  const eye = eyePosition(state);
  camPos.set(eye.x, eye.y, eye.z);
  camera.position.copy(camPos);
  const p = state.player;
  camera.rotation.set(p.pitch, p.yaw, 0);

  updateHud(state, hud);
  renderer.render(scene, camera);
}

// Player starts at the attacker spawn, facing the sites down mid.
// The match opens in the buy phase: shop first, then the round starts.
state.player.pos.x = PLAYER_SPAWN.x;
state.player.pos.z = PLAYER_SPAWN.z;
state.player.yaw = PLAYER_SPAWN.yaw;
startBuyPhase(state, null);
requestAnimationFrame(frame);

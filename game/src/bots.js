// bots.js — the defenders. Part 1 ships the target-dummy tier: bots that
// stand and wander their post, can be shot (head and body hitboxes), fall
// when killed and respawn after a few seconds, so the game runs end-to-end
// now. Part 2 replaces updateBots with real AI (patrol / engage /
// plant-defend, shooting back) behind the same interface:
//   spawnBots(scene, state) — build the bots once
//   updateBots(state, dt)   — one step of bot behaviour
//   listHitMeshes()         — meshes weapon.js raycasts against
//   damageBot(id, dmg, head) — apply a hit, returns true on a kill
import * as THREE from 'three';
import { BOT_SPAWNS } from './world.js';
import { pushFeed } from './state.js';

const BOT_HEALTH = 100;
const RESPAWN_SECONDS = 5;
const DUMMY_COUNT = 3;

function buildDummyMesh(color) {
  // A training dummy: body box, head box, shoulders, on a round base.
  // Teal visor stripe so the head reads at a glance.
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.9 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x2fd4c4, roughness: 0.3, emissive: 0x0a3a36,
  });
  const add = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(0.52, 0.9, 0.3, 0, 1.05, 0, bodyMat); // torso
  add(0.6, 0.12, 0.34, 0, 1.5, 0, darkMat); // shoulders
  const head = add(0.34, 0.34, 0.32, 0, 1.72, 0, darkMat); // head
  add(0.36, 0.07, 0.02, 0, 1.74, 0.17, visorMat); // visor
  add(0.4, 0.5, 0.22, 0, 0.45, 0, darkMat); // legs
  add(0.62, 0.08, 0.62, 0, 0.04, 0, darkMat); // base
  return { group: g, head };
}

export function spawnBots(scene, state) {
  const bots = [];
  const colors = [0x8a4a2b, 0x5f6e7a, 0x7a5a2e]; // rust, slate, ochre dummies
  for (let i = 0; i < DUMMY_COUNT; i++) {
    const spawn = BOT_SPAWNS[i % BOT_SPAWNS.length];
    const { group, head } = buildDummyMesh(colors[i % colors.length]);
    group.position.set(spawn.x, 0, spawn.z);
    scene.add(group);
    const bot = {
      id: i,
      group,
      head,
      spawn: { ...spawn },
      pos: { x: spawn.x, z: spawn.z },
      yaw: Math.random() * Math.PI * 2,
      health: BOT_HEALTH,
      alive: true,
      respawnAt: 0,
      // Wander state: a small patrol around the post.
      wanderTarget: null,
      wanderUntil: 0,
      speed: 0.8,
    };
    // Tag the hitboxes so weapon.js can tell head from body.
    group.traverse((m) => {
      if (!m.isMesh) return;
      m.userData.botId = i;
      m.userData.part = m === head ? 'head' : 'body';
    });
    bots.push(bot);
  }
  state.bots = bots;
  return bots;
}

export function listHitMeshes(state) {
  const out = [];
  for (const b of state.bots) {
    if (!b.alive) continue;
    b.group.traverse((m) => {
      if (m.isMesh) out.push(m);
    });
  }
  return out;
}

// Part 1 behaviour: wander a few metres around the post, face the player
// when close, and stay put when dead until the respawn timer fires.
export function updateBots(state, dt) {
  const p = state.player;
  for (const b of state.bots) {
    if (!b.alive) {
      if (state.elapsed >= b.respawnAt) respawnBot(state, b);
      continue;
    }
    // Pick a new nearby wander target every few seconds.
    if (!b.wanderTarget || state.elapsed >= b.wanderUntil) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 3;
      b.wanderTarget = {
        x: b.spawn.x + Math.cos(a) * r,
        z: b.spawn.z + Math.sin(a) * r,
      };
      b.wanderUntil = state.elapsed + 2 + Math.random() * 3;
    }
    const dx = b.wanderTarget.x - b.pos.x;
    const dz = b.wanderTarget.z - b.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.3) {
      const step = Math.min(dist, b.speed * dt);
      b.pos.x += (dx / dist) * step;
      b.pos.z += (dz / dist) * step;
      b.yaw = Math.atan2(dx, dz);
    } else if (p.alive) {
      // Idle: watch the player.
      const px = p.pos.x - b.pos.x;
      const pz = p.pos.z - b.pos.z;
      if (Math.hypot(px, pz) < 18) b.yaw = Math.atan2(px, pz);
    }
    b.group.position.set(b.pos.x, 0, b.pos.z);
    b.group.rotation.y = b.yaw;
  }
}

function respawnBot(state, b) {
  b.health = BOT_HEALTH;
  b.alive = true;
  b.pos.x = b.spawn.x;
  b.pos.z = b.spawn.z;
  b.group.position.set(b.spawn.x, 0, b.spawn.z);
  b.group.rotation.set(0, 0, 0);
  b.group.visible = true;
}

export function damageBot(state, id, dmg, head) {
  const b = state.bots[id];
  if (!b || !b.alive) return false;
  b.health -= dmg;
  if (b.health <= 0) {
    b.health = 0;
    b.alive = false;
    b.respawnAt = state.elapsed + RESPAWN_SECONDS;
    // Fall flat: tip the dummy over and sink it slightly.
    b.group.rotation.set(-Math.PI / 2, b.yaw, 0);
    b.group.position.y = 0.25;
    pushFeed(state, head ? `Headshot — dummy ${id + 1} down` : `Dummy ${id + 1} down`);
    return true;
  }
  return false;
}

// --- Part 2 hooks (signatures fixed now, AI lands here) ---
// engageBot(state, bot, dt): spot the player, aim and shoot back.
// patrolBot(state, bot, dt): walk a route between waypoints.
// defendSite(state, bot, dt): hold a site and react to the plant.
// These live in updateBots in Part 2; the round system calls them through
// the same updateBots(state, dt) step used above.

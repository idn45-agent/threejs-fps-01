// bots.js — the defenders and one teammate. Part 2 ships real AI behind
// the Part 1 interface:
//   spawnBots(scene, state) — build the bots once
//   updateBots(state, dt, ctx) — one step of bot behaviour (ctx: { audio })
//   listHitMeshes(state) — enemy meshes weapon.js raycasts against
//   damageBot(id, dmg, head) — apply a hit, returns true on a kill
//   hearShot(state, x, z) — bots near a gunshot go investigate it
// Four enemies (Rook, Vex, Ash, Bram) hold Ember Yard; one teammate
// (Sable) fights beside the player and defuses if the player falls after
// a plant. Bots do NOT respawn mid-round; the round reset revives them.
import * as THREE from 'three';
import { BOT_SPAWNS, SITES, losBlocked, moveAndCollide } from './world.js';
import { pushFeed } from './state.js';
import { damagePlayer, eyePosition } from './player.js';

const BOT_HEALTH = 100;
const KILL_REWARD = 300;
const EYE_Y = 1.55;
const SIGHT_RANGE = 42;

const ENEMIES = [
  { name: 'Rook', color: 0x8a4a2b, spawn: 0, route: [[24, -14], [18, -16], [14, -10], [10, -8], [16, -18]] },
  { name: 'Vex', color: 0x5f6e7a, spawn: 1, route: [[19, -9], [10, -8], [0, -6], [12, -12], [8, -14]] },
  { name: 'Ash', color: 0x7a5a2e, spawn: 2, route: [[24, 14], [18, 16], [14, 10], [10, 8], [16, 18]] },
  { name: 'Bram', color: 0x6e3a3a, spawn: 3, route: [[19, 9], [10, 8], [0, 6], [12, 12], [8, 14]] },
];
const ALLY = { name: 'Sable', color: 0x2f7a6e, spawn: { x: -24, z: 2 } };

function buildBotMesh(color, ally) {
  // A soldier: body box, head box, shoulders, visor stripe; allies wear
  // a teal visor, enemies a rust-red one, so sides read at a glance.
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.9 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: ally ? 0x2fd4c4 : 0xe5484d, roughness: 0.3,
    emissive: ally ? 0x0a3a36 : 0x3a0a0a,
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

function makeTracer(scene) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xff9a5a, transparent: true, opacity: 0 }),
  );
  line.frustumCulled = false;
  scene.add(line);
  return line;
}

export function spawnBots(scene, state) {
  const bots = [];
  ENEMIES.forEach((def, i) => {
    const spawn = BOT_SPAWNS[def.spawn];
    const { group, head } = buildBotMesh(def.color, false);
    group.position.set(spawn.x, 0, spawn.z);
    scene.add(group);
    const bot = {
      id: i, name: def.name, team: 'enemy', group, head,
      spawn: { ...spawn }, pos: { x: spawn.x, z: spawn.z },
      yaw: 0, health: BOT_HEALTH, alive: true,
      state: 'patrol', route: def.route, wpIndex: i % def.route.length,
      speed: 2.2, thinkAt: 0, seenAt: -10, reactAt: 0,
      burstLeft: 0, nextShotAt: 0, burstUntil: 0,
      lastSeen: null, investigateAt: null, investigateUntil: 0,
      retreatUntil: 0, defendPos: null, strafeDir: 1, strafeUntil: 0,
      tracer: makeTracer(scene), tracerUntil: -10,
    };
    group.traverse((m) => {
      if (!m.isMesh) return;
      m.userData.botId = i;
      m.userData.part = m === head ? 'head' : 'body';
    });
    bots.push(bot);
  });
  // The teammate: spawns beside the player, follows and fights with them.
  const { group, head } = buildBotMesh(ALLY.color, true);
  group.position.set(ALLY.spawn.x, 0, ALLY.spawn.z);
  scene.add(group);
  const ally = {
    id: 4, name: ALLY.name, team: 'ally', group, head,
    spawn: { ...ALLY.spawn }, pos: { x: ALLY.spawn.x, z: ALLY.spawn.z },
    yaw: 0, health: BOT_HEALTH, alive: true,
    state: 'follow', route: [], wpIndex: 0,
    speed: 3.8, thinkAt: 0, seenAt: -10, reactAt: 0,
    burstLeft: 0, nextShotAt: 0, burstUntil: 0,
    lastSeen: null, investigateAt: null, investigateUntil: 0,
    retreatUntil: 0, defendPos: null, strafeDir: 1, strafeUntil: 0,
    tracer: makeTracer(scene), tracerUntil: -10,
  };
  group.traverse((m) => {
    if (!m.isMesh) return;
    m.userData.botId = 4;
    m.userData.part = m === head ? 'head' : 'body';
  });
  bots.push(ally);
  state.bots = bots;
  return bots;
}

export function listHitMeshes(state) {
  const out = [];
  for (const b of state.bots) {
    if (!b.alive || b.team !== 'enemy') continue;
    b.group.traverse((m) => {
      if (m.isMesh) out.push(m);
    });
  }
  return out;
}

// Distance check + the map's LOS test, from bot eye to a target point.
function canSee(state, b, tx, ty, tz, range) {
  const dx = tx - b.pos.x, dz = tz - b.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return 0;
  if (losBlocked(b.pos.x, EYE_Y, b.pos.z, tx, ty, tz)) return 0;
  return d;
}

// --- Navigation: a small hand-checked waypoint graph. Straight-line
// steering sticks on the map's walls (the A/B approach walls block the
// direct line to the sites), so long moves route through these nodes.
// Every edge was checked against the collision boxes in world.js.
const NAV_NODES = [
  [-27, 0], [-14, 0], [0, 0], [8, 0], [8, -11], [13.5, -11], [18, -14],
  [22, -14], [8, 11], [13.5, 11], [18, 14], [22, 14],
  [-14, -11], [0, -11], [-14, 11], [0, 11],
];
const NAV_EDGES = [
  [0, 1], [1, 12], [1, 14], [12, 13], [13, 4], [14, 15], [15, 8],
  [2, 12], [2, 14], [2, 3], [3, 4], [3, 8], [4, 5], [5, 6], [5, 7],
  [6, 7], [8, 9], [9, 10], [9, 11], [10, 11], [2, 4], [2, 8],
];
const NAV_ADJ = NAV_NODES.map(() => []);
for (const [a, b] of NAV_EDGES) { NAV_ADJ[a].push(b); NAV_ADJ[b].push(a); }

function nearestNode(x, z) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < NAV_NODES.length; i++) {
    const d = Math.hypot(NAV_NODES[i][0] - x, NAV_NODES[i][1] - z);
    if (d < bd) { bd = d; best = i; }
  }
  return { idx: best, dist: bd };
}

// Dijkstra over the graph; returns intermediate waypoints (not the target).
function findPath(sx, sz, tx, tz) {
  const s = nearestNode(sx, sz), t = nearestNode(tx, tz);
  if (s.dist > 10 || t.dist > 10 || s.idx === t.idx) return [];
  const dist = new Array(NAV_NODES.length).fill(Infinity);
  const prev = new Array(NAV_NODES.length).fill(-1);
  const done = new Array(NAV_NODES.length).fill(false);
  dist[s.idx] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < NAV_NODES.length; i++) {
      if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    }
    if (u === -1 || u === t.idx) break;
    done[u] = true;
    for (const v of NAV_ADJ[u]) {
      const w = Math.hypot(NAV_NODES[u][0] - NAV_NODES[v][0], NAV_NODES[u][1] - NAV_NODES[v][1]);
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
  if (prev[t.idx] === -1) return [];
  const path = [];
  for (let cur = t.idx; cur !== s.idx && cur !== -1; cur = prev[cur]) {
    path.unshift({ x: NAV_NODES[cur][0], z: NAV_NODES[cur][1] });
  }
  return path;
}

// Walk towards (tx, tz) with collision; returns true on arrival.
// Long moves route through the nav graph; the final leg steers direct
// with a perpendicular sidestep when a wall blocks it.
function moveToward(b, tx, tz, speed, dt) {
  const dist = Math.hypot(tx - b.pos.x, tz - b.pos.z);
  if (dist < 0.4) { b.navPath = null; return true; }
  if (dist > 6) {
    const key = `${Math.round(tx)},${Math.round(tz)}`;
    if (!b.navPath || b.navKey !== key) {
      b.navKey = key;
      b.navPath = findPath(b.pos.x, b.pos.z, tx, tz);
      b.navStuck = 0;
    }
    if (b.navPath && b.navPath.length > 0) {
      const wp = b.navPath[0];
      const moved = stepToward(b, wp.x, wp.z, speed, dt);
      if (Math.hypot(wp.x - b.pos.x, wp.z - b.pos.z) < 0.5) b.navPath.shift();
      if (moved < 0.02) {
        b.navStuck = (b.navStuck || 0) + dt;
        if (b.navStuck > 3) b.navPath = null; // give up on the route
      } else b.navStuck = 0;
      return false;
    }
  }
  return steerDirect(b, tx, tz, speed, dt);
}

// Direct steering with a sidestep fallback when a wall blocks the line.
function steerDirect(b, tx, tz, speed, dt) {
  if (b.detour) {
    if (stepToward(b, b.detour.x, b.detour.z, speed, dt)) b.detour = null;
    return Math.hypot(tx - b.pos.x, tz - b.pos.z) < 0.4;
  }
  const dx = tx - b.pos.x, dz = tz - b.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4) return true;
  const moved = stepToward(b, tx, tz, speed, dt);
  const step = Math.min(dist, speed * dt);
  if (moved < step * 0.25) {
    b.stuckTime = (b.stuckTime || 0) + dt;
    if (b.stuckTime > 0.4) {
      b.stuckTime = 0;
      b.detourSide = -(b.detourSide || 1);
      const nx = dx / dist, nz = dz / dist;
      b.detour = {
        x: b.pos.x + -nz * 4 * b.detourSide,
        z: b.pos.z + nx * 4 * b.detourSide,
      };
    }
  } else {
    b.stuckTime = 0;
  }
  return false;
}

// One steering step towards a point; returns the distance actually moved.
function stepToward(b, tx, tz, speed, dt) {
  const dx = tx - b.pos.x, dz = tz - b.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4) return 0;
  const step = Math.min(dist, speed * dt);
  const ox = b.pos.x, oz = b.pos.z;
  moveAndCollide(b.pos, (dx / dist) * step, (dz / dist) * step, 0.38);
  b.yaw = Math.atan2(dx, dz);
  return Math.hypot(b.pos.x - ox, b.pos.z - oz);
}

function facePoint(b, tx, tz) {
  b.yaw = Math.atan2(tx - b.pos.x, tz - b.pos.z);
}

function showTracer(b, from, to, now) {
  const pos = b.tracer.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  b.tracerUntil = now + 0.07;
}

function muzzleOf(b) {
  return {
    x: b.pos.x + Math.sin(b.yaw) * 0.3,
    y: 1.35,
    z: b.pos.z + Math.cos(b.yaw) * 0.3,
  };
}

// One bot shot at the player: hit chance falls with distance and movement,
// damage is modest so a decent player wins roughly half the rounds.
function botShootPlayer(state, b, audio) {
  const p = state.player;
  if (!p.alive) return;
  const eye = eyePosition(state);
  const d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
  const moving = Math.hypot(p.vel.x, p.vel.z) > 2;
  let chance = 0.55 - d * 0.008 - (moving ? 0.12 : 0) - (p.crouched ? 0.05 : 0);
  if (state.round.number <= 2) chance *= 0.8; // pistol rounds: bots are softer
  chance = Math.max(0.08, Math.min(0.6, chance));
  const muzzle = muzzleOf(b);
  const hit = Math.random() < chance;
  if (hit) {
    let dmg = (state.round.number <= 2 ? 8 : 11) * (0.85 + Math.random() * 0.3);
    if (p.kevlar) dmg *= 0.7;
    damagePlayer(state, Math.round(dmg), audio);
    showTracer(b, muzzle, { x: eye.x, y: eye.y, z: eye.z }, state.elapsed);
  } else {
    // Near miss: the tracer lands a metre or two off the player.
    const a = Math.random() * Math.PI * 2;
    const r = 1 + Math.random() * 1.5;
    showTracer(b, muzzle, { x: eye.x + Math.cos(a) * r, y: eye.y - 0.4, z: eye.z + Math.sin(a) * r }, state.elapsed);
  }
  if (audio) audio.botShot(d);
}

// The teammate's shot at an enemy bot: slow, weak, but it helps.
function allyShootBot(state, b, target, audio) {
  const d = Math.hypot(target.pos.x - b.pos.x, target.pos.z - b.pos.z);
  const muzzle = muzzleOf(b);
  const hit = Math.random() < Math.max(0.15, 0.4 - d * 0.006);
  if (hit) {
    damageBot(state, target.id, 7, false);
    showTracer(b, muzzle, { x: target.pos.x, y: 1.3, z: target.pos.z }, state.elapsed);
  } else {
    showTracer(b, muzzle, { x: target.pos.x + (Math.random() - 0.5) * 3, y: 1.0, z: target.pos.z + (Math.random() - 0.5) * 3 }, state.elapsed);
  }
  if (audio) audio.botShot(d);
}

export function updateBots(state, dt, ctx) {
  const audio = ctx && ctx.audio ? ctx.audio : null;
  const p = state.player;
  const now = state.elapsed;
  const roundNo = state.round.number;
  const reaction = roundNo <= 2 ? 0.9 : 0.6; // seconds before first shot

  for (const b of state.bots) {
    if (!b.alive) continue;
    // Fade the tracer by time.
    b.tracer.material.opacity = now < b.tracerUntil ? 0.8 : 0;

    if (b.team === 'ally') {
      updateAlly(state, b, dt, audio);
      b.group.position.set(b.pos.x, 0, b.pos.z);
      b.group.rotation.y = b.yaw;
      continue;
    }

    // --- Perception, throttled to ~7 Hz.
    if (now >= b.thinkAt) {
      b.thinkAt = now + 0.15;
      if (p.alive) {
        const eye = eyePosition(state);
        const d = canSee(state, b, eye.x, eye.y, eye.z, SIGHT_RANGE);
        if (d > 0) {
          b.seenAt = now;
          b.lastSeen = { x: p.pos.x, z: p.pos.z };
          if (b.state === 'patrol' || b.state === 'investigate') {
            b.state = 'engage';
            b.reactAt = now + reaction * (0.8 + Math.random() * 0.5);
          }
        } else if (b.state === 'engage' && now - b.seenAt > 2.5) {
          // Lost the player: go check where they were last seen.
          b.state = 'investigate';
          b.investigateAt = b.lastSeen ? { ...b.lastSeen } : null;
          b.investigateUntil = now + 4;
        }
      }
      // A planted charge pulls every living defender to the site.
      if (state.round.plant && b.state !== 'engage') b.state = 'defend';
      // Low health: break off and fall back towards spawn.
      if (b.health < 30 && b.state !== 'retreat' && !state.round.plant) {
        b.state = 'retreat';
        b.retreatUntil = now + 3;
      }
    }

    if (b.state === 'engage') {
      facePoint(b, p.pos.x, p.pos.z);
      // Strafe sideways so the bot is not a static target.
      if (now >= b.strafeUntil) {
        b.strafeDir = Math.random() < 0.5 ? -1 : 1;
        b.strafeUntil = now + 0.7 + Math.random() * 0.8;
      }
      const px = -Math.cos(b.yaw) * b.strafeDir;
      const pz = Math.sin(b.yaw) * b.strafeDir;
      moveAndCollide(b.pos, px * 1.1 * dt, pz * 1.1 * dt, 0.38);
      // Fire in bursts once the reaction time has passed.
      if (p.alive && now >= b.reactAt) {
        if (b.burstLeft <= 0 && now >= b.nextShotAt) {
          b.burstLeft = 3 + Math.floor(Math.random() * 3);
          b.nextShotAt = now + 0.12;
        }
        if (b.burstLeft > 0 && now >= b.nextShotAt) {
          botShootPlayer(state, b, audio);
          b.burstLeft -= 1;
          b.nextShotAt = now + 0.12;
          if (b.burstLeft === 0) b.nextShotAt = now + 0.6 + Math.random() * 0.5;
        }
      }
      if (!p.alive) b.state = state.round.plant ? 'defend' : 'patrol';
    } else if (b.state === 'defend') {
      const plant = state.round.plant;
      if (!plant) { b.state = 'patrol'; continue; }
      if (!b.defendPos) {
        const idx = b.id;
        const offs = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
        const o = offs[idx % 4];
        b.defendPos = { x: plant.x + o[0], z: plant.z + o[1] };
      }
      const arrived = moveToward(b, b.defendPos.x, b.defendPos.z, 3.2, dt);
      if (arrived && p.alive) facePoint(b, p.pos.x, p.pos.z);
    } else if (b.state === 'investigate') {
      if (b.investigateAt) {
        const arrived = moveToward(b, b.investigateAt.x, b.investigateAt.z, 3.0, dt);
        if (arrived || now >= b.investigateUntil) {
          b.state = 'patrol';
          b.investigateAt = null;
          b.yaw += Math.PI; // look around before resuming the route
        }
      } else b.state = 'patrol';
    } else if (b.state === 'retreat') {
      moveToward(b, b.spawn.x, b.spawn.z, 3.6, dt);
      if (now >= b.retreatUntil) b.state = 'patrol';
    } else {
      // Patrol: walk the route, one waypoint at a time.
      const wp = b.route[b.wpIndex % b.route.length];
      if (moveToward(b, wp[0], wp[1], b.speed, dt)) {
        b.wpIndex = (b.wpIndex + 1) % b.route.length;
      }
    }
    b.group.position.set(b.pos.x, 0, b.pos.z);
    b.group.rotation.y = b.yaw;
  }
}

function updateAlly(state, b, dt, audio) {
  const p = state.player;
  const now = state.elapsed;
  // If the player fell after a plant, Sable walks to the charge to defuse.
  if (!p.alive && state.round.plant) {
    const plant = state.round.plant;
    moveToward(b, plant.x, plant.z, 3.8, dt);
    return;
  }
  if (!p.alive) return;
  // Find the nearest visible enemy to shoot at.
  let target = null;
  let best = 36;
  for (const e of state.bots) {
    if (!e.alive || e.team !== 'enemy') continue;
    const d = canSee(state, b, e.pos.x, 1.3, e.pos.z, 36);
    if (d > 0 && d < best) { best = d; target = e; }
  }
  if (target) {
    facePoint(b, target.pos.x, target.pos.z);
    if (now >= b.reactAt) {
      if (b.burstLeft <= 0 && now >= b.nextShotAt) {
        b.burstLeft = 2 + Math.floor(Math.random() * 2);
        b.nextShotAt = now + 0.35;
      }
      if (b.burstLeft > 0 && now >= b.nextShotAt) {
        allyShootBot(state, b, target, audio);
        b.burstLeft -= 1;
        b.nextShotAt = now + 0.35;
        if (b.burstLeft === 0) b.nextShotAt = now + 0.9 + Math.random() * 0.6;
      }
    }
    if (now >= b.reactAt + 3) b.reactAt = now + 0.5; // re-arm after a lull
  } else {
    // Follow the player at a few metres, staying out of their way.
    const d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
    if (d > 5) {
      const a = Math.atan2(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
      moveToward(b, p.pos.x - Math.sin(a) * 3.5, p.pos.z - Math.cos(a) * 3.5, b.speed, dt);
    } else {
      facePoint(b, p.pos.x + Math.sin(p.yaw) * 6, p.pos.z + Math.cos(p.yaw) * 6);
    }
  }
}

// A gunshot draws nearby defenders to the sound.
export function hearShot(state, x, z) {
  for (const b of state.bots) {
    if (!b.alive || b.team !== 'enemy') continue;
    if (b.state !== 'patrol') continue;
    const d = Math.hypot(x - b.pos.x, z - b.pos.z);
    if (d < 32) {
      b.state = 'investigate';
      b.investigateAt = { x, z };
      b.investigateUntil = state.elapsed + 5;
    }
  }
}

export function damageBot(state, id, dmg, head) {
  const b = state.bots[id];
  if (!b || !b.alive || b.team !== 'enemy') return false;
  b.health -= dmg;
  if (b.health <= 0) {
    b.health = 0;
    b.alive = false;
    // Fall flat: tip over and sink slightly. No respawn until next round.
    b.group.rotation.set(-Math.PI / 2, b.yaw, 0);
    b.group.position.y = 0.25;
    state.round.money += KILL_REWARD;
    pushFeed(state, head ? `Headshot — ${b.name} down (+$${KILL_REWARD})` : `${b.name} down (+$${KILL_REWARD})`);
    return true;
  }
  // Getting shot interrupts a retreat and snaps the bot to the fight.
  if (b.state === 'retreat' || b.state === 'patrol') {
    b.state = 'engage';
    b.reactAt = state.elapsed + 0.4;
    b.lastSeen = { x: state.player.pos.x, z: state.player.pos.z };
    b.seenAt = state.elapsed;
  }
  return false;
}

// Revive every bot at its spawn: called by the round reset.
export function resetBots(state) {
  for (const b of state.bots) {
    b.health = BOT_HEALTH;
    b.alive = true;
    b.pos.x = b.spawn.x;
    b.pos.z = b.spawn.z;
    b.state = b.team === 'ally' ? 'follow' : 'patrol';
    b.wpIndex = b.id % Math.max(1, b.route.length);
    b.defendPos = null;
    b.investigateAt = null;
    b.burstLeft = 0;
    b.navPath = null;
    b.navKey = null;
    b.detour = null;
    b.stuckTime = 0;
    b.group.position.set(b.spawn.x, 0, b.spawn.z);
    b.group.rotation.set(0, 0, 0);
    b.group.visible = true;
  }
}

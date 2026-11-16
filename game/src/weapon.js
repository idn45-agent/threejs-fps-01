// weapon.js — the DUSTLINE arsenal, bought in the buy phase.
// One shot is a raycast from the camera: spread grows while firing and
// moving and shrinks while still or crouched, recoil kicks the pitch up
// and settles, headshots deal double damage. Tracer, muzzle flash and the
// first-person viewmodel are plain three.js geometry; the shot sound is
// synthesized (audio.js). No new objects in the hot loop: the raycaster,
// tracer line and flash light are created once and reused.
// Grenades are a small ballistic projectile with a timed fuse and AoE.
import * as THREE from 'three';
import { clamp } from './state.js';
import { eyePosition, lookDirection, moveAmount } from './player.js';

// The buy menu (buy.js) switches rows; each row is one weapon's numbers.
// Prices live in buy.js — this table is only the firing behaviour.
export const WEAPONS = {
  pistol: {
    name: 'P-12 Sidearm', interval: 0.22, damage: 26, headMult: 2,
    mag: 12, reserve: 48, spread: 0.008, bloom: 0.004, recoil: 0.008,
    reload: 1.4, pellets: 1, auto: false,
  },
  rifle: {
    name: 'VK-7 Longshot', interval: 0.1, damage: 34, headMult: 2,
    mag: 30, reserve: 120, spread: 0.004, bloom: 0.006, recoil: 0.011,
    reload: 1.9, pellets: 1, auto: true,
  },
  smg: {
    name: 'K-9 SMG', interval: 0.07, damage: 22, headMult: 2,
    mag: 32, reserve: 128, spread: 0.012, bloom: 0.005, recoil: 0.006,
    reload: 1.6, pellets: 1, auto: true,
  },
  shotgun: {
    name: 'M-88 Scattergun', interval: 0.8, damage: 14, headMult: 1.5,
    mag: 6, reserve: 24, spread: 0.03, bloom: 0.01, recoil: 0.03,
    reload: 2.4, pellets: 6, auto: false,
  },
};

const BLOOM_MAX = 0.05;
const GRENADE_FUSE = 2.0;
const GRENADE_RADIUS = 6;
const GRENADE_DAMAGE = 95;

// Switch the player's weapon to a table row: full mag, full reserve.
export function equipWeapon(state, id) {
  const t = WEAPONS[id];
  if (!t) return;
  const w = state.weapon;
  w.id = id;
  w.name = t.name;
  w.magSize = t.mag;
  w.ammo = t.mag;
  w.reserve = t.reserve;
  w.reloading = false;
  w.bloom = 0;
  w.recoil = 0;
}

export function createWeapon(scene, camera) {
  // Reused every shot.
  const raycaster = new THREE.Raycaster();
  raycaster.far = 200;
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();

  // Tracer: one line, re-aimed per shot, faded by the update step.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(
    tracerGeo,
    new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }),
  );
  tracer.frustumCulled = false;
  scene.add(tracer);

  // Muzzle flash: a small light plus a bright quad at the barrel tip.
  const flash = new THREE.PointLight(0xffc36b, 0, 9, 2);
  scene.add(flash);
  const flashQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  scene.add(flashQuad);

  // Impact puff: one small sphere, moved to the hit point and faded.
  const impact = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xd8c49a, transparent: true, opacity: 0 }),
  );
  scene.add(impact);

  // Viewmodel: a low-poly gun built from boxes, parented to the camera.
  const gun = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.55, metalness: 0.6 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x4a3421, roughness: 0.9 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x2fd4c4, roughness: 0.4, metalness: 0.3, emissive: 0x0a3a36 });
  const addBox = (w, h, d, x, y, z, mat = gunMat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    gun.add(m);
    return m;
  };
  addBox(0.09, 0.11, 0.62, 0, 0, 0); // receiver
  addBox(0.05, 0.05, 0.42, 0, 0.02, -0.48); // barrel
  addBox(0.07, 0.16, 0.1, 0, -0.12, -0.05, gripMat); // magazine
  addBox(0.06, 0.09, 0.09, 0, -0.09, 0.16, gripMat); // grip
  addBox(0.02, 0.05, 0.16, 0, 0.08, -0.1); // sight rail
  addBox(0.09, 0.015, 0.02, 0, 0.055, -0.3, accentMat); // teal stripe
  gun.position.set(0.26, -0.24, -0.5);
  camera.add(gun);

  return {
    raycaster, origin, dir, tracer, flash, flashQuad, impact, gun,
    flashUntil: -10, tracerUntil: -10, impactUntil: -10,
  };
}

export function updateWeapon(state, input, dt, view) {
  const w = state.weapon;
  const p = state.player;
  if (!p.alive) return;

  // Reload finishing.
  if (w.reloading && state.elapsed >= w.reloadEndsAt) {
    const need = w.magSize - w.ammo;
    const take = Math.min(need, w.reserve);
    w.ammo += take;
    w.reserve -= take;
    w.reloading = false;
    view.audio.reloadEnd();
  }

  // Reload key (or auto-reload on an empty trigger pull, below).
  if (input.reloadQueued) {
    input.reloadQueued = false;
    startReload(state, view);
  }

  // Grenade key: throw an R-4 if one is carried.
  if (input.grenadeQueued) {
    input.grenadeQueued = false;
    throwGrenade(state, view);
  }

  // Bloom decays when not firing; recoil settles back down.
  w.bloom = Math.max(0, w.bloom - dt * 0.09);
  w.recoil = Math.max(0, w.recoil - dt * 0.06);

  // Fire: autos fire while held, semi-autos on the fresh trigger edge.
  const t = WEAPONS[w.id] || WEAPONS.pistol;
  const wantFire = t.auto ? input.firing : input.fireQueued;
  input.fireQueued = false; // consumed whether or not the shot lands
  if (wantFire && !w.reloading && state.elapsed - w.lastShotAt >= t.interval) {
    if (w.ammo > 0) fire(state, view, t);
    else {
      view.audio.dryFire();
      w.lastShotAt = state.elapsed; // don't click every frame
      startReload(state, view);
    }
  }

  // Fade the tracer / flash / impact by time, not by frame count.
  const now = state.elapsed;
  view.tracer.material.opacity = now < view.tracerUntil ? 0.85 : 0;
  view.flash.intensity = now < view.flashUntil ? 14 : 0;
  view.flashQuad.material.opacity = now < view.flashUntil ? 0.9 : 0;
  view.impact.material.opacity = now < view.impactUntil ? 0.7 : 0;
  if (now < view.impactUntil) {
    const s = 1 + (view.impactUntil - now) * 8;
    view.impact.scale.setScalar(s);
  }

  // Viewmodel sway: the gun lags slightly behind the look, and bobs with steps.
  const bob = Math.hypot(p.vel.x, p.vel.z) > 0.5 ? Math.sin(state.elapsed * 9) * 0.006 : 0;
  view.gun.position.y = -0.24 + bob - w.recoil * 0.35;
  view.gun.position.z = -0.5 + w.recoil * 0.5;

  updateGrenades(state, dt, view);
}

function startReload(state, view) {
  const w = state.weapon;
  const t = WEAPONS[w.id] || WEAPONS.pistol;
  if (w.reloading || w.ammo === w.magSize || w.reserve === 0) return;
  w.reloading = true;
  w.reloadEndsAt = state.elapsed + t.reload;
  view.audio.reloadStart();
}

// Current spread in radians: still + crouched is a laser, running is a hose.
export function currentSpread(state) {
  const w = state.weapon;
  const p = state.player;
  const t = WEAPONS[w.id] || WEAPONS.pistol;
  let s = t.spread + w.bloom + moveAmount(state) * 0.022;
  if (p.crouched) s *= 0.55;
  return s;
}

function fire(state, view, t) {
  const w = state.weapon;
  const p = state.player;
  w.ammo -= 1;
  w.lastShotAt = state.elapsed;
  w.bloom = Math.min(BLOOM_MAX, w.bloom + t.bloom);
  // Recoil: pitch kicks up now, settles in updateWeapon.
  p.pitch = clamp(p.pitch + t.recoil, -1.52, 1.52);
  w.recoil = Math.min(0.12, w.recoil + t.recoil);
  view.audio.shot();
  // Let the bots hear it: they investigate the shot's origin.
  if (view.bots.hearShot) view.bots.hearShot(state, p.pos.x, p.pos.z);

  const eye = eyePosition(state);
  const look = lookDirection(state);
  const spread = currentSpread(state);
  const botMeshes = view.bots.listHitMeshes();
  const end = new THREE.Vector3();
  let endSet = false;

  for (let pellet = 0; pellet < t.pellets; pellet++) {
    const rx = (Math.random() - 0.5) * 2 * spread;
    const ry = (Math.random() - 0.5) * 2 * spread;
    view.origin.set(eye.x, eye.y, eye.z);
    view.dir.set(look.x + rx, look.y + ry, look.z).normalize();
    view.raycaster.set(view.origin, view.dir);

    // Targets: bot hitboxes first, then the map solids.
    const hits = view.raycaster.intersectObjects([...botMeshes, ...view.solids], false);
    if (hits.length > 0) {
      const hit = hits[0];
      if (!endSet) { end.copy(hit.point); endSet = true; }
      const botHit = hit.object.userData.botId !== undefined;
      if (botHit) {
        const head = hit.object.userData.part === 'head';
        const dmg = t.damage * (head ? t.headMult : 1);
        const killed = view.bots.damageBot(hit.object.userData.botId, dmg, head);
        state.hitmarkAt = state.elapsed;
        if (head) state.headshotAt = state.elapsed;
        view.audio.hit(head);
        if (killed) {
          w.kills += 1;
          view.audio.kill();
        }
      } else {
        // Wall / crate / ground: show the impact puff.
        view.impact.position.copy(hit.point);
        view.impactUntil = state.elapsed + 0.16;
      }
    }
  }
  if (!endSet) end.copy(view.origin).addScaledVector(view.dir, 120);

  // Tracer from the muzzle (gun tip, world space) to the hit point.
  const muzzle = new THREE.Vector3(0.26, -0.2, -0.9).applyMatrix4(view.camera.matrixWorld);
  const pos = view.tracer.geometry.attributes.position;
  pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  view.tracerUntil = state.elapsed + 0.06;

  // Muzzle flash at the barrel tip.
  view.flash.position.copy(muzzle);
  view.flashQuad.position.copy(muzzle);
  view.flashQuad.lookAt(view.camera.position);
  view.flashUntil = state.elapsed + 0.045;
}

// --- Grenades: throw, arc, fuse, AoE. -------------------------------------
function throwGrenade(state, view) {
  const p = state.player;
  if (p.grenades <= 0 || state.round.phase !== 'live') return;
  p.grenades -= 1;
  const eye = eyePosition(state);
  const look = lookDirection(state);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a5a2e, roughness: 0.6 }),
  );
  mesh.position.set(eye.x, eye.y, eye.z);
  view.scene.add(mesh);
  state.grenades.push({
    pos: { x: eye.x, y: eye.y, z: eye.z },
    vel: { x: look.x * 14, y: look.y * 14 + 3.5, z: look.z * 14 },
    fuseAt: state.elapsed + GRENADE_FUSE,
    mesh,
  });
  view.audio.throwGrenade();
}

function updateGrenades(state, dt, view) {
  const GRAV = 12;
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.vel.y -= GRAV * dt;
    g.pos.x += g.vel.x * dt;
    g.pos.y += g.vel.y * dt;
    g.pos.z += g.vel.z * dt;
    if (g.pos.y < 0.09) { g.pos.y = 0.09; g.vel.y *= -0.4; g.vel.x *= 0.6; g.vel.z *= 0.6; }
    g.mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
    if (state.elapsed >= g.fuseAt) {
      explodeGrenade(state, g, view);
      view.scene.remove(g.mesh);
      state.grenades.splice(i, 1);
    }
  }
}

function explodeGrenade(state, g, view) {
  view.audio.explosion();
  // Flash + shake: reuse the impact puff, scaled up, at the blast point.
  view.impact.position.set(g.pos.x, Math.max(0.3, g.pos.y), g.pos.z);
  view.impact.scale.setScalar(14);
  view.impactUntil = state.elapsed + 0.3;
  for (const b of state.bots) {
    if (!b.alive || b.team !== 'enemy') continue;
    const d = Math.hypot(b.pos.x - g.pos.x, b.pos.z - g.pos.z);
    if (d < GRENADE_RADIUS) {
      const dmg = Math.round(GRENADE_DAMAGE * (1 - d / GRENADE_RADIUS) + 15);
      view.bots.damageBot(b.id, dmg, false);
    }
  }
}

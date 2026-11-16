// weapon.js — the VK-7 Longshot, a hitscan rifle.
// One shot is one raycast from the camera: spread grows while firing and
// moving and shrinks while still or crouched, recoil kicks the pitch up and
// settles, headshots deal double damage. Tracer, muzzle flash and the
// first-person viewmodel are plain three.js geometry; the shot sound is
// synthesized (audio.js). No new objects in the hot loop: the raycaster,
// tracer line and flash light are created once and reused.
import * as THREE from 'three';
import { clamp } from './state.js';
import { eyePosition, lookDirection, moveAmount } from './player.js';

const FIRE_INTERVAL = 0.1; // 600 rpm
const RELOAD_SECONDS = 1.9;
const BODY_DAMAGE = 34;
const HEAD_MULTIPLIER = 2;
const BASE_SPREAD = 0.004;
const BLOOM_PER_SHOT = 0.006;
const BLOOM_MAX = 0.05;
const RECOIL_PER_SHOT = 0.011;

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

  // Viewmodel: a low-poly rifle built from boxes, parented to the camera.
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

  // Bloom decays when not firing; recoil settles back down.
  w.bloom = Math.max(0, w.bloom - dt * 0.09);
  w.recoil = Math.max(0, w.recoil - dt * 0.06);

  // Fire while held, at the rifle's rate.
  if (input.firing && !w.reloading && state.elapsed - w.lastShotAt >= FIRE_INTERVAL) {
    if (w.ammo > 0) fire(state, view);
    else {
      view.audio.dryFire();
      w.lastShotAt = state.elapsed; // don't click every frame
      startReload(state, view);
    }
  }

  // Fade the tracer / flash / impact by time, not by frame count.
  const t = state.elapsed;
  view.tracer.material.opacity = t < view.tracerUntil ? 0.85 : 0;
  view.flash.intensity = t < view.flashUntil ? 14 : 0;
  view.flashQuad.material.opacity = t < view.flashUntil ? 0.9 : 0;
  view.impact.material.opacity = t < view.impactUntil ? 0.7 : 0;
  if (t < view.impactUntil) {
    const s = 1 + (view.impactUntil - t) * 8;
    view.impact.scale.setScalar(s);
  }

  // Viewmodel sway: the gun lags slightly behind the look, and bobs with steps.
  const bob = Math.hypot(p.vel.x, p.vel.z) > 0.5 ? Math.sin(state.elapsed * 9) * 0.006 : 0;
  view.gun.position.y = -0.24 + bob - w.recoil * 0.35;
  view.gun.position.z = -0.5 + w.recoil * 0.5;
}

function startReload(state, view) {
  const w = state.weapon;
  if (w.reloading || w.ammo === w.magSize || w.reserve === 0) return;
  w.reloading = true;
  w.reloadEndsAt = state.elapsed + RELOAD_SECONDS;
  view.audio.reloadStart();
}

// Current spread in radians: still + crouched is a laser, running is a hose.
export function currentSpread(state) {
  const w = state.weapon;
  const p = state.player;
  let s = BASE_SPREAD + w.bloom + moveAmount(state) * 0.022;
  if (p.crouched) s *= 0.55;
  return s;
}

function fire(state, view) {
  const w = state.weapon;
  const p = state.player;
  w.ammo -= 1;
  w.lastShotAt = state.elapsed;
  w.bloom = Math.min(BLOOM_MAX, w.bloom + BLOOM_PER_SHOT);
  // Recoil: pitch kicks up now, settles in updateWeapon.
  p.pitch = clamp(p.pitch + RECOIL_PER_SHOT, -1.52, 1.52);
  w.recoil = Math.min(0.12, w.recoil + RECOIL_PER_SHOT);
  view.audio.shot();

  // Spread the ray around the look direction.
  const eye = eyePosition(state);
  const look = lookDirection(state);
  const spread = currentSpread(state);
  const rx = (Math.random() - 0.5) * 2 * spread;
  const ry = (Math.random() - 0.5) * 2 * spread;
  view.origin.set(eye.x, eye.y, eye.z);
  view.dir.set(look.x + rx, look.y + ry, look.z).normalize();
  view.raycaster.set(view.origin, view.dir);

  // Targets: bot hitboxes first (they are nearer than the wall behind them
  // only when the ray actually meets them), then the map solids.
  const botMeshes = view.bots.listHitMeshes();
  const hits = view.raycaster.intersectObjects([...botMeshes, ...view.solids], false);
  const end = new THREE.Vector3();
  if (hits.length > 0) {
    const hit = hits[0];
    end.copy(hit.point);
    const botHit = hit.object.userData.botId !== undefined;
    if (botHit) {
      const head = hit.object.userData.part === 'head';
      const dmg = BODY_DAMAGE * (head ? HEAD_MULTIPLIER : 1);
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
  } else {
    end.copy(view.origin).addScaledVector(view.dir, 120);
  }

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

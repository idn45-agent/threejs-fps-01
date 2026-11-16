// player.js — the first-person controller: pointer-lock mouse look, WASD
// with acceleration and deceleration, jump, crouch, and AABB collision
// against the map (world.moveAndCollide). Standing still and crouching are
// accurate; moving fast is not — weapon.js reads speed from here.
import { clamp } from './state.js';
import { moveAndCollide, WORLD } from './world.js';
import { moveIntent } from './input.js';

const GRAVITY = 22;
const JUMP_SPEED = 7.2;
const WALK_SPEED = 4.4; // m/s
const RUN_SPEED = 6.2;
const CROUCH_SPEED = 2.6;
const ACCEL = 42; // m/s^2 towards the wanted velocity
const AIR_CONTROL = 0.35;
const MOUSE_SENS = 0.0021;
const MAX_PITCH = 1.52; // just short of straight up/down

export function createPlayer(state) {
  return { state };
}

export function updatePlayer(state, input, dt) {
  const p = state.player;
  if (!p.alive) return;

  // --- Look: consume this step's mouse movement.
  const { dx, dy } = input.consumeMouse();
  p.yaw -= dx * MOUSE_SENS;
  p.pitch = clamp(p.pitch - dy * MOUSE_SENS, -MAX_PITCH, MAX_PITCH);

  // --- Crouch: lower eye, slower, tighter spread (weapon reads this).
  const intent = moveIntent(input);
  const wantCrouch = intent.crouch;
  if (wantCrouch !== p.crouched) {
    p.crouched = wantCrouch;
    // crouching under a low ceiling is Part 2's problem; the map has none.
  }
  const eyeTarget = p.crouched ? p.eyeCrouched : p.eyeStanding;

  // --- Move: accelerate towards the wanted velocity, decelerate to a stop.
  const speed = p.crouched ? CROUCH_SPEED : intent.walk ? WALK_SPEED : RUN_SPEED;
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  // Forward is (-sin, -cos) in three.js XZ (yaw 0 faces -z); right is (cos, -sin).
  let wx = -sin * intent.forward + cos * intent.strafe;
  let wz = -cos * intent.forward - sin * intent.strafe;
  const len = Math.hypot(wx, wz);
  if (len > 0) {
    wx /= len;
    wz /= len;
  }
  const tx = wx * speed;
  const tz = wz * speed;
  const accel = p.onGround ? ACCEL : ACCEL * AIR_CONTROL;
  p.vel.x += clamp(tx - p.vel.x, -accel * dt, accel * dt);
  p.vel.z += clamp(tz - p.vel.z, -accel * dt, accel * dt);

  // --- Jump + gravity.
  if (input.jumpQueued) {
    input.jumpQueued = false;
    if (p.onGround) {
      p.vel.y = JUMP_SPEED;
      p.onGround = false;
    }
  }
  p.vel.y -= GRAVITY * dt;
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    p.vel.y = 0;
    p.onGround = true;
  }

  // --- Collide: circle vs the map boxes, then clamp to the arena.
  moveAndCollide(p.pos, p.vel.x * dt, p.vel.z * dt, p.radius);
  p.pos.x = clamp(p.pos.x, WORLD.minX + p.radius, WORLD.maxX - p.radius);
  p.pos.z = clamp(p.pos.z, WORLD.minZ + p.radius, WORLD.maxZ - p.radius);

  // Smooth eye height so crouching is a slide, not a snap.
  p.eye = p.eye === undefined ? eyeTarget : p.eye + (eyeTarget - p.eye) * Math.min(1, dt * 14);
}

// Speed the weapon's spread cares about (0 when still, 1 at full run).
export function moveAmount(state) {
  const p = state.player;
  const horizontal = Math.hypot(p.vel.x, p.vel.z);
  return clamp(horizontal / RUN_SPEED, 0, 1);
}

export function eyePosition(state) {
  const p = state.player;
  return { x: p.pos.x, y: p.pos.y + (p.eye ?? p.eyeStanding), z: p.pos.z };
}

// Forward direction from yaw/pitch, for the camera and the raycast.
export function lookDirection(state) {
  const p = state.player;
  const cp = Math.cos(p.pitch);
  return {
    x: -Math.sin(p.yaw) * cp,
    y: Math.sin(p.pitch),
    z: -Math.cos(p.yaw) * cp,
  };
}

export function damagePlayer(state, amount, audio) {
  const p = state.player;
  if (!p.alive) return;
  p.health -= amount;
  state.damageAt = state.elapsed;
  if (audio) audio.hurt();
  if (p.health <= 0) {
    p.health = 0;
    p.alive = false;
  }
}

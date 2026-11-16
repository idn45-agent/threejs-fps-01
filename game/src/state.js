// state.js — the game's state, kept in one place. main.js owns the loop,
// player.js/weapon.js/bots.js/rounds.js read and write this object only;
// nothing else keeps a second copy of round, score or money.
export const ROUND_SECONDS = 100;
export const BUY_SECONDS = 15;
export const START_MONEY = 800;

export function createState() {
  return {
    // Run state
    running: false, // true while pointer-locked and playing
    paused: false,
    elapsed: 0,

    // The player (player.js owns the numbers, this is the record of them)
    player: {
      pos: { x: -27, y: 0, z: 0 }, // feet position, metres
      vel: { x: 0, y: 0, z: 0 },
      yaw: -Math.PI / 2, // facing +x (down mid towards the sites)
      pitch: 0,
      health: 100,
      alive: true,
      crouched: false,
      onGround: true,
      radius: 0.38,
      eyeStanding: 1.62,
      eyeCrouched: 1.08,
    },

    // The rifle (weapon.js owns the numbers)
    weapon: {
      name: 'VK-7 Longshot',
      magSize: 30,
      ammo: 30,
      reserve: 120, // Part 2: the buy phase refills this from money
      reloading: false,
      reloadEndsAt: 0,
      lastShotAt: -10,
      bloom: 0, // current spread, radians; grows firing/moving, shrinks still
      recoil: 0, // accumulated pitch kick waiting to settle
      kills: 0,
    },

    // Opponents (bots.js owns the list)
    bots: [],

    // Round (rounds.js owns the machine; Part 2 fills the buy phase in)
    round: {
      number: 1,
      phase: 'live', // 'buy' | 'live' | 'over'
      timer: ROUND_SECONDS,
      scoreYou: 0,
      scoreThem: 0,
      money: START_MONEY,
      plant: null, // { site: 'A'|'B', plantedAt, defuseAt } once Part 2 adds it
      banner: '',
      bannerUntil: 0,
    },

    // Feed + transient UI events (hud.js drains these)
    feed: [], // { text, at } newest first, max 5
    hitmarkAt: -10,
    headshotAt: -10,
    damageAt: -10, // last time the player took damage (red flash)
  };
}

// Small helpers the modules share so no one re-implements them.
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function pushFeed(state, text) {
  state.feed.unshift({ text, at: state.elapsed });
  if (state.feed.length > 5) state.feed.length = 5;
}

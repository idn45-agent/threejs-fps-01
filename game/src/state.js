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
      kevlar: false, // Part 2: buy menu; absorbs 30% of incoming damage
      grenades: 0, // Part 2: R-4 grenades carried
    },

    // The weapon (weapon.js owns the numbers; buy.js changes the table row)
    weapon: {
      id: 'pistol', // Part 2: start on the free P-12; rifles are bought
      name: 'P-12 Sidearm',
      magSize: 12,
      ammo: 12,
      reserve: 48,
      reloading: false,
      reloadEndsAt: 0,
      lastShotAt: -10,
      bloom: 0, // current spread, radians; grows firing/moving, shrinks still
      recoil: 0, // accumulated pitch kick waiting to settle
      kills: 0,
      deaths: 0,
    },

    // Grenades in flight (weapon.js owns them)
    grenades: [], // { pos, vel, fuseAt, mesh }

    // Opponents (bots.js owns the list)
    bots: [],

    // Round (rounds.js owns the machine)
    round: {
      number: 1,
      phase: 'buy', // 'buy' | 'live' | 'over' | 'matchover'
      timer: BUY_SECONDS,
      scoreYou: 0,
      scoreThem: 0,
      money: START_MONEY,
      losses: 0, // consecutive round losses (drives the loss bonus)
      buyOpen: false, // buy menu visible during the buy phase
      // The planted charge. plantProgress/defuseProgress are 0..1 holds.
      plant: null, // { site, x, z, explodesAt, beepAt } once planted
      plantProgress: 0,
      defuseProgress: 0,
      plantingSite: null, // 'A' | 'B' while the player stands in a site
      defusing: false, // someone is holding E on the planted charge
      banner: '',
      bannerUntil: 0,
      matchWinner: null, // 'you' | 'them' once the match is decided
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

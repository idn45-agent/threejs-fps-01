// rounds.js — the round machine: buy phase -> combat round -> round end
// -> next buy, first to 5 round wins takes the match. The objective is a
// planted charge: the player plants at site A or B (hold E, 3 s), the
// charge blows after 35 s unless a defender defuses it (hold E, 5 s).
// Economy: kill +$300, round win +$325, round loss +$150 and +$50 per
// consecutive loss, capped at +$300.
import { ROUND_SECONDS, BUY_SECONDS, pushFeed } from './state.js';
import { SITES } from './world.js';
import { resetBots } from './bots.js';
import { equipWeapon } from './weapon.js';
import { buyItem } from './buy.js';

export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const CHARGE_SECONDS = 35;
export const MATCH_WINS = 5;

const WIN_BONUS = 325;
const LOSS_BASE = 150;
const LOSS_STEP = 50;
const LOSS_CAP = 300;

function resetPlayerToSpawn(state) {
  const p = state.player;
  p.health = 100;
  p.alive = true;
  p.pos.x = -27;
  p.pos.z = 0;
  p.pos.y = 0;
  p.vel.x = 0;
  p.vel.y = 0;
  p.vel.z = 0;
  p.yaw = -Math.PI / 2;
  p.pitch = 0;
}

export function startBuyPhase(state, audio) {
  const r = state.round;
  r.phase = 'buy';
  r.timer = BUY_SECONDS;
  r.plant = null;
  r.plantProgress = 0;
  r.defuseProgress = 0;
  r.plantingSite = null;
  r.defusing = false;
  r.buyOpen = true;
  r.banner = `ROUND ${r.number} — BUY PHASE (B FOR SHOP)`;
  r.bannerUntil = state.elapsed + 3;
  resetPlayerToSpawn(state);
  resetBots(state);
  // Free ammo refill for the current weapon at the start of every round.
  equipWeapon(state, state.weapon.id);
  if (audio) audio.roundStart();
}

export function startRound(state, audio) {
  const r = state.round;
  r.phase = 'live';
  r.timer = ROUND_SECONDS;
  r.buyOpen = false;
  r.banner = `ROUND ${r.number} — PLANT THE CHARGE AT A OR B`;
  r.bannerUntil = state.elapsed + 3;
  if (audio) audio.roundStart();
}

export function endRound(state, winner, audio, reason) {
  const r = state.round;
  if (r.phase === 'over' || r.phase === 'matchover') return;
  r.phase = 'over';
  r.timer = 0;
  r.buyOpen = false;
  const youWin = winner === 'you';
  if (youWin) {
    r.scoreYou += 1;
    r.money += WIN_BONUS;
    r.losses = 0;
    r.banner = 'ROUND WON  +$' + WIN_BONUS;
  } else {
    r.scoreThem += 1;
    r.losses += 1;
    const bonus = Math.min(LOSS_BASE + LOSS_STEP * (r.losses - 1), LOSS_CAP);
    r.money += bonus;
    r.banner = (reason === 'time' ? 'TIME UP — ROUND LOST' : 'ROUND LOST') + `  +$${bonus}`;
  }
  r.bannerUntil = state.elapsed + 3.5;
  pushFeed(state, r.banner);
  if (audio) audio.roundEnd(youWin);
  // Match point: first to 5 round wins.
  if (r.scoreYou >= MATCH_WINS || r.scoreThem >= MATCH_WINS) {
    r.phase = 'matchover';
    r.matchWinner = r.scoreYou >= MATCH_WINS ? 'you' : 'them';
    r.banner = r.matchWinner === 'you'
      ? 'MATCH WON — EMBER YARD IS YOURS'
      : 'MATCH LOST — THE DEFENDERS HOLD THE YARD';
    r.bannerUntil = state.elapsed + 60;
    pushFeed(state, r.banner);
  }
}

// Restart the whole match after a match-over: scores, money and round
// reset, the player is back on the free pistol.
export function resetMatch(state, audio) {
  const r = state.round;
  r.number = 1;
  r.scoreYou = 0;
  r.scoreThem = 0;
  r.money = 800;
  r.losses = 0;
  r.matchWinner = null;
  state.weapon.kills = 0;
  state.weapon.deaths = 0;
  state.player.kevlar = false;
  state.player.grenades = 0;
  equipWeapon(state, 'pistol');
  startBuyPhase(state, audio);
}

function siteOf(state) {
  const p = state.player;
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 4.4) return key;
  }
  return null;
}

// Holding E plants or defuses; moving or shooting interrupts the hold.
function holdingStill(state, input) {
  const k = input.keys;
  const moving = k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD');
  return !moving && !input.firing;
}

// One step of the round machine. Returns nothing; the state is the record.
export function updateRounds(state, dt, audio, input) {
  const r = state.round;
  const p = state.player;

  if (r.phase === 'buy') {
    r.timer -= dt;
    if (input) {
      if (input.buyToggleQueued) {
        input.buyToggleQueued = false;
        r.buyOpen = !r.buyOpen;
      }
      if (r.buyOpen) {
        for (let n = 1; n <= 6; n++) {
          if (input.keys.has(`Digit${n}`)) {
            input.keys.delete(`Digit${n}`); // one purchase per press
            buyItem(state, n, audio);
          }
        }
      }
    }
    if (r.timer <= 0) startRound(state, audio);
    return;
  }

  if (r.phase === 'live') {
    const plant = r.plant;
    // --- Planting: hold E inside a site, still, for 3 s.
    if (!plant && p.alive) {
      const site = siteOf(state);
      r.plantingSite = site;
      if (site && input && input.keys.has('KeyE') && holdingStill(state, input)) {
        r.plantProgress += dt / PLANT_SECONDS;
        if (r.plantProgress >= 1) {
          r.plantProgress = 0;
          const s = SITES[site];
          r.plant = { site, x: s.x, z: s.z, explodesAt: state.elapsed + CHARGE_SECONDS, beepAt: state.elapsed + 1, noDefuseUntil: state.elapsed + 2 };
          pushFeed(state, `Charge planted at ${site} — ${CHARGE_SECONDS}s to detonation`);
          if (audio) audio.plant();
        }
      } else {
        r.plantProgress = 0;
      }
    } else {
      r.plantingSite = null;
    }

    // --- The planted charge: beeps, then blows unless defused.
    if (plant) {
      if (state.elapsed >= plant.beepAt) {
        plant.beepAt = state.elapsed + 1;
        if (audio) audio.beep();
      }
      // Defuse: the player holds E on the charge for 5 s. A 2 s grace
      // after the plant stops the planter defusing their own charge by
      // still holding E from the plant.
      r.defusing = false;
      if (p.alive) {
        const d = Math.hypot(p.pos.x - plant.x, p.pos.z - plant.z);
        if (d < 2.5 && state.elapsed >= plant.noDefuseUntil && input && input.keys.has('KeyE') && holdingStill(state, input)) {
          r.defusing = true;
          r.defuseProgress += dt / DEFUSE_SECONDS;
          if (r.defuseProgress >= 1) {
            r.defuseProgress = 0;
            r.plant = null;
            endRound(state, 'them', audio, 'defused');
            return;
          }
        } else {
          r.defuseProgress = 0;
        }
      }
      // The player fell: Sable walks to the charge and defuses if she can.
      if (!p.alive) {
        const ally = state.bots.find((b) => b.team === 'ally');
        if (ally && ally.alive) {
          const d = Math.hypot(ally.pos.x - plant.x, ally.pos.z - plant.z);
          if (d < 2.5 && state.elapsed >= plant.noDefuseUntil) {
            r.defusing = true;
            r.defuseProgress += dt / DEFUSE_SECONDS;
            if (r.defuseProgress >= 1) {
              r.defuseProgress = 0;
              r.plant = null;
              endRound(state, 'them', audio, 'defused');
              return;
            }
          }
        } else {
          // Nobody left to defuse: the charge is lost with the team.
          endRound(state, 'them', audio, 'charge-lost');
          return;
        }
      }
      if (state.elapsed >= plant.explodesAt) {
        if (audio) audio.explosion();
        endRound(state, 'you', audio, 'detonation');
        return;
      }
    } else {
      r.timer -= dt;
    }

    // Elimination win: every enemy down at once. With a charge planted
    // the round plays on until the detonation (no one left to defuse).
    const enemiesAlive = state.bots.filter((b) => b.team === 'enemy' && b.alive).length;
    if (enemiesAlive === 0 && state.bots.length > 0 && !plant) {
      endRound(state, 'you', audio, 'elimination');
      return;
    }
    // Player death before a plant loses the round outright.
    if (!p.alive && !plant) {
      state.weapon.deaths += 1;
      endRound(state, 'them', audio, 'eliminated');
      return;
    }
    if (r.timer <= 0) endRound(state, 'them', audio, 'time');
    return;
  }

  if (r.phase === 'over') {
    // After the banner, the next round opens with a buy phase.
    if (state.elapsed >= r.bannerUntil) {
      r.number += 1;
      startBuyPhase(state, audio);
    }
  }
  // 'matchover': nothing ticks here; the restart button calls resetMatch.
}

export { BUY_SECONDS };

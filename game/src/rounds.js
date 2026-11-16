// rounds.js — the round machine. Part 1 runs a working loop so the game
// is complete end-to-end: live round on a timer, round over on time or on
// elimination, a short banner, then the next round. Part 2 fills in the buy
// phase (15 s, buy menu, money from kills and round wins) and the plant /
// defuse objective behind the same startRound / endRound interface.
import { ROUND_SECONDS, BUY_SECONDS, pushFeed } from './state.js';

export function startRound(state, audio) {
  const r = state.round;
  r.phase = 'live';
  r.timer = ROUND_SECONDS;
  r.banner = `ROUND ${r.number} — ELIMINATE THE DEFENDERS`;
  r.bannerUntil = state.elapsed + 3;
  if (audio) audio.roundStart();
}

export function endRound(state, winner, audio) {
  const r = state.round;
  if (r.phase === 'over') return;
  r.phase = 'over';
  r.timer = 0;
  const youWin = winner === 'you';
  if (youWin) {
    r.scoreYou += 1;
    r.money += 300; // Part 2: kill bonuses and buy-phase spending land here
    r.banner = 'ROUND WON';
  } else {
    r.scoreThem += 1;
    r.money += 150;
    r.banner = winner === 'time' ? 'TIME UP — ROUND LOST' : 'ROUND LOST';
  }
  r.bannerUntil = state.elapsed + 3.5;
  pushFeed(state, r.banner);
  if (audio) audio.roundEnd(youWin);
}

// One step of the round machine. Returns nothing; the state is the record.
export function updateRounds(state, dt, audio) {
  const r = state.round;
  if (r.phase === 'live') {
    r.timer -= dt;
    // Elimination win: every dummy down at once.
    const alive = state.bots.filter((b) => b.alive).length;
    if (alive === 0 && state.bots.length > 0) {
      endRound(state, 'you', audio);
      return;
    }
    if (r.timer <= 0) endRound(state, 'time', audio);
    // Player death loses the round (Part 2: the team check replaces this).
    if (!state.player.alive && r.phase === 'live') endRound(state, 'them', audio);
  } else if (r.phase === 'over') {
    // After the banner, the next round starts: fresh timer, bots respawn,
    // player back at spawn with full health.
    if (state.elapsed >= r.bannerUntil) {
      r.number += 1;
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
      for (const b of state.bots) {
        b.health = 100;
        b.alive = true;
        b.pos.x = b.spawn.x;
        b.pos.z = b.spawn.z;
        b.group.position.set(b.spawn.x, 0, b.spawn.z);
        b.group.rotation.set(0, 0, 0);
        b.group.visible = true;
      }
      startRound(state, audio);
    }
  }
}

// --- Part 2 hooks (signatures fixed now, the economy lands here) ---
// startBuyPhase(state): 15 s buy window before startRound; the buy menu
// spends state.round.money on weapons, armour and grenades.
// plantCharge(state, site) / defuseCharge(state): the objective timers;
// a planted charge ends the round on detonation unless defused.
export { BUY_SECONDS };

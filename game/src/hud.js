// hud.js — the DOM overlay: health, ammo, round timer, score, money,
// crosshair, hitmarker, kill feed, round banner, buy menu, plant/defuse
// progress, charge timer, match point and the match-end screen.
// It only reads state; it never simulates. Text is written only when it
// changes, so the HUD costs nothing on frames where nothing moved.
import { currentSpread } from './weapon.js';
import { BUY_ITEMS } from './buy.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    root: $('hud'),
    healthBar: $('health-fill'),
    healthNum: $('health-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    gearLine: $('gear-line'),
    timer: $('round-timer'),
    score: $('score'),
    money: $('money'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    feed: $('feed'),
    banner: $('banner'),
    bannerText: $('banner-text'),
    vignette: $('damage-vignette'),
    title: $('title-screen'),
    playBtn: $('play-btn'),
    roundLabel: $('round-label'),
    buyMenu: $('buy-menu'),
    buyList: $('buy-list'),
    objective: $('objective'),
    objectiveLabel: $('objective-label'),
    objectiveFill: $('objective-fill'),
    matchEnd: $('match-end'),
    matchEndText: $('match-end-text'),
    restartBtn: $('restart-btn'),
  };
  // Build the buy menu rows once from the same table the shop uses.
  if (els.buyList) {
    els.buyList.innerHTML = BUY_ITEMS.map((i) =>
      `<div class="buy-row" data-key="${i.key}"><b>${i.key}</b> ${i.name} — $${i.price}<span>${i.desc}</span></div>`,
    ).join('');
  }
  return { els, cache: {} };
}

function setText(hud, key, el, value) {
  if (hud.cache[key] !== value) {
    hud.cache[key] = value;
    el.textContent = value;
  }
}

export function updateHud(state, hud) {
  const e = hud.els;
  const r = state.round;
  const w = state.weapon;
  const p = state.player;

  setText(hud, 'hp', e.healthNum, String(Math.max(0, Math.ceil(p.health))));
  const hpPct = Math.max(0, p.health) + '%';
  if (hud.cache.hpBar !== hpPct) {
    hud.cache.hpBar = hpPct;
    e.healthBar.style.width = hpPct;
    e.healthBar.style.background = p.health > 50 ? '#2fd4c4' : p.health > 25 ? '#f0a830' : '#e5484d';
  }

  setText(hud, 'ammo', e.ammoMag, w.reloading ? '--' : String(w.ammo));
  setText(hud, 'reserve', e.ammoReserve, `/ ${w.reserve}`);
  setText(hud, 'weapon', e.weaponName, w.name.toUpperCase());
  const gear = `${p.grenades > 0 ? `GRENADES ${p.grenades}  ` : ''}${p.kevlar ? 'KEVLAR' : ''}`;
  setText(hud, 'gear', e.gearLine, gear);

  // Timer: the charge countdown replaces the round clock once planted.
  const planted = !!r.plant;
  const timerText = planted
    ? `CHARGE ${formatTimer(Math.max(0, r.plant.explodesAt - state.elapsed))}`
    : formatTimer(r.timer);
  setText(hud, 'timer', e.timer, timerText);
  e.timer.style.color = planted ? '#e5484d' : '';

  const matchPoint = (r.scoreYou === 4 || r.scoreThem === 4) && !r.matchWinner;
  setText(hud, 'score', e.score, `YOU ${r.scoreYou} : ${r.scoreThem} THEM${matchPoint ? '  — MATCH POINT' : ''}`);
  setText(hud, 'money', e.money, `$${r.money}`);
  setText(hud, 'round', e.roundLabel, r.phase === 'matchover' ? 'MATCH OVER' : `ROUND ${r.number}`);

  // Crosshair: the gap grows with spread, so stopping to aim is visible.
  const gap = 3 + currentSpread(state) * 900;
  if (Math.abs((hud.cache.gap ?? 0) - gap) > 0.4) {
    hud.cache.gap = gap;
    e.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
  }

  // Hitmarker flashes for 120 ms after a hit (red on a headshot).
  const sinceHit = state.elapsed - state.hitmarkAt;
  const head = state.elapsed - state.headshotAt < 0.12;
  e.hitmarker.style.opacity = sinceHit < 0.12 ? '1' : '0';
  e.hitmarker.style.color = head ? '#ff5a4d' : '#e9e6df';

  // Damage vignette flashes red when the player is hurt.
  const sinceHurt = state.elapsed - state.damageAt;
  e.vignette.style.opacity = sinceHurt < 0.35 ? String(0.55 * (1 - sinceHurt / 0.35)) : '0';

  // Kill feed: newest first, fades entries older than 5 s.
  const feedHtml = state.feed
    .filter((f) => state.elapsed - f.at < 5)
    .map((f) => `<div>${escapeHtml(f.text)}</div>`)
    .join('');
  if (hud.cache.feed !== feedHtml) {
    hud.cache.feed = feedHtml;
    e.feed.innerHTML = feedHtml;
  }

  // Round banner shows while its timer runs — but never over the title
  // screen, where it would collide with the title card text.
  const titleShown = !state.running && r.phase !== 'matchover';
  const showBanner = state.elapsed < r.bannerUntil && !titleShown;
  e.banner.style.opacity = showBanner ? '1' : '0';
  if (showBanner) setText(hud, 'banner', e.bannerText, r.banner);

  // Buy menu: visible during the buy phase when open; rows dim when
  // unaffordable, so the player sees what they can afford at a glance.
  // Hidden under the title screen so the shop never bleeds through it.
  const showBuy = r.phase === 'buy' && r.buyOpen && !titleShown;
  e.buyMenu.style.display = showBuy ? 'block' : 'none';
  if (showBuy) {
    const buyKey = `buy-${r.money}-${w.id}-${p.kevlar}-${p.grenades}`;
    if (hud.cache.buyKey !== buyKey) {
      hud.cache.buyKey = buyKey;
      for (const row of e.buyList.children) {
        const item = BUY_ITEMS.find((i) => i.key === Number(row.dataset.key));
        const owned = (item.kind === 'kevlar' && p.kevlar) || (item.kind === 'weapon' && item.id === w.id);
        row.style.opacity = owned ? '0.45' : r.money >= item.price ? '1' : '0.45';
      }
    }
  }

  // Objective bar: planting, defusing, or the live charge countdown.
  let objLabel = '';
  let objPct = 0;
  if (r.plantProgress > 0) { objLabel = `PLANTING AT ${r.plantingSite} — HOLD E`; objPct = r.plantProgress; }
  else if (r.defuseProgress > 0) { objLabel = 'DEFUSING — HOLD E'; objPct = r.defuseProgress; }
  else if (planted) { objLabel = `CHARGE AT ${r.plant.site} — ${Math.ceil(r.plant.explodesAt - state.elapsed)}s`; objPct = Math.max(0, (r.plant.explodesAt - state.elapsed) / 35); }
  else if (r.plantingSite && r.phase === 'live') { objLabel = `HOLD E TO PLANT AT ${r.plantingSite}`; objPct = 0; }
  const showObj = objLabel !== '';
  e.objective.style.display = showObj ? 'block' : 'none';
  if (showObj) {
    setText(hud, 'objlabel', e.objectiveLabel, objLabel);
    const pct = Math.round(objPct * 100) + '%';
    if (hud.cache.objPct !== pct) {
      hud.cache.objPct = pct;
      e.objectiveFill.style.width = pct;
      e.objectiveFill.style.background = planted && r.defuseProgress === 0 ? '#e5484d' : '#2fd4c4';
    }
  }

  // Match-end screen: result, final score, restart button.
  const over = r.phase === 'matchover';
  e.matchEnd.style.display = over ? 'flex' : 'none';
  if (over) {
    setText(hud, 'matchtext', e.matchEndText,
      `${r.matchWinner === 'you' ? 'VICTORY' : 'DEFEAT'} — ${r.scoreYou} : ${r.scoreThem}  ·  ${w.kills} kills, ${w.deaths} deaths`);
  }

  // Title screen hides once the game is running, and stays hidden on the
  // match-end screen so the restart button is the way back in.
  e.title.style.display = (state.running || state.round.phase === 'matchover') ? 'none' : 'flex';
}

function formatTimer(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

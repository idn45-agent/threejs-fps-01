// hud.js — the DOM overlay: health, ammo, round timer, score, money,
// crosshair, hitmarker, kill feed, round banner and the title screen.
// It only reads state; it never simulates. Text is written only when it
// changes, so the HUD costs nothing on frames where nothing moved.
import { currentSpread } from './weapon.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    root: $('hud'),
    healthBar: $('health-fill'),
    healthNum: $('health-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
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
  };
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
  setText(hud, 'timer', e.timer, formatTimer(r.timer));
  setText(hud, 'score', e.score, `YOU ${r.scoreYou} : ${r.scoreThem} THEM`);
  setText(hud, 'money', e.money, `$${r.money}`);
  setText(hud, 'round', e.roundLabel, `ROUND ${r.number}`);

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

  // Round banner shows while its timer runs.
  const showBanner = state.elapsed < r.bannerUntil;
  e.banner.style.opacity = showBanner ? '1' : '0';
  if (showBanner) setText(hud, 'banner', e.bannerText, r.banner);

  // Title screen hides once the game is running.
  e.title.style.display = state.running ? 'none' : 'flex';
}

function formatTimer(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

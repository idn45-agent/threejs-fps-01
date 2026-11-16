// textures.js — every texture in DUSTLINE is painted in code on a canvas.
// No downloaded images, no stock packs: sand, concrete, crate wood, metal
// and the glowing site pads are all procedural. One canvas per material,
// drawn once at load and reused by every mesh that shares it.
import * as THREE from 'three';

// Deterministic speckles: the same seed paints the same texture every load,
// so the map looks identical in every screenshot.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, size, rand, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.globalAlpha = 0.12 + rand() * 0.25;
    const r = rMin + rand() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Desert-dusk palette: sand, rust, teal accents, dusk violet sky.
export const PALETTE = {
  sand: '#c8a06a',
  sandDark: '#a87f4e',
  rust: '#8a4a2b',
  rustDark: '#5f2f1a',
  concrete: '#9a8d7a',
  concreteDark: '#6e6355',
  teal: '#2fd4c4',
  amber: '#f0a830',
  violet: '#2b2340',
  dusk: '#e8875a',
};

export function makeTextures() {
  const out = {};

  // --- Ground: warm sand with darker drifts and pale grains.
  {
    const s = 512;
    const c = canvas(s);
    const x = c.getContext('2d');
    const r = rng(11);
    x.fillStyle = PALETTE.sand;
    x.fillRect(0, 0, s, s);
    speckle(x, s, r, 2600, [PALETTE.sandDark, '#d9b57e', '#8a6a42', '#e8c88f'], 1, 4);
    // wind-blown drifts: long soft streaks
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = r() > 0.5 ? PALETTE.sandDark : '#d9b57e';
      x.globalAlpha = 0.08 + r() * 0.1;
      x.lineWidth = 2 + r() * 6;
      x.beginPath();
      const y = r() * s;
      x.moveTo(0, y);
      x.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 30, s * 0.7, y + (r() - 0.5) * 30, s, y);
      x.stroke();
    }
    x.globalAlpha = 1;
    out.ground = toTexture(c, 8);
  }

  // --- Walls: sun-baked concrete panels with rust weep and panel seams.
  {
    const s = 256;
    const c = canvas(s);
    const x = c.getContext('2d');
    const r = rng(23);
    x.fillStyle = PALETTE.concrete;
    x.fillRect(0, 0, s, s);
    speckle(x, s, r, 900, [PALETTE.concreteDark, '#b3a48c', '#7a6c58'], 1, 3);
    // panel seams
    x.strokeStyle = 'rgba(60,50,38,0.55)';
    x.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      x.beginPath(); x.moveTo(0, (i * s) / 2); x.lineTo(s, (i * s) / 2); x.stroke();
      x.beginPath(); x.moveTo((i * s) / 2, 0); x.lineTo((i * s) / 2, s); x.stroke();
    }
    // rust weep from the top edge
    for (let i = 0; i < 14; i++) {
      const px = r() * s;
      const len = 20 + r() * 70;
      const g = x.createLinearGradient(px, 0, px, len);
      g.addColorStop(0, 'rgba(138,74,43,0.5)');
      g.addColorStop(1, 'rgba(138,74,43,0)');
      x.fillStyle = g;
      x.fillRect(px - 2, 0, 4 + r() * 4, len);
    }
    out.wall = toTexture(c, 2);
  }

  // --- Crates: planks with grain, nails and a stencilled teal stripe.
  {
    const s = 256;
    const c = canvas(s);
    const x = c.getContext('2d');
    const r = rng(37);
    x.fillStyle = '#7d5a33';
    x.fillRect(0, 0, s, s);
    for (let p = 0; p < 4; p++) {
      const y = (p * s) / 4;
      x.fillStyle = p % 2 ? '#8a653c' : '#75552f';
      x.fillRect(0, y + 2, s, s / 4 - 4);
      // grain lines
      x.strokeStyle = 'rgba(60,40,18,0.35)';
      x.lineWidth = 1;
      for (let g = 0; g < 6; g++) {
        x.beginPath();
        const gy = y + 6 + r() * (s / 4 - 12);
        x.moveTo(0, gy);
        x.bezierCurveTo(s * 0.3, gy + (r() - 0.5) * 6, s * 0.7, gy + (r() - 0.5) * 6, s, gy);
        x.stroke();
      }
      // nails
      x.fillStyle = '#3a2c1c';
      x.beginPath(); x.arc(10, y + s / 8, 3, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(s - 10, y + s / 8, 3, 0, Math.PI * 2); x.fill();
    }
    // stencilled stripe, teal
    x.fillStyle = PALETTE.teal;
    x.globalAlpha = 0.85;
    x.fillRect(0, s / 2 - 10, s, 20);
    x.globalAlpha = 1;
    out.crate = toTexture(c, 1);
  }

  // --- Metal: dark plate with rivets and a rust edge, for doors and beams.
  {
    const s = 256;
    const c = canvas(s);
    const x = c.getContext('2d');
    const r = rng(51);
    x.fillStyle = '#4a4640';
    x.fillRect(0, 0, s, s);
    speckle(x, s, r, 500, ['#5c564c', '#38342e', PALETTE.rust], 1, 3);
    x.strokeStyle = 'rgba(20,18,14,0.6)';
    x.lineWidth = 2;
    x.strokeRect(4, 4, s - 8, s - 8);
    x.fillStyle = '#6a6258';
    for (const [px, py] of [[16, 16], [s - 16, 16], [16, s - 16], [s - 16, s - 16]]) {
      x.beginPath(); x.arc(px, py, 5, 0, Math.PI * 2); x.fill();
    }
    out.metal = toTexture(c, 1);
  }

  // --- Site pad: dark stone with a painted teal ring (A) / amber ring (B
  // variants are tinted at material level, the ring is drawn here).
  {
    const s = 256;
    const c = canvas(s);
    const x = c.getContext('2d');
    const r = rng(67);
    x.fillStyle = '#3d3630';
    x.fillRect(0, 0, s, s);
    speckle(x, s, r, 700, ['#2e2822', '#4c443a', '#57503f'], 1, 3);
    x.strokeStyle = '#e8e2d4';
    x.lineWidth = 6;
    x.beginPath(); x.arc(s / 2, s / 2, 96, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 2;
    x.beginPath(); x.arc(s / 2, s / 2, 78, 0, Math.PI * 2); x.stroke();
    out.sitePad = toTexture(c, 1);
  }

  return out;
}

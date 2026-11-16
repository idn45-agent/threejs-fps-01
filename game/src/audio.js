// audio.js — every sound in DUSTLINE is synthesized with WebAudio.
// No audio files: a gunshot is a filtered noise burst plus a low thump,
// reloads are short clicks, hits are a tick. The context starts on the
// first user gesture (the Click to Play), as browsers require.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(seconds) {
    const c = ensure();
    if (!c) return null;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function burst(dur, filterFreq, gainVal, type = 'lowpass') {
    const c = ensure();
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gainVal, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
    src.stop(c.currentTime + dur);
  }

  function tone(freq, dur, gainVal, type = 'sine', slideTo = 0) {
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gainVal, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(c.currentTime + dur);
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    shot() {
      burst(0.14, 2400, 0.9); // crack
      tone(150, 0.12, 0.7, 'sine', 55); // body thump
    },
    dryFire() {
      tone(1800, 0.03, 0.15, 'square');
    },
    reloadStart() {
      tone(900, 0.04, 0.2, 'square');
    },
    reloadEnd() {
      tone(1200, 0.05, 0.25, 'square');
      setTimeout(() => tone(700, 0.04, 0.2, 'square'), 90);
    },
    hit(head) {
      tone(head ? 2400 : 1700, 0.06, 0.3, 'sine');
    },
    kill() {
      tone(520, 0.09, 0.3, 'triangle', 780);
    },
    hurt() {
      tone(110, 0.18, 0.5, 'sawtooth', 70);
    },
    roundStart() {
      tone(440, 0.12, 0.25, 'triangle');
      setTimeout(() => tone(660, 0.16, 0.25, 'triangle'), 130);
    },
    roundEnd(win) {
      tone(win ? 660 : 330, 0.2, 0.3, 'triangle', win ? 990 : 220);
    },
    plant() {
      tone(980, 0.08, 0.2, 'square');
    },
    // A bot's shot, quieter and duller with distance.
    botShot(dist) {
      const v = Math.max(0.08, 0.35 - (dist || 0) * 0.006);
      burst(0.1, 1600, v);
    },
    throwGrenade() {
      tone(500, 0.08, 0.2, 'sine', 300);
    },
    explosion() {
      burst(0.5, 400, 0.9);
      tone(90, 0.5, 0.7, 'sine', 35);
    },
    // The planted charge beeps once a second until it blows.
    beep() {
      tone(1200, 0.07, 0.25, 'square');
    },
    buy() {
      tone(880, 0.07, 0.25, 'triangle');
      setTimeout(() => tone(1320, 0.09, 0.25, 'triangle'), 80);
    },
    deny() {
      tone(220, 0.12, 0.25, 'square', 160);
    },
  };
}

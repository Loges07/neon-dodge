/* Neon Dodge — procedural audio (Web Audio API).
 * Every sound effect and the music loop is synthesized at runtime; there are no audio files.
 */
const Sound = (() => {
  'use strict';

  let ac = null;
  let master, sfxBus, musicBus, musicFilter, noiseBuf;
  let sfxOn = true;
  let musicOn = true;
  let paused = false;
  let intensity = 1;

  let timer = null;
  let nextTime = 0;
  let step = 0;

  const BPM = 116;
  const STEP = 60 / BPM / 4; // one 16th note
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Am - F - C - G, one bar each. Tones are semitone offsets for the arpeggio.
  const CHORDS = [
    { root: 45, tones: [0, 3, 7, 12, 15, 12, 7, 3] },
    { root: 41, tones: [0, 4, 7, 12, 16, 12, 7, 4] },
    { root: 48, tones: [0, 4, 7, 12, 16, 12, 7, 4] },
    { root: 43, tones: [0, 4, 7, 12, 14, 12, 7, 4] },
  ];

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ac = new AC();
      } catch (e) {
        return false;
      }
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(ac.destination);

      master = ac.createGain();
      master.gain.value = 0.9;
      master.connect(comp);

      sfxBus = ac.createGain();
      sfxBus.gain.value = sfxOn ? 0.55 : 0;
      sfxBus.connect(master);

      musicFilter = ac.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = 16000;
      musicFilter.connect(master);

      musicBus = ac.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(musicFilter);

      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      applyMusicGain();
    }
    if (ac.state === 'suspended') ac.resume();
    if (!timer) {
      nextTime = ac.currentTime + 0.1;
      timer = setInterval(schedule, 25);
    }
    return true;
  }

  // ---------- primitives ----------
  function osc(type, f, f2, t, dur, vol, bus, attack = 0.004) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise(t, dur, vol, ftype, f, f2, bus, q = 1) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ac.createBiquadFilter();
    filt.type = ftype;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f, t);
    if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  // ---------- music ----------
  function schedule() {
    if (!ac) return;
    // After the tab was throttled, skip ahead instead of replaying a backlog of notes.
    if (nextTime < ac.currentTime - 0.2) nextTime = ac.currentTime + 0.05;
    while (nextTime < ac.currentTime + 0.12) {
      if (musicOn && !paused) playStep(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % 64;
    }
  }

  function playStep(s, t) {
    const chord = CHORDS[Math.floor(s / 16) % 4];
    const i = s % 16;

    // Kick on every beat.
    if (i % 4 === 0) osc('sine', 150, 42, t, 0.2, 0.55, musicBus);

    // Driving 8th-note bass with an octave bounce.
    if (i % 2 === 0) {
      const o = ac.createOscillator();
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.value = mtof(chord.root + (i % 4 === 2 ? 12 : 0));
      f.type = 'lowpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(intensity >= 3 ? 1400 : 900, t);
      f.frequency.exponentialRampToValueAtTime(180, t + STEP * 1.8);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.8);
      o.connect(f);
      f.connect(g);
      g.connect(musicBus);
      o.start(t);
      o.stop(t + STEP * 2);
    }

    if (intensity >= 2) {
      osc('square', mtof(chord.root + 24 + chord.tones[i % 8]), null, t, STEP * 0.9, 0.04, musicBus);
      if (i % 4 === 2) noise(t, 0.04, 0.1, 'highpass', 7000, null, musicBus);
    }
    if (intensity >= 3) {
      if (i % 2 === 1) noise(t, 0.03, 0.06, 'highpass', 9000, null, musicBus);
      if (i === 4 || i === 12) {
        noise(t, 0.14, 0.22, 'bandpass', 1800, 900, musicBus, 0.8);
        osc('triangle', 200, 120, t, 0.1, 0.12, musicBus);
      }
    }
    if (intensity >= 4 && i === 0) {
      osc('triangle', mtof(chord.root + 36), null, t, STEP * 6, 0.06, musicBus, 0.02);
      osc('triangle', mtof(chord.root + 43), null, t, STEP * 6, 0.04, musicBus, 0.02);
    }
  }

  function applyMusicGain() {
    if (!ac) return;
    const target = musicOn && !paused ? 0.32 : 0;
    musicBus.gain.setTargetAtTime(target, ac.currentTime, 0.12);
  }

  // ---------- sound effects ----------
  const now = () => ac.currentTime;
  const effects = {
    start() {
      [0, 4, 7, 12].forEach((n, i) => osc('square', mtof(69 + n), null, now() + i * 0.06, 0.12, 0.16, sfxBus));
    },
    click() {
      osc('square', 880, null, now(), 0.04, 0.07, sfxBus);
    },
    dash() {
      noise(now(), 0.22, 0.32, 'bandpass', 2600, 500, sfxBus, 0.8);
      osc('sawtooth', 300, 900, now(), 0.12, 0.07, sfxBus);
    },
    graze(chain) {
      const f = 700 * Math.pow(2, Math.min(chain, 24) / 24);
      osc('triangle', f, f * 1.5, now(), 0.09, 0.2, sfxBus);
    },
    multUp() {
      osc('square', 1046, 2093, now(), 0.12, 0.1, sfxBus);
    },
    shard() {
      osc('sine', 1320, null, now(), 0.07, 0.2, sfxBus);
      osc('sine', 1760, null, now() + 0.05, 0.09, 0.18, sfxBus);
    },
    power() {
      [0, 4, 7, 11, 14].forEach((n, i) => osc('triangle', mtof(76 + n), null, now() + i * 0.045, 0.14, 0.2, sfxBus));
    },
    shieldBreak() {
      noise(now(), 0.35, 0.4, 'lowpass', 3000, 300, sfxBus);
      osc('square', 600, 120, now(), 0.3, 0.14, sfxBus);
    },
    laserCharge(d) {
      osc('sawtooth', 160, 520, now(), d, 0.045, sfxBus, d * 0.8);
    },
    laserFire() {
      noise(now(), 0.3, 0.32, 'lowpass', 6000, 800, sfxBus);
      osc('square', 110, 55, now(), 0.3, 0.16, sfxBus);
    },
    ring() {
      osc('sine', 220, 880, now(), 0.4, 0.14, sfxBus);
    },
    burst() {
      noise(now(), 0.18, 0.28, 'bandpass', 1500, 400, sfxBus, 1.2);
      osc('triangle', 500, 150, now(), 0.15, 0.14, sfxBus);
    },
    bounce() {
      osc('square', 320, null, now(), 0.05, 0.05, sfxBus);
    },
    nova() {
      noise(now(), 0.9, 0.5, 'lowpass', 8000, 150, sfxBus);
      osc('sawtooth', 900, 60, now(), 0.8, 0.16, sfxBus);
    },
    slow() {
      osc('sine', 600, 150, now(), 0.6, 0.24, sfxBus);
    },
    levelUp() {
      [0, 7, 12, 16, 19, 24].forEach((n, i) => osc('square', mtof(64 + n), null, now() + i * 0.07, 0.16, 0.12, sfxBus));
    },
    death() {
      noise(now(), 1.4, 0.6, 'lowpass', 4000, 60, sfxBus);
      osc('sawtooth', 220, 30, now(), 1.2, 0.28, sfxBus);
    },
  };

  const sfx = {};
  for (const name of Object.keys(effects)) {
    sfx[name] = (...args) => {
      if (!ac || !sfxOn || ac.state !== 'running') return;
      effects[name](...args);
    };
  }

  return {
    ensure,
    sfx,
    setSfx(on) {
      sfxOn = on;
      if (ac) sfxBus.gain.setTargetAtTime(on ? 0.55 : 0, ac.currentTime, 0.05);
    },
    setMusic(on) {
      musicOn = on;
      applyMusicGain();
    },
    setPaused(p) {
      paused = p;
      applyMusicGain();
    },
    setIntensity(n) {
      intensity = n;
    },
    setSlow(on) {
      if (ac) musicFilter.frequency.setTargetAtTime(on ? 650 : 16000, ac.currentTime, 0.2);
    },
  };
})();

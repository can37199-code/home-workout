// 운동용 배경음악: Web Audio로 직접 연주하는 신스 비트 (저작권 걱정 없음) + 내 음악 파일 재생
import { getAudioCtx } from './audio.js';
import { loadBlob } from './idb.js';

export const STYLES = {
  house: { label: '신나는 하우스', bpm: 124 },
  funk: { label: '펑키 팝', bpm: 108 },
  edm: { label: '파워 EDM', bpm: 136 },
  mine: { label: '내 음악 파일', bpm: 0 },
  off: { label: '끄기', bpm: 0 },
};

// 코드 진행 Am - F - C - G (한 마디씩)
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const BASS = [45, 41, 48, 43];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const PATTERNS = {
  house: {
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', ohat: '................',
    bass: '..x...x...x..xx.', stab: '...x.....x..x...', arp: 'x.x.x.x.x.x.x.x.',
  },
  funk: {
    kick: 'x.....x...x.....', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', ohat: '......x.......x.',
    bass: 'x..x..x.x..x.x..', stab: '..x...x...x...x.', arp: '................',
  },
  edm: {
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.',
    bass: '.xxx.xxx.xxx.xxx', stab: 'x.....x.....x...', arp: 'xxxxxxxxxxxxxxxx',
  },
};

export class Music {
  constructor() {
    this.style = 'off'; this.bpm = 120; this.vol = 0.7; this.step = 0; this.timer = null;
    this.duckLevel = 1; this.audio = null; this.noise = null;
  }

  async start(style, vol) {
    this.stop();
    this.style = style; this.vol = vol;
    if (style === 'off') return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (style === 'mine') {
      const blob = await loadBlob('myMusic').catch(() => null);
      if (!blob) return;
      this.audio = new Audio(URL.createObjectURL(blob));
      this.audio.loop = true; this.audio.volume = vol * 0.8;
      this.audio.play().catch(() => {});
      return;
    }
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = vol * 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.out.connect(comp); comp.connect(ctx.destination);
    if (!this.noise) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    this.bpm = STYLES[style].bpm;
    this.baseBpm = this.bpm;
    this.step = 0;
    this.next = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer); this.timer = null;
    if (this.out) { const o = this.out; o.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); setTimeout(() => o.disconnect(), 300); this.out = null; }
    if (this.audio) { this.audio.pause(); URL.revokeObjectURL(this.audio.src); this.audio = null; }
  }

  // 운동 속도에 박자를 맞춘다: 1회 동작 = 2박 또는 4박
  syncTo(repSec) {
    if (!this.baseBpm || !repSec) return;
    // 1회 동작 = 1·2·4·8박 중에서 원래 곡 템포에 가장 가까운 것
    const options = [1, 2, 4, 8].map((beats) => (60 * beats) / repSec).filter((b) => b >= 80 && b <= 165);
    if (!options.length) return this.resetTempo();
    this.bpm = options.reduce((a, b) => (Math.abs(b - this.baseBpm) < Math.abs(a - this.baseBpm) ? b : a));
  }
  resetTempo() { if (this.baseBpm) this.bpm = this.baseBpm; }

  // 음성 안내가 나올 때 음악을 줄인다
  duck(on) {
    this.duckLevel = on ? 0.35 : 1;
    if (this.out) this.out.gain.setTargetAtTime(this.vol * 0.55 * this.duckLevel * this.soft, this.ctx.currentTime, 0.08);
    if (this.audio) this.audio.volume = this.vol * 0.8 * this.duckLevel * this.soft;
  }
  // 휴식 시간에는 살짝 작게
  setSoft(on) { this.soft = on ? 0.6 : 1; this.duck(this.duckLevel < 1); }
  soft = 1;

  schedule() {
    const ctx = this.ctx;
    while (this.next < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.next);
      this.next += 60 / this.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t) {
    const p = PATTERNS[this.style];
    const s = step % 16, bar = Math.floor(step / 16);
    const hit = (row) => p[row][s] === 'x';
    const intro = this.style === 'edm' && bar === 3 && s >= 12; // 4마디째 끝에 필인
    if (hit('kick') && !intro) this.kick(t);
    if (hit('snare') || (intro && s % 2 === 0)) this.snare(t, intro ? 0.5 + (s - 12) * 0.12 : 0.8);
    if (hit('hat')) this.hat(t, 0.035, s % 4 === 2 ? 0.35 : 0.2);
    if (hit('ohat')) this.hat(t, 0.16, 0.22);
    if (hit('bass')) this.bass(t, BASS[bar], s);
    if (hit('stab')) this.stab(t, CHORDS[bar]);
    if (hit('arp')) {
      const ch = CHORDS[bar];
      this.pluck(t, ch[s % 3] + 12 + (Math.floor(s / 3) % 2) * 12);
    }
  }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.003, 1, 0.3);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.35);
  }
  snare(t, v) {
    const n = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    n.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    this.env(g, t, 0.002, 0.5 * v, 0.16);
    n.connect(f); f.connect(g); g.connect(this.out); n.start(t); n.stop(t + 0.2);
    const o = this.ctx.createOscillator(), g2 = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t);
    this.env(g2, t, 0.002, 0.25 * v, 0.08);
    o.connect(g2); g2.connect(this.out); o.start(t); o.stop(t + 0.12);
  }
  hat(t, len, v) {
    const n = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7500;
    this.env(g, t, 0.001, v, len);
    n.connect(f); f.connect(g); g.connect(this.out); n.start(t, Math.random()); n.stop(t + len + 0.02);
  }
  bass(t, note, s) {
    const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(mtof(note + (this.style === 'funk' && s % 8 === 6 ? 12 : 0)), t);
    f.type = 'lowpass'; f.frequency.setValueAtTime(this.style === 'edm' ? 900 : 600, t);
    f.frequency.exponentialRampToValueAtTime(160, t + 0.18); f.Q.value = 6;
    this.env(g, t, 0.005, 0.42, 0.2);
    o.connect(f); f.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.26);
  }
  stab(t, chord) {
    const f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.2);
    this.env(g, t, 0.004, 0.13, 0.22);
    f.connect(g); g.connect(this.out);
    for (const m of chord) for (const det of [-7, 7]) {
      const o = this.ctx.createOscillator();
      o.type = this.style === 'funk' ? 'square' : 'sawtooth';
      o.frequency.value = mtof(m + 12); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + 0.3);
    }
  }
  pluck(t, note) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = this.style === 'edm' ? 'square' : 'triangle';
    o.frequency.value = mtof(note);
    this.env(g, t, 0.002, this.style === 'edm' ? 0.05 : 0.09, 0.12);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.16);
  }
}

export const music = new Music();

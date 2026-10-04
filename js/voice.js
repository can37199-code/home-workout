// 음성 안내: 미리 만든 자연스러운 음성 파일(media/voice/*.mp3)을 Web Audio로 재생한다.
// 말하는 동안에는 배경음악 볼륨을 잠깐 낮춘다.
import { getAudioCtx } from './audio.js';
import { music } from './music.js';
import { LINES } from './voice-lines.js';

const cache = new Map();
let enabled = true;
let current = null;

export const setVoiceEnabled = (v) => { enabled = v; if (!v) stopVoice(); };

function load(key) {
  if (!LINES[key]) return Promise.resolve(null);
  if (!cache.has(key)) {
    const ctx = getAudioCtx();
    cache.set(key, fetch(`media/voice/${key}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
      .catch(() => { cache.delete(key); return null; }));
  }
  return cache.get(key);
}

// 운동에 쓸 문장들을 미리 받아 둔다 (첫 재생이 늦지 않게)
export function preloadVoice(keys) { if (enabled) keys.forEach(load); }

// 재생하고 길이(초)를 돌려준다. interrupt=false면 이미 말하는 중일 때 건너뛴다.
export async function say(key, { interrupt = true } = {}) {
  if (!enabled) return 0;
  if (!interrupt && current) return 0;
  const buf = await load(key);
  if (!buf) return 0;
  const ctx = getAudioCtx();
  if (current) { try { current.stop(); } catch { /* 이미 끝남 */ } }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  music.duck(true);
  src.onended = () => { if (current === src) { current = null; music.duck(false); } };
  src.start();
  current = src;
  return buf.duration;
}

export async function voiceLength(key) { const b = await load(key); return b ? b.duration : 0; }

export function stopVoice() {
  if (current) { try { current.stop(); } catch { /* 이미 끝남 */ } }
  current = null;
  music.duck(false);
}

// 모든 데이터는 이 폰의 localStorage에만 저장한다.
const KEY = 'homet.v1';

const defaults = () => ({
  challenge: null, // { start, days, level, startWeight, goalWeight, remindAt }
  logs: {},        // 'YYYY-MM-DD' → { done, partial, sec, kcal, reps: {id: n}, condition, memo, at }
  weights: {},     // 'YYYY-MM-DD' → kg
  prefs: { voice: true, mode: 'tap', tempo: {}, music: { style: 'house', vol: 0.7, sync: true } },
});

function withDefaults(raw) {
  const d = { ...defaults(), ...raw };
  d.prefs = { ...defaults().prefs, ...d.prefs };
  d.prefs.music = { ...defaults().prefs.music, ...d.prefs.music };
  return d;
}

let data;
try { data = withDefaults(JSON.parse(localStorage.getItem(KEY))); } catch { data = defaults(); }

export const db = () => data;
export function save() { localStorage.setItem(KEY, JSON.stringify(data)); }
export function replaceAll(next) { data = withDefaults(next); save(); }
export function resetAll() { data = defaults(); save(); }

// ---- 날짜 ----
const pad = (n) => String(n).padStart(2, '0');
export const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => fmt(new Date());
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
export const diffDays = (a, b) => {
  const [x, y] = [a, b].map((s) => { const [Y, M, D] = s.split('-').map(Number); return Date.UTC(Y, M - 1, D); });
  return Math.round((y - x) / 86400000);
};

// 챌린지 기준 날짜 번호 (0부터), 범위 밖이면 null
export function dayIndex(date = today()) {
  const c = data.challenge;
  if (!c) return null;
  const i = diffDays(c.start, date);
  return i >= 0 && i < c.days ? i : null;
}

export function streak() {
  let d = today();
  if (!data.logs[d]?.done) d = addDays(d, -1);
  let n = 0;
  while (data.logs[d]?.done) { n++; d = addDays(d, -1); }
  return n;
}

export function bestStreak() {
  const days = Object.keys(data.logs).filter((k) => data.logs[k].done).sort();
  let best = 0, cur = 0, prev = null;
  for (const d of days) { cur = prev && diffDays(prev, d) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}

export function latestWeight() {
  const ks = Object.keys(data.weights).sort();
  return ks.length ? data.weights[ks.at(-1)] : data.challenge?.startWeight || 65;
}

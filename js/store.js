// 모든 데이터는 이 폰의 localStorage에만 저장한다.
const KEY = 'homet.v1';

const defaults = () => ({
  challenge: null, // { start, days, level, startWeight, goalWeight, remindAt }
  logs: {},        // 'YYYY-MM-DD' → { done, partial, sec, kcal, reps: {id: n}, condition, memo, at }
  weights: {},     // 'YYYY-MM-DD' → kg
  prefs: { voice: true, mode: 'tap', tempo: {}, music: { style: 'house', vol: 0.7, sync: true } },
  rewards: rewardDefaults(),
});

// 보상: 코인·XP, 스트릭 방어권, 현실 보상 쿠폰, 배지, 주간 미션, 최고 기록
export const rewardDefaults = () => ({
  coins: 0, xp: 0,
  ledger: [],          // { at, date, coins, xp, note }
  shields: 0, shieldDays: {}, shieldEarned: {}, // 방어권 개수, 방어권을 쓴 날, 방어권을 받은 연속 일수 기준일
  coupons: [
    { id: 'c1', name: '좋아하는 카페 음료', cost: 300 },
    { id: 'c2', name: '치팅데이 한 끼', cost: 1000 },
    { id: 'c3', name: '새 운동복', cost: 3000 },
    { id: 'c4', name: '챌린지 완주 선물', cost: 8000 },
  ],
  redeemed: [],        // { id, name, cost, at, used }
  badges: {},          // id → 받은 날짜
  cards: {},           // 날짜 → 뽑은 카드
  weeklyClaimed: {},   // 주 키 → true
  pr: {},              // 동작 id → 최고 기록
  miniDays: {},        // 미니멈 데이로 한 날
  photos: {},          // 날짜 → true (사진 자체는 IndexedDB)
});

function withDefaults(raw) {
  const d = { ...defaults(), ...raw };
  d.prefs = { ...defaults().prefs, ...d.prefs };
  d.prefs.music = { ...defaults().prefs.music, ...d.prefs.music };
  d.rewards = { ...rewardDefaults(), ...d.rewards };
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

// 운동을 완료했거나 스트릭 방어권으로 지킨 날
export const keptDay = (d) => !!(data.logs[d]?.done || data.rewards?.shieldDays?.[d]);

export function streak() {
  let d = today();
  if (!keptDay(d)) d = addDays(d, -1);
  let n = 0;
  while (keptDay(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function bestStreak() {
  const days = [...new Set([...Object.keys(data.logs).filter((k) => data.logs[k].done), ...Object.keys(data.rewards?.shieldDays || {})])].sort();
  let best = 0, cur = 0, prev = null;
  for (const d of days) { cur = prev && diffDays(prev, d) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}

export function latestWeight() {
  const ks = Object.keys(data.weights).sort();
  return ks.length ? data.weights[ks.at(-1)] : data.challenge?.startWeight || 65;
}

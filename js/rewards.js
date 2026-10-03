// 보상 시스템: 코인·XP·레벨, 완주/연속/정시/복귀 보너스, 스트릭 방어권, 보상 카드, 주간 미션, 배지, 최고 기록, 현실 보상 쿠폰
// 원칙: 노력(운동한 것)에 보상하고, 놓친 날에도 벌점은 주지 않는다.
import { db, save, today, addDays, diffDays, parse, streak, keptDay } from './store.js';

const R = () => db().rewards;

// ---------- 레벨 ----------
const TITLES = [[1, 'Rookie', '루키'], [5, 'Challenger', '챌린저'], [10, 'Athlete', '애슬릿'], [15, 'Elite', '엘리트'], [20, 'Legend', '레전드']];
export const levelOf = (xp) => Math.floor(Math.sqrt(xp / 50)) + 1;
const xpAt = (lv) => 50 * (lv - 1) ** 2;
export function levelInfo(xp = R().xp) {
  const lv = levelOf(xp);
  const t = [...TITLES].reverse().find(([l]) => lv >= l);
  const a = xpAt(lv), b = xpAt(lv + 1);
  return { lv, title: t[1], titleKo: t[2], xp, into: xp - a, need: b - a, pct: (xp - a) / (b - a) };
}

function grant(coins, xp, note, date = today()) {
  const r = R();
  r.coins += coins; r.xp += xp;
  r.ledger.unshift({ at: Date.now(), date, coins, xp, note });
  if (r.ledger.length > 300) r.ledger.length = 300;
}

// ---------- 주(월요일 시작) ----------
export const weekKey = (date) => { const d = parse(date); return addDays(date, -((d.getDay() + 6) % 7)); };

// ---------- 스트릭 방어권 ----------
export const MAX_SHIELDS = 2;
// 이틀 전까지 놓친 날을 방어권으로 메운다 (어제는 오늘 보충할 수 있으니 남겨 둔다)
export function applyShields() {
  const r = R(); const c = db().challenge;
  if (!c || !r.shields) return 0;
  const missed = [];
  let d = addDays(today(), -2);
  while (diffDays(c.start, d) >= 0 && !keptDay(d)) { missed.push(d); d = addDays(d, -1); }
  // 앞에 이어 오던 연속 기록이 있을 때만, 그리고 방어권으로 다 메울 수 있을 때만 쓴다
  if (!missed.length || diffDays(c.start, d) < 0 || !keptDay(d) || missed.length > r.shields) return 0;
  for (const m of missed) r.shieldDays[m] = true;
  r.shields -= missed.length;
  r.lastShield = { date: today(), count: missed.length };
  save();
  return missed.length;
}

// ---------- 미니멈 데이 (일주일에 1번, 7분 버전으로 연속 기록 유지) ----------
export const miniUsedThisWeek = (date = today()) => Object.keys(R().miniDays).some((d) => weekKey(d) === weekKey(date));

// ---------- 복귀 ----------
export function isComeback(date = today()) {
  const logs = db().logs;
  const before = Object.keys(logs).filter((d) => logs[d].done && d < date);
  return before.length > 0 && !keptDay(addDays(date, -1));
}

// ---------- 정시 시작 ----------
export function onTime(startedAt) {
  const c = db().challenge; if (!c?.remindAt) return false;
  const [h, m] = c.remindAt.split(':').map(Number);
  const s = new Date(startedAt); const mins = s.getHours() * 60 + s.getMinutes();
  return mins >= h * 60 + m - 30 && mins <= h * 60 + m + 60;
}

// 운동을 끝까지 했을 때 받을 코인 예상치 (플레이어 안내용)
export function previewFull(date, mini = false) {
  const base = mini ? 50 : 100;
  const st = streak() + (keptDay(date) ? 0 : 1);
  return base * (isComeback(date) ? 2 : 1) + (mini ? 0 : 50) + (st >= 2 ? Math.min(st * 10, 100) : 0);
}

// ---------- 운동 보상 ----------
// res: 플레이어 결과 { full, ratio, resisted, startedAt }, 기록(log)은 이미 저장된 상태에서 부른다
export function awardWorkout(date, res, { mini = false, comeback = false } = {}) {
  const r = R();
  r.awarded ||= {};
  const before = levelOf(r.xp);
  const lines = [];
  const add = (label, coins, xp = coins) => { lines.push({ label, coins, xp }); grant(coins, xp, label, date); };
  const done = res.ratio >= 1 || mini;

  if (r.awarded[date] === 'full') {
    add('추가 운동', 0, 30);
  } else if (!done) {
    if (!r.awarded[date]) { add(`부분 완료 ${Math.round(res.ratio * 100)}%`, Math.round(100 * res.ratio)); r.awarded[date] = 'partial'; }
  } else {
    const base = mini ? 50 : 100;
    add(mini ? '미니 운동 완료' : '오늘 운동 완료', base);
    if (comeback) add('복귀 보너스 · 코인 2배', base, 0);
    if (res.full && !mini) add('끝까지 완주', 50);
    const st = streak();
    if (st >= 2) add(`${st}일 연속`, Math.min(st * 10, 100));
    if (onTime(res.startedAt)) add('정한 시간에 시작', 20, 10);
    r.awarded[date] = 'full';
    // 7일 연속마다 방어권
    if (st > 0 && st % 7 === 0 && !r.shieldEarned[date] && r.shields < MAX_SHIELDS) {
      r.shields++; r.shieldEarned[date] = true; lines.push({ label: '스트릭 방어권 +1', coins: 0, xp: 0, shield: true });
    }
  }
  const h = new Date(res.startedAt).getHours();
  const badges = checkBadges({ early: done && h < 7, night: done && h >= 22, comeback: done && comeback, resist: done && res.full && res.resisted });
  for (const b of badges) lines.push({ label: `새 배지 · ${b.name}`, coins: 30, xp: 30 }); // 코인은 checkBadges에서 이미 지급
  const after = levelOf(r.xp);
  save();
  return { lines, coins: lines.reduce((a, l) => a + l.coins, 0), xp: lines.reduce((a, l) => a + l.xp, 0), levelUp: after > before ? { from: before, to: after } : null, badges };
}

// ---------- 보상 카드 (운동 완료한 날 1장) ----------
export const canDrawCard = (date) => R().awarded?.[date] === 'full' && !R().cards[date];
export function drawCard(date) {
  const r = R();
  if (!canDrawCard(date)) return null;
  const x = Math.random();
  let card;
  if (x < 0.05) {
    card = Math.random() < 0.5 ? { tier: 'legend', coins: 200, label: '+200 코인' } : { tier: 'legend', coins: 120, shield: true, label: '+120 코인 · 방어권' };
  } else if (x < 0.30) {
    card = r.shields < MAX_SHIELDS && Math.random() < 0.4 ? { tier: 'rare', coins: 0, shield: true, label: '스트릭 방어권' } : { tier: 'rare', coins: 50, label: '+50 코인' };
  } else {
    const c = 10 + Math.floor(Math.random() * 5) * 5;
    card = { tier: 'common', coins: c, label: `+${c} 코인` };
  }
  if (card.shield) r.shields = Math.min(MAX_SHIELDS, r.shields + 1);
  grant(card.coins, 10, `보상 카드 (${card.tier === 'legend' ? '전설' : card.tier === 'rare' ? '희귀' : '일반'})`, date);
  r.cards[date] = card;
  card.badges = card.tier === 'legend' ? checkBadges({ lucky: true }) : [];
  save();
  return card;
}

// ---------- 주간 미션 ----------
const sumReps = (logs, ids) => logs.reduce((a, l) => a + ids.reduce((b, id) => b + (l.reps?.[id] || 0), 0), 0);
const MISSIONS = {
  days5: { label: '이번 주 5일 운동', target: 5, unit: '일', prog: (L) => L.filter((l) => l.done).length },
  full3: { label: '끝까지 완주 3번', target: 3, unit: '번', prog: (L) => L.filter((l) => l.full).length },
  squat200: { label: '스쿼트 누적 200회', target: 200, unit: '회', prog: (L) => sumReps(L, ['squat']) },
  jj300: { label: '점핑잭 누적 300회', target: 300, unit: '회', prog: (L) => sumReps(L, ['jumpingJack']) },
  push100: { label: '푸시업 누적 100회', target: 100, unit: '회', prog: (L) => sumReps(L, ['pushup', 'kneePushup']) },
  ontime3: { label: '정한 시간에 3번 시작', target: 3, unit: '번', prog: (L) => L.filter((l) => l.ontime).length },
  min60: { label: '운동 시간 60분', target: 60, unit: '분', prog: (L) => Math.floor(L.reduce((a, l) => a + (l.sec || 0), 0) / 60) },
  kcal500: { label: '500kcal 태우기', target: 500, unit: 'kcal', prog: (L) => L.reduce((a, l) => a + (l.kcal || 0), 0) },
};
export function weeklyMissions(date = today()) {
  const wk = weekKey(date);
  const seed = [...wk].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rest = Object.keys(MISSIONS).filter((k) => k !== 'days5');
  const a = rest[seed % rest.length];
  const rest2 = rest.filter((k) => k !== a);
  const b = rest2[Math.floor(seed / 7) % rest2.length];
  const logs = [];
  for (let i = 0; i < 7; i++) { const l = db().logs[addDays(wk, i)]; if (l) logs.push(l); }
  const list = ['days5', a, b].map((k) => {
    const m = MISSIONS[k]; const v = m.prog(logs);
    return { id: k, label: m.label, unit: m.unit, target: m.target, value: Math.min(v, m.target), done: v >= m.target };
  });
  return { week: wk, list, allDone: list.every((m) => m.done), claimed: !!R().weeklyClaimed[wk] };
}
export function claimWeekly(date = today()) {
  const r = R(); const w = weeklyMissions(date);
  if (!w.allDone || w.claimed) return null;
  r.weeklyClaimed[w.week] = true;
  grant(200, 100, '주간 미션 달성');
  const shield = r.shields < MAX_SHIELDS;
  if (shield) r.shields++;
  const badges = checkBadges();
  save();
  return { coins: 200, xp: 100, shield, badges };
}

// ---------- 최고 기록 도전 ----------
export const PR_EXERCISES = ['squat', 'pushup', 'kneePushup', 'jumpingJack', 'plank'];
export function recordPR(id, value) {
  const r = R(); const prev = r.pr[id] || 0;
  if (value <= prev) { save(); return { improved: false, prev, value }; }
  r.pr[id] = value;
  grant(prev ? 50 : 20, 50, `최고 기록 ${prev ? '경신' : '등록'}`);
  const badges = prev ? checkBadges({ pr: true }) : checkBadges();
  save();
  return { improved: true, prev, value, coins: prev ? 50 : 20, badges };
}

// ---------- 현실 보상 쿠폰 ----------
export function saveCoupon({ id, name, cost }) {
  const r = R(); cost = Math.max(10, Math.round(Number(cost) || 0)); name = String(name || '').trim().slice(0, 40);
  if (!name) return;
  const ex = r.coupons.find((c) => c.id === id);
  if (ex) Object.assign(ex, { name, cost }); else r.coupons.push({ id: 'c' + Date.now().toString(36), name, cost });
  save();
}
export function removeCoupon(id) { const r = R(); r.coupons = r.coupons.filter((c) => c.id !== id); save(); }
export function redeem(id) {
  const r = R(); const c = r.coupons.find((x) => x.id === id);
  if (!c || r.coins < c.cost) return null;
  r.coins -= c.cost;
  r.ledger.unshift({ at: Date.now(), date: today(), coins: -c.cost, xp: 0, note: `보상 교환 · ${c.name}` });
  const item = { id: 'r' + Date.now().toString(36), name: c.name, cost: c.cost, at: Date.now(), used: false };
  r.redeemed.unshift(item);
  const badges = checkBadges({ coupon: true });
  save();
  return { item, badges };
}
export function toggleUsed(rid) { const it = R().redeemed.find((x) => x.id === rid); if (it) { it.used = !it.used; save(); } }

// ---------- 몸 사진 ----------
export function notePhoto(date) {
  const r = R(); const first = !Object.keys(r.photos).length;
  const weekHad = Object.keys(r.photos).some((d) => weekKey(d) === weekKey(date));
  r.photos[date] = true;
  if (!weekHad) grant(30, 20, '이번 주 몸 사진 기록', date);
  const badges = checkBadges({ photo: first });
  save();
  return { coins: weekHad ? 0 : 30, badges };
}

// ---------- 배지 ----------
export const BADGES = [
  { id: 'first', name: '첫걸음', desc: '첫 운동 완료' },
  { id: 'streak3', name: '3일 연속', desc: '3일 연속 운동' },
  { id: 'streak7', name: '일주일', desc: '7일 연속 운동' },
  { id: 'streak14', name: '2주 연속', desc: '14일 연속 운동' },
  { id: 'streak21', name: '습관 완성', desc: '21일 연속 운동' },
  { id: 'streak30', name: '30일 연속', desc: '30일 연속 운동' },
  { id: 'days10', name: '누적 10일', desc: '운동한 날이 10일' },
  { id: 'days30', name: '누적 30일', desc: '운동한 날이 30일' },
  { id: 'full10', name: '완주 10번', desc: '건너뛴 세트 없이 10번 완주' },
  { id: 'weekly1', name: '미션 클리어', desc: '주간 미션 첫 달성' },
  { id: 'weekly4', name: '미션 마스터', desc: '주간 미션 4번 달성' },
  { id: 'level5', name: '챌린저', desc: '레벨 5 달성' },
  { id: 'level10', name: '애슬릿', desc: '레벨 10 달성' },
  { id: 'pr', name: '기록 경신', desc: '최고 기록 도전에서 기록 경신' },
  { id: 'coupon', name: '첫 보상', desc: '현실 보상 첫 교환' },
  { id: 'photo', name: '첫 기록 사진', desc: '몸 사진 첫 기록' },
  { id: 'comeback', name: '다시 시작', desc: '쉬었다가 돌아와 운동' },
  { id: 'early', name: '얼리버드', desc: '오전 7시 전에 운동', hidden: true },
  { id: 'night', name: '올빼미', desc: '밤 10시 이후에 운동', hidden: true },
  { id: 'resist', name: '포기하지 않은 날', desc: '그만두려다 마음을 바꿔 끝까지 완주', hidden: true },
  { id: 'lucky', name: '행운의 카드', desc: '전설 보상 카드 뽑기', hidden: true },
];

export function checkBadges(ev = {}) {
  const r = R(); const logs = db().logs;
  const doneDays = Object.values(logs).filter((l) => l.done).length;
  const fullCount = Object.values(logs).filter((l) => l.full).length;
  const st = streak(); const lv = levelOf(r.xp); const wk = Object.keys(r.weeklyClaimed).length;
  const cond = {
    first: doneDays >= 1, streak3: st >= 3, streak7: st >= 7, streak14: st >= 14, streak21: st >= 21, streak30: st >= 30,
    days10: doneDays >= 10, days30: doneDays >= 30, full10: fullCount >= 10, weekly1: wk >= 1, weekly4: wk >= 4,
    level5: lv >= 5, level10: lv >= 10, pr: ev.pr, coupon: ev.coupon, photo: ev.photo, comeback: ev.comeback,
    early: ev.early, night: ev.night, resist: ev.resist, lucky: ev.lucky,
  };
  const got = [];
  for (const b of BADGES) {
    if (cond[b.id] && !r.badges[b.id]) { r.badges[b.id] = today(); got.push(b); grant(30, 30, `배지 · ${b.name}`); }
  }
  return got;
}

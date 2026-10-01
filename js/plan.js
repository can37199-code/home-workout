// 날짜별 루틴 생성: A 하체 → B 상체·코어 → C 전신 유산소 → (반복) → 7일째 가벼운 회복 데이
import { EXERCISES } from './exercises.js';

export const LEVELS = {
  easy: { label: '입문', sets: 2, mult: 0.7, rest: 40 },
  normal: { label: '중급', sets: 3, mult: 1, rest: 30 },
  hard: { label: '상급', sets: 3, mult: 1.4, rest: 25 },
};

// 기본 횟수(반복) 또는 초(hold)
const BASE = {
  squat: 15, lunge: 10, gluteBridge: 15, jumpingJack: 20, pushup: 10, kneePushup: 10,
  plank: 30, crunch: 15, legRaise: 10, highKnees: 16, mountainClimber: 12, burpee: 6,
};

const TEMPLATES = {
  A: { title: '하체 집중', emoji: '🦵', items: ['squat', 'lunge', 'gluteBridge', 'jumpingJack'] },
  B: { title: '상체·코어', emoji: '💪', items: ['pushup', 'plank', 'crunch', 'legRaise'] },
  C: { title: '전신 유산소', emoji: '🔥', items: ['jumpingJack', 'highKnees', 'mountainClimber', 'squat', 'burpee'] },
  R: { title: '가벼운 회복', emoji: '🌿', items: ['gluteBridge', 'plank', 'crunch'] },
};
const CYCLE = ['A', 'B', 'C', 'A', 'B', 'C', 'R'];

export function dayPlan(challenge, index) {
  const lv = LEVELS[challenge.level] || LEVELS.normal;
  const key = CYCLE[index % 7];
  const tpl = TEMPLATES[key];
  const grow = 1 + Math.min(0.08 * Math.floor(index / 7), 0.6);
  const items = tpl.items.map((id) => {
    if (id === 'pushup' && challenge.level === 'easy') id = 'kneePushup';
    const ex = EXERCISES[id];
    let n = BASE[id] * lv.mult * grow * (key === 'R' ? 0.8 : 1);
    n = ex.type === 'hold' ? Math.round(n / 5) * 5 : Math.max(3, Math.round(n));
    return { id, sets: key === 'R' ? 1 : lv.sets, target: n };
  });
  return { key, title: tpl.title, emoji: tpl.emoji, rest: lv.rest, items };
}

export function estimateSec(plan, tempo = {}) {
  let s = 0, sets = 0;
  for (const it of plan.items) {
    const ex = EXERCISES[it.id];
    const per = ex.type === 'hold' ? it.target : it.target * ex.base / (tempo[it.id] || 1);
    s += per * it.sets + 8; sets += it.sets;
  }
  return s + (sets - 1) * plan.rest;
}

// 소모 칼로리 = MET × 3.5 × 체중(kg) / 200 × 분
export const kcalFor = (met, kg, sec) => (met * 3.5 * kg / 200) * (sec / 60);

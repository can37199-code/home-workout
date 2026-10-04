// 날짜별 루틴 생성: A 하체 → B 상체·코어 → C 전신 유산소 → (반복) → 7일째 가벼운 회복 데이
import { EXERCISES } from './exercises.js';
import { repSec } from './media.js';

// 세트 길이를 "횟수"가 아니라 "운동 시간"으로 맞춘다. 영상이 1배속이라 동작마다 1회 시간이 달라서,
// 같은 시간 동안 할 수 있는 횟수를 목표로 준다 (버피처럼 긴 동작은 적게, 하이니처럼 짧은 동작은 많이).
export const LEVELS = {
  easy: { label: '입문', sets: 2, work: 30, rest: 40 },
  normal: { label: '중급', sets: 3, work: 40, rest: 30 },
  hard: { label: '상급', sets: 3, work: 50, rest: 25 },
};

// 운동량 자동 조절 범위 (컨디션·완주 여부로 바뀜)
export const ADAPT_MIN = 0.7, ADAPT_MAX = 1.4;

const TEMPLATES = {
  A: { title: '하체 집중', tag: 'Lower', items: ['squat', 'lunge', 'gluteBridge', 'jumpingJack'] },
  B: { title: '상체·코어', tag: 'Upper · Core', items: ['pushup', 'plank', 'crunch', 'legRaise'] },
  C: { title: '전신 유산소', tag: 'Cardio', items: ['jumpingJack', 'highKnees', 'mountainClimber', 'squat', 'burpee'] },
  R: { title: '가벼운 회복', tag: 'Recovery', items: ['gluteBridge', 'plank', 'crunch'] },
};
const CYCLE = ['A', 'B', 'C', 'A', 'B', 'C', 'R'];

// 목표 시간(초) → 그 동작의 목표 횟수(또는 버티기 초)
export function targetFor(ex, sec) {
  if (ex.type === 'hold') return Math.max(15, Math.round(sec / 5) * 5);
  let n = Math.max(3, Math.round(sec / repSec(ex)));
  if (ex.sides && n % 2) n++; // 좌우 똑같이 하도록 짝수로
  return n;
}

export function dayPlan(challenge, index) {
  const lv = LEVELS[challenge.level] || LEVELS.normal;
  const key = CYCLE[index % 7];
  const tpl = TEMPLATES[key];
  const grow = 1 + Math.min(0.08 * Math.floor(index / 7), 0.6); // 매주 8%씩, 최대 60%
  const adapt = challenge.adapt || 1;
  const sec = lv.work * grow * adapt * (key === 'R' ? 0.8 : 1);
  const items = tpl.items.map((id) => {
    if (id === 'pushup' && challenge.level === 'easy') id = 'kneePushup';
    return { id, sets: key === 'R' ? 1 : lv.sets, target: targetFor(EXERCISES[id], sec), sec: Math.round(sec) };
  });
  return { key, title: tpl.title, tag: tpl.tag, rest: lv.rest, items, adapt };
}

export function estimateSec(plan) {
  let s = 0, sets = 0;
  for (const it of plan.items) {
    const ex = EXERCISES[it.id];
    const per = ex.type === 'hold' ? it.target : it.target * repSec(ex);
    s += per * it.sets + 8; sets += it.sets;
  }
  return s + (sets - 1) * plan.rest;
}

// 소모 칼로리 = MET × 3.5 × 체중(kg) / 200 × 분
export const kcalFor = (met, kg, sec) => (met * 3.5 * kg / 200) * (sec / 60);

// 미니멈 데이: 오늘 루틴의 앞 3개 동작을 1세트씩, 횟수 60%로 (약 7분)
export function miniPlan(plan) {
  const items = plan.items.slice(0, 3).map((it) => {
    const ex = EXERCISES[it.id];
    return { ...it, sets: 1, target: targetFor(ex, (it.sec || 30) * 0.6) };
  });
  return { ...plan, title: '7분 미니 운동', tag: 'Mini', rest: 20, items, mini: true };
}

// 최고 기록 도전: 한 동작을 할 수 있는 만큼 1세트
export function challengePlan(id) {
  return { key: 'PR', title: '최고 기록 도전', tag: 'Challenge', rest: 0, items: [{ id, sets: 1, target: Infinity }] };
}

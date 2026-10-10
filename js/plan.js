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

// 프로그램: 7일 주기(1·2·3·1·2·3·회복). 날짜별 루틴은 key로 고른다.
export const PROGRAMS = {
  diet30: { name: '30일 다이어트 입문', days: 30, desc: '하체·상체·유산소를 번갈아 하는 기본 프로그램',
    T: {
      A: { title: '하체 집중', tag: '하체', items: ['squat', 'lunge', 'gluteBridge', 'jumpingJack'] },
      B: { title: '상체·코어', tag: '상체·코어', items: ['pushup', 'plank', 'crunch', 'legRaise'] },
      C: { title: '전신 유산소', tag: '유산소', items: ['jumpingJack', 'highKnees', 'mountainClimber', 'squat', 'burpee'] },
      R: { title: '가벼운 회복', tag: '회복', items: ['catCow', 'birdDog', 'gluteBridge', 'plank'] },
    } },
  lower21: { name: '21일 하체 라인', days: 21, desc: '엉덩이와 허벅지 라인을 집중해서',
    T: {
      A: { title: '엉덩이 집중', tag: '엉덩이', items: ['sumoSquat', 'donkeyKick', 'gluteBridge', 'curtsyLunge'] },
      B: { title: '허벅지 라인', tag: '허벅지', items: ['squat', 'sideLunge', 'lunge', 'calfRaise'] },
      C: { title: '하체 유산소', tag: '유산소', items: ['jumpingJack', 'sumoSquat', 'highKnees', 'curtsyLunge'] },
      R: { title: '가벼운 회복', tag: '회복', items: ['catCow', 'birdDog', 'gluteBridge', 'calfRaise'] },
    } },
  core14: { name: '14일 복부 집중', days: 14, desc: '윗배·아랫배·옆구리를 매일 조금씩',
    T: {
      A: { title: '윗배', tag: '윗배', items: ['crunch', 'bicycleCrunch', 'shoulderTap', 'plank'] },
      B: { title: '아랫배·옆구리', tag: '아랫배', items: ['legRaise', 'flutterKick', 'russianTwist', 'sidePlank'] },
      C: { title: '코어 유산소', tag: '유산소', items: ['mountainClimber', 'bicycleCrunch', 'deadBug', 'jumpingJack'] },
      R: { title: '가벼운 회복', tag: '회복', items: ['catCow', 'birdDog', 'deadBug'] },
    } },
};
const CYCLE = ['A', 'B', 'C', 'A', 'B', 'C', 'R'];
export const programOf = (challenge) => PROGRAMS[challenge?.program] || PROGRAMS.diet30;
export const planTitleAt = (challenge, index) => programOf(challenge).T[CYCLE[((index % 7) + 7) % 7]].title;

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
  const tpl = programOf(challenge).T[key];
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
  return { ...plan, title: '7분 미니 운동', tag: '미니', rest: 20, items, mini: true };
}

// 최고 기록 도전: 한 동작을 할 수 있는 만큼 1세트
export function challengePlan(id) {
  return { key: 'PR', title: '최고 기록 도전', tag: '도전', rest: 0, items: [{ id, sets: 1, target: Infinity }] };
}

import { EXERCISES } from './exercises.js';
import { MEDIA } from './media.js';
import { Avatar } from './avatar.js';
import { LEVELS, dayPlan, estimateSec, miniPlan, challengePlan } from './plan.js';
import { runWorkout } from './player.js';
import { ask, notify } from './ui.js';
import { music, STYLES } from './music.js';
import { saveBlob, loadBlob } from './idb.js';
import { icon } from './icons.js';
import * as RW from './rewards.js';
import { PUSH_HOUR, pushSupported, currentSubscription, enablePush, disablePush, showNow } from './push.js';
import {
  db, save, replaceAll, resetAll, today, addDays, diffDays, parse, fmt, dayIndex, streak, bestStreak, latestWeight,
} from './store.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const CONDITIONS = { hard: '힘들었어요', ok: '적당했어요', easy: '가뿐했어요' };
const CHEERS = [
  '어제보다 한 번만 더.', '시작하면 절반은 끝난 거예요.', '작은 반복이 몸을 바꿔요.',
  '오늘 쌓은 만큼 내일이 가벼워져요.', '10분이라도 0분보다 훨씬 나아요.', '꾸준함이 결국 이겨요.',
];
const dateLabel = (s) => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`; };
const dateShort = (s) => { const d = parse(s); return `${d.getMonth() + 1}.${d.getDate()}`; };
const stamp = (s) => { const d = parse(s); return `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')} · ${DOW[d.getDay()]}`; };
const minText = (sec) => `${Math.max(1, Math.round(sec / 60))}분`;
const pad2 = (n) => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let thumbs = [];
function clearThumbs() { thumbs.forEach((a) => a.destroy()); thumbs = []; }
function drawThumbs(scope = app) {
  scope.querySelectorAll('canvas[data-ex]').forEach((cv) => {
    const a = new Avatar(cv);
    const ex = EXERCISES[cv.dataset.ex];
    a.setExercise(ex);
    a.draw(ex.view === 'front' ? 0.5 : ex.type === 'hold' ? 0 : 0.5);
    thumbs.push(a);
  });
}

const thumb = (id) => (MEDIA[id] ? `<img src="${MEDIA[id].poster}" alt="" loading="lazy">` : `<canvas data-ex="${id}"></canvas>`);

function itemList(plan) {
  return `<ul class="ex-list">${plan.items.map((it) => {
    const ex = EXERCISES[it.id];
    const amt = ex.type === 'hold' ? `${it.target}<small>초 · ${it.sets}세트</small>` : `${it.sets}×${it.target}<small>세트 × 회</small>`;
    return `<li>${thumb(it.id)}<div><b>${ex.name}</b><span class="sub">${ex.unit || ex.tips[0]}</span></div><span class="amt">${amt}</span></li>`;
  }).join('')}</ul>`;
}

function challengeDays(c) {
  return Object.entries(db().logs).filter(([d, l]) => l.done && diffDays(c.start, d) >= 0 && diffDays(c.start, d) < c.days).length;
}

// ---------- 화면 전환 ----------
function go(view, arg) {
  clearThumbs();
  music.stop();
  window.scrollTo(0, 0);
  const c = db().challenge;
  if (!c && view !== 'setup') view = 'setup';
  nav.classList.toggle('hidden', view === 'setup' || view === 'player' || view === 'finish');
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.go === view));
  ({ setup, home, calendar, rewards, stats, settings, player, finish })[view](arg);
}
nav.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

// ---------- 챌린지 설정 ----------
function setup() {
  const c = db().challenge;
  app.innerHTML = `
  <section class="page setup">
    <div class="setup-hero">
      <span class="eyebrow">Home Training Challenge</span>
      <div class="display">${c ? 'Edit<br>Plan' : 'Every<br>Day<em>.</em>'}</div>
      <p class="muted">기간을 정하고 하루도 빠짐없이 해 봐요. 기록은 이 폰에만 저장돼요.</p>
    </div>
    <form id="f" class="form">
      <div class="field">
        <label>챌린지 기간</label>
        <div class="chips" id="days">
          ${[14, 30, 60].map((d) => `<button type="button" data-v="${d}" class="${(c?.days || 30) === d ? 'on' : ''}">${d}일</button>`).join('')}
          <input type="number" min="7" max="180" placeholder="직접" id="daysIn" value="${c && ![14, 30, 60].includes(c.days) ? c.days : ''}" aria-label="기간 직접 입력">
        </div>
      </div>
      <div class="field"><label for="start">시작일</label><input type="date" id="start" value="${c?.start || today()}"></div>
      <div class="field">
        <label>운동 수준</label>
        <div class="seg wide" id="level">
          ${Object.entries(LEVELS).map(([k, v]) => `<button type="button" data-v="${k}" class="${(c?.level || 'easy') === k ? 'on' : ''}">${v.label}</button>`).join('')}
        </div>
        <p class="hint">입문은 2세트와 무릎 푸시업, 중급은 3세트, 상급은 3세트에 횟수 1.4배예요. 매주 횟수가 조금씩 늘어나요.</p>
      </div>
      <div class="field two">
        <div><label for="w0">현재 체중 kg</label><input type="number" step="0.1" id="w0" inputmode="decimal" value="${c?.startWeight || ''}" placeholder="68.5"></div>
        <div><label for="w1">목표 체중 kg</label><input type="number" step="0.1" id="w1" inputmode="decimal" value="${c?.goalWeight || ''}" placeholder="62.0"></div>
      </div>
      <div class="field"><label for="remind">매일 운동할 시간</label><input type="time" id="remind" value="${c?.remindAt || '20:00'}"></div>
      <button class="btn primary big" type="submit"><span>${c ? '저장하기' : '챌린지 시작하기'}</span>${icon('arrow')}</button>
      ${c ? '<button class="btn" type="button" id="cancel">취소</button>' : ''}
    </form>
  </section>`;
  const pick = (id) => app.querySelector(`#${id}`).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    app.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle('on', x === b));
    if (id === 'days') app.querySelector('#daysIn').value = '';
  });
  pick('days'); pick('level');
  app.querySelector('#daysIn').addEventListener('input', () => app.querySelectorAll('#days button').forEach((x) => x.classList.remove('on')));
  app.querySelector('#cancel')?.addEventListener('click', () => go('settings'));
  app.querySelector('#f').addEventListener('submit', (e) => {
    e.preventDefault();
    const days = Number(app.querySelector('#daysIn').value) || Number(app.querySelector('#days .on')?.dataset.v) || 30;
    const w0 = Number(app.querySelector('#w0').value) || null;
    const start = app.querySelector('#start').value || today();
    db().challenge = {
      start, days: clamp(days, 7, 180),
      level: app.querySelector('#level .on')?.dataset.v || 'easy',
      startWeight: w0, goalWeight: Number(app.querySelector('#w1').value) || null,
      remindAt: app.querySelector('#remind').value || '20:00',
    };
    if (w0 && !db().weights[start]) db().weights[start] = w0;
    save(); go('home');
  });
}

// ---------- 홈 ----------
function ticks(c, t) {
  let html = '';
  for (let k = 0; k < c.days; k++) {
    const d = addDays(c.start, k);
    const l = db().logs[d];
    let cls = l?.done ? 'done' : l?.partial ? 'partial' : diffDays(d, t) > 0 ? 'missed' : '';
    if (d === t) cls += ' today';
    html += `<i class="${cls}"></i>`;
  }
  return `<div class="ticks" aria-hidden="true">${html}</div>`;
}

// 홈 상단: 레벨·코인·방어권
function statusBar() {
  const L = RW.levelInfo(); const r = db().rewards;
  return `<button class="status" data-go-to="rewards" aria-label="보상 보기">
    <span class="lv"><b>Lv.${L.lv}</b> ${L.title}</span>
    <span class="xpbar"><i style="width:${Math.round(L.pct * 100)}%"></i></span>
    <span class="coins">${icon('coin')}<b class="num">${r.coins.toLocaleString()}</b></span>
    <span class="shields" title="스트릭 방어권">${icon('shield')}<b class="num">${r.shields}</b></span>
  </button>`;
}

function missionsBlock(compact = true) {
  const w = RW.weeklyMissions();
  return `<div class="block">
    <div class="block-head"><h2>이번 주 미션</h2><span class="muted small">${w.claimed ? '보상 받음' : w.allDone ? '보상을 받으세요' : '3개 모두 하면 +200 코인 · 방어권'}</span></div>
    <ul class="missions">${w.list.map((m) => `<li class="${m.done ? 'done' : ''}">
      <span class="m-label">${m.done ? icon('check') : ''}${m.label}</span>
      <span class="num">${m.value.toLocaleString()}<small> / ${m.target.toLocaleString()}${m.unit}</small></span>
      <span class="bar"><i style="width:${(m.value / m.target) * 100}%"></i></span></li>`).join('')}</ul>
    ${w.allDone && !w.claimed ? `<button class="btn primary big" data-act="claim"><span>주간 보상 받기</span>${icon('gift')}</button>` : ''}
  </div>`;
}

async function claimWeeklyUI() {
  const res = RW.claimWeekly();
  if (!res) return;
  await notify(`코인 +${res.coins}, XP +${res.xp}${res.shield ? ', 스트릭 방어권 +1' : ''}${res.badges.length ? `
새 배지: ${res.badges.map((b) => b.name).join(', ')}` : ''}`, '주간 미션 달성');
}

function home() {
  const c = db().challenge;
  const t = today();
  const usedShields = RW.applyShields();
  const i = dayIndex(t);
  const st = streak();
  const doneCount = challengeDays(c);
  const end = addDays(c.start, c.days - 1);
  let body = '';

  if (i == null && diffDays(t, c.start) > 0) {
    body = `
    <div class="today">
      <span class="eyebrow">시작까지</span>
      <div class="day-big"><span class="d">D-${diffDays(t, c.start)}</span></div>
      <p class="muted">${dateLabel(c.start)}에 Day 1이 시작돼요. 동작을 미리 익혀 두세요.</p>
    </div>
    <div class="block"><div class="block-head"><h2>Day 1 루틴</h2></div>${itemList(dayPlan(c, 0))}</div>`;
  } else if (i == null) {
    body = `
    <div class="today">
      <span class="eyebrow">Challenge Complete</span>
      <div class="day-big"><span class="d">${doneCount}</span><span class="of">/ ${c.days}일</span></div>
      <p>${c.days}일 챌린지를 마쳤어요. 최고 연속 기록은 ${bestStreak()}일이에요.</p>
      ${ticks(c, t)}
      <button class="btn primary big" data-act="new"><span>새 챌린지 시작하기</span>${icon('arrow')}</button>
    </div>`;
  } else {
    const plan = dayPlan(c, i);
    const log = db().logs[t];
    const y = addDays(t, -1);
    const yi = dayIndex(y);
    const missedY = yi != null && !db().logs[y]?.done;
    const next = i + 1 < c.days ? dayPlan(c, i + 1) : null;
    const comeback = !log?.done && RW.isComeback(t);
    const miniLeft = !log?.done && !RW.miniUsedThisWeek(t);
    const isChallengeDay = plan.key === 'R';
    const photoDay = [0, 6, 13, 29, c.days - 1].includes(i) && !db().rewards.photos[t];
    const preview = RW.previewFull(t);
    body = `
    <div class="today">
      <div class="today-top">
        <span class="eyebrow">${stamp(t)}</span>
        <span class="streak"><span class="num">${st}</span>일 연속</span>
      </div>
      <div class="day-big"><span class="d">${pad2(i + 1)}</span><span class="of">/ ${c.days}</span></div>
      ${ticks(c, t)}
      <div class="ticks-legend"><span>DAY 1 · ${dateShort(c.start)}</span><span>${doneCount}일 완료</span><span>DAY ${c.days} · ${dateShort(end)}</span></div>
    </div>

    <div class="plan-title">
      <span><span class="tag">${plan.tag}</span></span>
      <h2>${plan.title}</h2>
      <div class="plan-meta"><span>${plan.items.length}개 동작</span><span class="dot"></span><span>약 ${minText(estimateSec(plan, db().prefs.tempo))}</span></div>
      ${log?.done
        ? `<p class="done-line">${icon('check')} 오늘 운동을 마쳤어요 · ${minText(log.sec)} · ${log.kcal}kcal</p>
           <button class="btn ghost big" data-act="start" data-date="${t}"><span>한 번 더 하기</span>${icon('arrow')}</button>`
        : `<p class="cheer">${comeback ? '다시 왔네요. 오늘 끝내면 기본 코인이 2배예요.' : CHEERS[i % CHEERS.length]}</p>
           <button class="btn primary big" data-act="start" data-date="${t}"><span>${log?.partial ? '이어서 다시 하기' : '오늘 운동 시작'}</span><span class="btn-reward">${icon('coin')}+${preview}</span></button>
           ${miniLeft ? `<button class="btn link-btn" data-act="mini" data-date="${t}">컨디션이 안 좋다면 7분 미니 운동으로 연속 기록 지키기 · 이번 주 1번 남음</button>` : ''}`}
    </div>

    ${usedShields ? `<div class="note good"><b>스트릭 방어권 ${usedShields}개를 썼어요</b><p class="muted">놓친 날을 메워서 연속 기록이 이어져요. 남은 방어권 ${db().rewards.shields}개.</p></div>` : ''}
    ${photoDay ? `<div class="note"><b>오늘은 몸 사진 찍는 날 · Day ${i + 1}</b><p class="muted">같은 자리, 같은 각도로 찍어 두면 변화 리포트에서 Day 1과 나란히 비교해 줘요.</p>
      <button class="btn ghost" data-go-to="rewards" data-anchor="report">${icon('camera')} 사진 기록하러 가기</button></div>` : ''}

    ${missedY ? `<div class="note"><b>어제 Day ${yi + 1}을 놓쳤어요</b><p class="muted">오늘 안에 보충하면 연속 기록이 이어져요.</p>
      <button class="btn ghost" data-act="start" data-date="${y}">어제 운동 보충하기</button></div>` : ''}

    ${missionsBlock()}

    ${isChallengeDay ? `<div class="note good"><b>오늘은 도전 데이</b><p class="muted">가벼운 회복 루틴을 끝내고, 한 동작으로 최고 기록에 도전해 보세요. 기록을 깨면 +50 코인.</p>
      <button class="btn ghost" data-go-to="rewards" data-anchor="pr">${icon('trophy')} 최고 기록 도전하기</button></div>` : ''}

    <div class="block">
      <div class="block-head"><h2>오늘의 루틴</h2><span class="muted small">세트 사이 휴식 ${plan.rest}초</span></div>
      ${itemList(plan)}
      ${next ? `<div class="next-day"><span>내일 · Day ${i + 2}</span><b>${next.title}</b></div>` : ''}
    </div>`;
  }

  app.innerHTML = `<section class="page"><header class="page-head"><span class="eyebrow">오늘홈트</span>${installBtn()}</header>${statusBar()}${body}</section>`;
  drawThumbs();
  bindInstall();
  bindCommon(home);
  app.querySelectorAll('[data-act="start"]').forEach((b) => b.addEventListener('click', () => go('player', { date: b.dataset.date })));
  app.querySelector('[data-act="mini"]')?.addEventListener('click', (e) => go('player', { date: e.currentTarget.dataset.date, mini: true }));
  app.querySelector('[data-act="new"]')?.addEventListener('click', () => { db().challenge = null; save(); go('setup'); });
}

// ---------- 플레이어 / 완료 ----------
function player(arg) {
  if (typeof arg === 'string') arg = { date: arg };
  if (arg.pr) return prRun(arg.pr);
  const { date, mini = false } = arg;
  const c = db().challenge;
  const i = dayIndex(date);
  if (i == null) return go('home');
  const plan = mini ? miniPlan(dayPlan(c, i)) : dayPlan(c, i);
  const comeback = RW.isComeback(date);
  const already = db().rewards.awarded?.[date] === 'full';
  runWorkout(app, {
    plan,
    bonus: already ? '' : `끝까지 하면 +${RW.previewFull(date, mini)} 코인`,
    onFinish: (r) => {
      const prev = db().logs[date];
      saveLog(date, r, true, { full: r.full || !!prev?.full, ontime: RW.onTime(r.startedAt) || !!prev?.ontime, mini: mini && !prev?.done });
      if (mini) { db().rewards.miniDays[date] = true; save(); }
      const award = RW.awardWorkout(date, r, { mini, comeback });
      go('finish', { date, r, award });
    },
    onExit: (r) => {
      saveLog(date, r, false);
      const award = RW.awardWorkout(date, r);
      go('home');
      if (award.coins) toast(`부분 완료로 기록했어요 · 코인 +${award.coins}`);
    },
  });
}

function prRun(id) {
  const best = db().rewards.pr[id] || 0;
  const unit = EXERCISES[id].type === 'hold' ? '초' : '회';
  const done = (r) => {
    const res = RW.recordPR(id, r.record || 0);
    go('rewards', 'pr');
    if (res.improved) {
      const extra = res.badges?.length ? `\n새 배지: ${res.badges.map((x) => x.name).join(', ')}` : '';
      notify(`${EXERCISES[id].name} ${res.value}${unit}${res.prev ? ` (이전 ${res.prev}${unit})` : ''} · 코인 +${res.coins}${extra}`, res.prev ? '최고 기록 경신!' : '첫 기록 등록');
    } else if (r.record) {
      notify(`이번 기록 ${res.value}${unit} · 최고 기록 ${res.prev}${unit}까지 ${res.prev - res.value + 1}${unit} 남았어요.`, '아깝게 못 깼어요');
    }
  };
  runWorkout(app, { plan: challengePlan(id), open: true, best, onFinish: done, onExit: done });
}

function saveLog(date, r, done, extra = {}) {
  const prev = db().logs[date];
  if (prev?.done && !done) return; // 이미 완료한 날은 부분 기록으로 덮어쓰지 않음
  const reps = { ...prev?.reps };
  for (const [k, v] of Object.entries(r.reps)) reps[k] = (reps[k] || 0) + v;
  db().logs[date] = {
    ...prev, done: done || !!prev?.done, partial: !done && !prev?.done,
    sec: (prev?.sec || 0) + r.sec, kcal: (prev?.kcal || 0) + r.kcal, reps, at: Date.now(), ...extra,
  };
  save();
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

function finish({ date, r, award }) {
  const st = streak();
  const total = Object.values(r.reps).reduce((a, b) => a + b, 0);
  const L = RW.levelInfo();
  const milestone = [3, 7, 14, 21, 30, 50, 60, 100].includes(st) ? `<span class="milestone">${icon('flame')} ${st}일 연속 달성</span>` : '';
  const cardOpen = RW.canDrawCard(date);
  const earnLines = award.lines.map((l) => `<li><span>${l.shield ? icon('shield') : ''}${l.label}</span><b class="num">${l.coins ? '+' + l.coins : l.shield ? '+1' : ''}</b></li>`).join('');
  const badgeHtml = award.badges.map((b) => `<span class="badge got">${icon('trophy')}<b>${b.name}</b><small>${b.desc}</small></span>`).join('');
  app.innerHTML = `
  <section class="page finish">
    <div class="finish-hero rise">
      <span class="eyebrow">${stamp(date)}</span>
      <div class="display">Day ${pad2(dayIndex(date) + 1)}<em>Done</em></div>
      ${milestone}
    </div>
    <div class="stat-grid rise">
      <div><b>${Math.max(1, Math.round(r.sec / 60))}<small>분</small></b><span>운동 시간</span></div>
      <div><b>${r.kcal}<small>kcal</small></b><span>소모 칼로리</span></div>
      <div><b>${total}</b><span>총 횟수</span></div>
      <div><b>${st}<small>일</small></b><span>연속 기록</span></div>
    </div>

    <div class="block rise">
      <div class="block-head"><h2>오늘 받은 보상</h2><span class="num earn">${icon('coin')} +${award.coins}</span></div>
      <ul class="earn-list">${earnLines}</ul>
      <div class="lvline"><span><b>Lv.${L.lv}</b> ${L.title}</span><span class="xpbar"><i style="width:${Math.round(L.pct * 100)}%"></i></span><span class="muted small num">${L.into} / ${L.need} XP</span></div>
      ${award.levelUp ? `<p class="levelup">레벨 업! Lv.${award.levelUp.from} → Lv.${award.levelUp.to} · ${L.titleKo}</p>` : ''}
      ${badgeHtml ? `<div class="new-badges">${badgeHtml}</div>` : ''}
    </div>

    ${cardOpen ? `<div class="block" id="cardBlock">
      <div class="block-head"><h2>보상 카드</h2><span class="muted small">한 장을 골라 뒤집으세요</span></div>
      <div class="cards">${[0, 1, 2].map((k) => `<button class="card-flip" data-card="${k}" aria-label="카드 ${k + 1}"><span class="back">${icon('gift')}</span><span class="front"></span></button>`).join('')}</div>
      <p class="muted small center" id="cardMsg">일반 70% · 희귀 25% · 전설 5%</p>
    </div>` : ''}

    <form id="f" class="form">
      <div class="field">
        <label>오늘 컨디션</label>
        <div class="seg wide" id="cond">${Object.entries(CONDITIONS).map(([k, v]) => `<button type="button" data-v="${k}">${v}</button>`).join('')}</div>
      </div>
      <div class="field"><label for="w">오늘 체중 kg · 선택</label><input type="number" step="0.1" inputmode="decimal" id="w" placeholder="kg" value="${db().weights[date] || ''}"></div>
      <div class="field"><label for="memo">메모 · 선택</label><textarea id="memo" rows="2" placeholder="예: 스쿼트가 한결 쉬워졌다">${esc(db().logs[date]?.memo)}</textarea></div>
      <button class="btn primary big" type="submit" style="margin-top:20px"><span>기록 저장</span>${icon('arrow')}</button>
    </form>
  </section>`;
  app.querySelector('.cards')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-card]');
    if (!b || app.querySelector('.card-flip.flipped')) return;
    const card = RW.drawCard(date);
    if (!card) return;
    const tierName = card.tier === 'legend' ? 'Legend' : card.tier === 'rare' ? 'Rare' : 'Common';
    b.querySelector('.front').innerHTML = `<small>${tierName}</small><b>${card.label}</b>`;
    b.classList.add('flipped', card.tier);
    app.querySelectorAll('.card-flip').forEach((x) => { if (x !== b) x.classList.add('dim'); });
    app.querySelector('#cardMsg').textContent = card.tier === 'legend' ? '전설 카드! 오늘 운이 좋네요.' : card.tier === 'rare' ? '희귀 카드를 뽑았어요.' : '내일 또 뽑을 수 있어요.';
    if (card.badges?.length) toast(`새 배지: ${card.badges.map((x) => x.name).join(', ')}`);
  });
  app.querySelector('#cond').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    app.querySelectorAll('#cond button').forEach((x) => x.classList.toggle('on', x === b));
  });
  app.querySelector('#f').addEventListener('submit', (e) => {
    e.preventDefault();
    const log = db().logs[date];
    log.condition = app.querySelector('#cond .on')?.dataset.v || log.condition || null;
    log.memo = app.querySelector('#memo').value.trim();
    const w = Number(app.querySelector('#w').value);
    if (w) db().weights[date] = w;
    save(); go('home');
    // 저녁 8시 알림이 이미 지난 뒤에 운동을 마쳤다면, 오늘의 성과 알림을 지금 보낸다 (8시 전이면 8시 알림이 성과를 정리해 준다)
    if (new Date().getHours() >= PUSH_HOUR && !db().rewards.recapSent?.[date]) {
      showNow(db()).then((ok) => { if (ok) { (db().rewards.recapSent ||= {})[date] = true; save(); } });
    }
  });
}

// ---------- 기록(캘린더) ----------
let calMonth = null;
function calendar(sel) {
  const c = db().challenge;
  const t = today();
  calMonth ||= t.slice(0, 7);
  const [Y, M] = calMonth.split('-').map(Number);
  const first = new Date(Y, M - 1, 1);
  const daysIn = new Date(Y, M, 0).getDate();
  sel ||= t.slice(0, 7) === calMonth ? t : fmt(first);
  let cells = '';
  for (let k = 0; k < first.getDay(); k++) cells += '<span></span>';
  for (let d = 1; d <= daysIn; d++) {
    const ds = fmt(new Date(Y, M - 1, d));
    const i = dayIndex(ds);
    const log = db().logs[ds];
    let cls = 'day';
    if (i != null) cls += ' in';
    if (log?.done) cls += ' done'; else if (log?.partial) cls += ' partial';
    else if (i != null && diffDays(ds, t) > 0) cls += ' missed';
    if (ds === t) cls += ' today';
    if (ds === sel) cls += ' sel';
    cells += `<button class="${cls}" data-d="${ds}" aria-label="${dateLabel(ds)}"><span>${d}</span></button>`;
  }
  const si = dayIndex(sel);
  const log = db().logs[sel];
  let detail = `<p class="muted">${dateLabel(sel)} · 챌린지 기간이 아니에요</p>`;
  if (si != null) {
    const plan = dayPlan(c, si);
    const y = addDays(t, -1);
    const repText = Object.entries(log?.reps || {}).map(([id, n]) => `${EXERCISES[id].name} ${n}${EXERCISES[id].type === 'hold' ? '초' : '회'}`).join(' · ');
    detail = `
      <div class="detail-head"><h3>${dateLabel(sel)}</h3><span class="tag soft">Day ${pad2(si + 1)} · ${plan.tag}</span></div>
      ${log ? `<div class="kv"><b>${log.done ? '완료' : '부분 완료'}</b><span>${minText(log.sec)}</span><span>${log.kcal}kcal</span>${log.condition ? `<span>${CONDITIONS[log.condition]}</span>` : ''}${db().weights[sel] ? `<span>${db().weights[sel]}kg</span>` : ''}</div>
        ${log.memo ? `<p class="memo">${esc(log.memo)}</p>` : ''}
        ${repText ? `<p class="muted small">${repText}</p>` : ''}`
      : diffDays(sel, t) > 0 ? '<p class="muted">기록이 없어요.</p>' : `<p class="muted">${plan.title} · ${plan.items.length}개 동작</p>`}
      ${!log?.done && (sel === t || sel === y) ? `<button class="btn primary big" data-start="${sel}"><span>${sel === t ? '오늘 운동 시작' : '어제 운동 보충하기'}</span>${icon('arrow')}</button>` : ''}
      ${diffDays(t, sel) > 0 ? itemList(plan) : ''}`;
  }
  app.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>기록</h1><span class="streak"><span class="num">${challengeDays(c)}</span>/ ${c.days}일</span></header>
    <div class="block">
      <div class="cal-head">
        <button class="icon-btn" data-m="-1" aria-label="이전 달">${icon('prev')}</button>
        <b>${Y}. ${pad2(M)}</b>
        <button class="icon-btn" data-m="1" aria-label="다음 달">${icon('next')}</button>
      </div>
      <div class="cal-grid wd">${WD.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <div class="legend"><span><i class="lg done"></i>완료</span><span><i class="lg partial"></i>부분 완료</span><span><i class="lg today"></i>오늘</span></div>
    </div>
    <div class="block detail" style="border-top:1px solid var(--ink);padding-top:16px">${detail}</div>
  </section>`;
  drawThumbs();
  app.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(Y, M - 1 + Number(b.dataset.m), 1);
    calMonth = fmt(d).slice(0, 7); clearThumbs(); calendar();
  }));
  app.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { clearThumbs(); calendar(b.dataset.d); }));
  app.querySelector('[data-start]')?.addEventListener('click', (e) => go('player', { date: e.currentTarget.dataset.start }));
}

// ---------- 공통 버튼 ----------
function bindCommon(view) {
  app.querySelectorAll('[data-go-to]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goTo, b.dataset.anchor)));
  app.querySelector('[data-act="claim"]')?.addEventListener('click', async () => { await claimWeeklyUI(); view(); });
}

// ---------- 보상 ----------
async function photoURL(date) {
  const b = await loadBlob('photo:' + date).catch(() => null);
  return b ? URL.createObjectURL(b) : null;
}

// 사진은 긴 변 1080px JPEG로 줄여서 이 폰(IndexedDB)에만 저장한다
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.85));
}

function rewards(anchor) {
  const r = db().rewards; const c = db().challenge;
  const L = RW.levelInfo();
  const photoDays = Object.keys(r.photos).sort();
  const firstPhoto = photoDays[0], lastPhoto = photoDays.at(-1);
  const ws = Object.keys(db().weights).sort();
  const w0 = ws.length ? db().weights[ws[0]] : null, w1 = ws.length ? db().weights[ws.at(-1)] : null;
  const doneDays = Object.values(db().logs).filter((l) => l.done).length;

  const coupons = r.coupons.map((cp) => {
    const pct = Math.min(1, r.coins / cp.cost);
    return `<li>
      <div class="cp-main"><b>${esc(cp.name)}</b><span class="num cp-cost">${icon('coin')}${cp.cost.toLocaleString()}</span></div>
      <span class="bar"><i style="width:${pct * 100}%"></i></span>
      <div class="cp-actions"><span class="muted small">${pct >= 1 ? '지금 교환할 수 있어요' : `${(cp.cost - r.coins).toLocaleString()} 코인 남음`}</span>
        <span><button class="btn small" data-edit="${cp.id}">수정</button><button class="btn small ${pct >= 1 ? 'primary' : 'ghost'}" data-redeem="${cp.id}" ${pct >= 1 ? '' : 'disabled'}>교환</button></span></div>
    </li>`;
  }).join('');

  const redeemed = r.redeemed.length ? `<ul class="redeemed">${r.redeemed.map((it) => `<li class="${it.used ? 'used' : ''}">
      <span><b>${esc(it.name)}</b><small class="muted">${new Date(it.at).toLocaleDateString('ko-KR')} 교환</small></span>
      <button class="btn small ${it.used ? 'ghost' : 'primary'}" data-used="${it.id}">${it.used ? '사용함' : '쓰기'}</button></li>`).join('')}</ul>`
    : '<p class="muted small">아직 교환한 보상이 없어요.</p>';

  const prRows = RW.PR_EXERCISES.map((id) => {
    const ex = EXERCISES[id]; const v = r.pr[id];
    return `<li>${thumb(id)}<div><b>${ex.name}</b><span class="sub">${v ? `최고 ${v}${ex.type === 'hold' ? '초' : '회'}` : '아직 기록 없음'}</span></div>
      <button class="btn small ghost" data-pr="${id}">도전</button></li>`;
  }).join('');

  const badges = RW.BADGES.map((b) => {
    const got = r.badges[b.id];
    if (!got && b.hidden) return `<li class="badge locked">${icon('lock')}<b>???</b><small>숨겨진 배지</small></li>`;
    return `<li class="badge ${got ? 'got' : 'locked'}">${icon(got ? 'trophy' : 'lock')}<b>${b.name}</b><small>${got ? `${dateShort(got)} 획득` : b.desc}</small></li>`;
  }).join('');
  const badgeCount = Object.keys(r.badges).length;

  const ledger = r.ledger.slice(0, 12).map((x) => `<li><span>${esc(x.note)}<small class="muted"> · ${dateShort(x.date)}</small></span><b class="num ${x.coins < 0 ? 'minus' : ''}">${x.coins > 0 ? '+' : ''}${x.coins || ''}</b></li>`).join('');

  app.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>보상</h1></header>

    <div class="wallet">
      <div class="wallet-coins"><span class="eyebrow">Coins</span><b class="num">${r.coins.toLocaleString()}</b></div>
      <div class="wallet-side">
        <div><span class="eyebrow">Level</span><b class="num">${L.lv}</b><small>${L.titleKo}</small></div>
        <div><span class="eyebrow">Shield</span><b class="num">${r.shields}<small>/ ${RW.MAX_SHIELDS}</small></b><small>방어권</small></div>
      </div>
      <div class="lvline"><span class="xpbar"><i style="width:${Math.round(L.pct * 100)}%"></i></span><span class="muted small num">다음 레벨까지 ${L.need - L.into} XP</span></div>
      <p class="muted small">방어권은 7일 연속할 때마다 1개씩 받아요(최대 2개). 하루를 놓치면 이틀 뒤 자동으로 써서 연속 기록을 지켜 줘요.</p>
    </div>

    <div class="block">
      <div class="block-head"><h2>내가 정한 보상</h2><span class="muted small">코인으로 교환</span></div>
      <ul class="coupons">${coupons}</ul>
      <form id="cpForm" class="cp-form">
        <input type="hidden" id="cpId">
        <input id="cpName" placeholder="보상 이름 (예: 마사지 받기)" maxlength="40" aria-label="보상 이름">
        <input id="cpCost" type="number" inputmode="numeric" min="10" step="10" placeholder="코인" aria-label="필요한 코인">
        <button class="btn primary" type="submit" id="cpSubmit">${icon('plus')}추가</button>
        <button class="btn danger hidden" type="button" id="cpDelete">삭제</button>
      </form>
      <p class="muted small">하루 완주로 보통 150~250 코인을 받아요. 일주일이면 1,000~1,500 코인 정도예요.</p>
    </div>

    <div class="block">
      <div class="block-head"><h2>보상함</h2><span class="muted small">교환한 보상</span></div>
      ${redeemed}
    </div>

    ${missionsBlock(false)}

    <div class="block" id="pr">
      <div class="block-head"><h2>최고 기록 도전</h2><span class="muted small">기록을 깨면 +50 코인</span></div>
      <ul class="ex-list pr-list">${prRows}</ul>
    </div>

    <div class="block" id="report">
      <div class="block-head"><h2>변화 리포트</h2><span class="muted small">사진은 이 폰에만 저장돼요</span></div>
      <div class="compare">
        <figure><div class="ph" id="phFirst">${firstPhoto ? '' : '<span>첫 사진</span>'}</div><figcaption>${firstPhoto ? `처음 · ${dateShort(firstPhoto)}` : '처음'}</figcaption></figure>
        <figure><div class="ph" id="phLast">${lastPhoto && lastPhoto !== firstPhoto ? '' : '<span>최근 사진</span>'}</div><figcaption>${lastPhoto && lastPhoto !== firstPhoto ? `최근 · ${dateShort(lastPhoto)}` : '최근'}</figcaption></figure>
      </div>
      <div class="kv"><span>운동한 날 <b>${doneDays}일</b></span><span>체중 <b>${w0 && w1 ? `${w0} → ${w1}kg (${(w1 - w0 > 0 ? '+' : '') + (w1 - w0).toFixed(1)})` : '기록 없음'}</b></span></div>
      <label class="btn ghost big"><span>${r.photos[today()] ? '오늘 사진 다시 찍기' : '오늘 몸 사진 기록'}</span>${icon('camera')}<input type="file" accept="image/*" id="photoIn" hidden></label>
      <p class="muted small">Day 1, 7, 14, 30에 같은 자리·같은 각도로 찍으면 변화가 잘 보여요. 매주 첫 사진은 +30 코인.</p>
    </div>

    <div class="block">
      <div class="block-head"><h2>배지</h2><span class="muted small">${badgeCount} / ${RW.BADGES.length}</span></div>
      <ul class="badges">${badges}</ul>
    </div>

    <div class="block">
      <div class="block-head"><h2>최근 적립</h2></div>
      ${ledger ? `<ul class="ledger">${ledger}</ul>` : '<p class="muted small">운동을 마치면 여기에 쌓여요.</p>'}
    </div>
  </section>`;
  drawThumbs();
  bindCommon(rewards);

  // 사진 표시
  (async () => {
    if (firstPhoto) { const u = await photoURL(firstPhoto); if (u) app.querySelector('#phFirst')?.insertAdjacentHTML('afterbegin', `<img src="${u}" alt="처음 몸 사진">`); }
    if (lastPhoto && lastPhoto !== firstPhoto) { const u = await photoURL(lastPhoto); if (u) app.querySelector('#phLast')?.insertAdjacentHTML('afterbegin', `<img src="${u}" alt="최근 몸 사진">`); }
  })();

  app.querySelector('#photoIn').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const blob = await shrinkPhoto(f);
      await saveBlob('photo:' + today(), blob);
      const res = RW.notePhoto(today());
      rewards('report');
      toast(`사진을 기록했어요${res.coins ? ` · 코인 +${res.coins}` : ''}${res.badges.length ? ` · 새 배지 ${res.badges.map((b) => b.name).join(', ')}` : ''}`);
    } catch { notify('사진을 저장하지 못했어요. 다른 사진으로 다시 시도해 주세요.'); }
  });

  // 쿠폰
  const form = app.querySelector('#cpForm');
  const setEdit = (cp) => {
    form.querySelector('#cpId').value = cp?.id || '';
    form.querySelector('#cpName').value = cp?.name || '';
    form.querySelector('#cpCost').value = cp?.cost || '';
    form.querySelector('#cpSubmit').innerHTML = cp ? '저장' : `${icon('plus')}추가`;
    form.querySelector('#cpDelete').classList.toggle('hidden', !cp);
    if (cp) form.querySelector('#cpName').focus();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.querySelector('#cpName').value, cost = form.querySelector('#cpCost').value;
    if (!name.trim() || !Number(cost)) return notify('보상 이름과 필요한 코인을 입력해 주세요.');
    RW.saveCoupon({ id: form.querySelector('#cpId').value || null, name, cost });
    rewards();
  });
  form.querySelector('#cpDelete').addEventListener('click', async () => {
    const id = form.querySelector('#cpId').value;
    if (id && await ask('보상 삭제', '이 보상을 목록에서 지울까요?', '삭제', { danger: true })) { RW.removeCoupon(id); rewards(); }
  });
  app.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => setEdit(r.coupons.find((x) => x.id === b.dataset.edit))));
  app.querySelectorAll('[data-redeem]').forEach((b) => b.addEventListener('click', async () => {
    const cp = r.coupons.find((x) => x.id === b.dataset.redeem);
    if (!cp || !await ask('보상 교환', `${cp.cost.toLocaleString()} 코인으로 "${cp.name}"을(를) 교환할까요?`, '교환')) return;
    const res = RW.redeem(cp.id);
    if (res) { rewards(); notify(`"${cp.name}" 교환 완료! 보상함에 넣어 뒀어요. 마음껏 누리세요.${res.badges.length ? `\n새 배지: ${res.badges.map((x) => x.name).join(', ')}` : ''}`, '교환 완료'); }
  }));
  app.querySelectorAll('[data-used]').forEach((b) => b.addEventListener('click', () => { RW.toggleUsed(b.dataset.used); rewards(); }));
  app.querySelectorAll('[data-pr]').forEach((b) => b.addEventListener('click', () => go('player', { pr: b.dataset.pr })));

  if (anchor) requestAnimationFrame(() => app.querySelector('#' + anchor)?.scrollIntoView({ block: 'start' }));
}

// ---------- 통계 ----------
function stats() {
  const c = db().challenge;
  const logs = Object.entries(db().logs).filter(([d]) => { const k = diffDays(c.start, d); return k >= 0 && k < c.days; });
  const done = logs.filter(([, l]) => l.done).length;
  const sec = logs.reduce((a, [, l]) => a + (l.sec || 0), 0);
  const kcal = logs.reduce((a, [, l]) => a + (l.kcal || 0), 0);
  const reps = {};
  for (const [, l] of logs) for (const [id, n] of Object.entries(l.reps || {})) reps[id] = (reps[id] || 0) + n;
  const passed = Math.min(c.days, Math.max(0, diffDays(c.start, today()) + 1));
  const rate = passed ? Math.round((done / passed) * 100) : 0;
  const w0 = c.startWeight, wNow = latestWeight();
  const dw = w0 && wNow ? wNow - w0 : null;
  const maxRep = Math.max(1, ...Object.values(reps));

  app.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>통계</h1></header>
    <div class="stat-grid">
      <div><b>${done}<small>/ ${c.days}</small></b><span>완료한 날</span></div>
      <div><b>${rate}<small>%</small></b><span>달성률</span></div>
      <div><b>${streak()}<small>일</small></b><span>현재 연속 · 최고 ${bestStreak()}일</span></div>
      <div><b>${Math.round(sec / 60)}<small>분</small></b><span>총 운동 시간</span></div>
      <div><b>${kcal.toLocaleString()}</b><span>총 소모 kcal</span></div>
      <div><b>${dw == null ? '–' : (dw > 0 ? '+' : '') + dw.toFixed(1)}<small>kg</small></b><span>체중 변화</span></div>
    </div>
    <div class="block">
      <div class="block-head"><h2>체중</h2>${c.goalWeight ? `<span class="muted small">목표 ${c.goalWeight}kg</span>` : ''}</div>
      ${weightChart(c)}
      <form id="wf" class="inline-form">
        <input type="date" id="wd" value="${today()}" aria-label="날짜"><input type="number" step="0.1" inputmode="decimal" id="wv" placeholder="kg" aria-label="체중">
        <button class="btn primary" type="submit">기록</button>
      </form>
    </div>
    <div class="block">
      <div class="block-head"><h2>동작별 누적</h2></div>
      ${Object.keys(reps).length ? `<ul class="rep-list">${Object.entries(reps).sort((a, b) => b[1] - a[1]).map(([id, n]) =>
        `<li><span>${EXERCISES[id].name}</span><b>${n.toLocaleString()}<span class="muted small"> ${EXERCISES[id].type === 'hold' ? '초' : '회'}</span></b>
        <span class="bar"><i style="width:${(n / maxRep) * 100}%"></i></span></li>`).join('')}</ul>`
        : '<p class="muted">아직 기록이 없어요. 첫 운동을 마치면 여기에 쌓여요.</p>'}
    </div>
  </section>`;
  app.querySelector('#wf').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Number(app.querySelector('#wv').value);
    if (!v) return;
    db().weights[app.querySelector('#wd').value || today()] = v; save(); stats();
  });
}

function weightChart(c) {
  const pts = Object.entries(db().weights).sort(([a], [b]) => (a < b ? -1 : 1));
  if (pts.length < 1) return '<p class="muted">체중을 기록하면 그래프가 그려져요.</p>';
  const W = 340, H = 160, P = 30;
  const vals = pts.map(([, v]) => v).concat(c.goalWeight ? [c.goalWeight] : []);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const span = Math.max(c.days - 1, diffDays(c.start, pts.at(-1)[0]), 1);
  const x = (d) => P + (clamp(diffDays(c.start, d), 0, span) / span) * (W - P - 10);
  const y = (v) => 10 + (1 - (v - lo) / (hi - lo)) * (H - 34);
  const xy = pts.map(([d, v]) => [x(d), y(v)]);
  const line = xy.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  const last = pts.at(-1);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="체중 그래프, 최근 ${last[1]}kg">
    <text x="0" y="${y(hi) + 4}" class="ax">${hi}</text><text x="0" y="${y(lo) + 4}" class="ax">${lo}</text>
    <line x1="${P}" x2="${W - 10}" y1="${y(hi)}" y2="${y(hi)}" class="grid"/>
    <line x1="${P}" x2="${W - 10}" y1="${y(lo)}" y2="${y(lo)}" class="grid"/>
    ${c.goalWeight ? `<line x1="${P}" x2="${W - 10}" y1="${y(c.goalWeight)}" y2="${y(c.goalWeight)}" class="goal"/><text x="${W - 10}" y="${y(c.goalWeight) - 5}" class="ax goal-t" text-anchor="end">목표 ${c.goalWeight}</text>` : ''}
    ${pts.length > 1 ? `<polyline points="${line}" class="wline"/>` : ''}
    ${xy.slice(0, -1).map(([a, b]) => `<circle cx="${a}" cy="${b}" r="2.5" class="wdot"/>`).join('')}
    <circle cx="${xy.at(-1)[0]}" cy="${xy.at(-1)[1]}" r="4.5" class="wlast"/>
    <text x="${P}" y="${H - 6}" class="ax">DAY 1</text><text x="${W - 10}" y="${H - 6}" class="ax" text-anchor="end">DAY ${span + 1}</text>
  </svg>`;
}

// ---------- 설정 ----------
function settings() {
  const c = db().challenge;
  const p = db().prefs;
  app.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>설정</h1></header>
    <div>
      <div class="set-sec">
        <h3>Challenge</h3>
        <div class="row-between"><div><b>${c.days}일 · ${LEVELS[c.level].label}</b><p class="muted small">${dateLabel(c.start)} 시작</p></div>
          <button class="btn ghost small" data-act="edit">바꾸기</button></div>
      </div>
      <div class="set-sec" id="pushSec">
        <h3>Push · 매일 저녁 8시</h3>
        <p class="muted small" id="pushStatus">확인하는 중…</p>
        <div class="row"><button class="btn primary" data-act="push-on">푸시 알림 켜기</button><button class="btn ghost" data-act="push-test">알림 미리보기</button></div>
        <details class="hidden" id="pushSub">
          <summary class="small">구독 정보 · 처음 한 번 등록</summary>
          <p class="small">아래 구독 정보를 복사해서 Claude에게 보내 주세요. 한 번 등록하면 매일 8시에 알림이 와요. 알림을 껐다 다시 켜면 새로 등록해야 해요.</p>
          <pre class="sub-json" id="pushJson"></pre>
          <div class="row"><button class="btn ghost" data-act="push-copy">구독 정보 복사</button><button class="btn danger" data-act="push-off">알림 끄기</button></div>
        </details>
      </div>
      <div class="set-sec">
        <h3>Reminder · 캘린더</h3>
        <p class="muted small">푸시와 별개로, 폰 캘린더에 매일 ${c.remindAt} 반복 일정을 넣어 둘 수도 있어요.</p>
        <div class="row"><a class="btn primary" target="_blank" rel="noopener" href="${gcalLink(c)}">구글 캘린더에 추가</a>
          <button class="btn ghost" data-act="ics">.ics 파일 받기</button></div>
      </div>
      <div class="set-sec">
        <h3>Theme</h3>
        <div class="seg wide" id="theme">${[['system', '시스템 설정'], ['light', '라이트'], ['dark', '다크']].map(([k, v]) => `<button type="button" data-v="${k}" class="${(p.theme || 'system') === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <p class="muted small">시스템 설정을 고르면 폰의 라이트·다크 모드를 따라가요. 운동 화면은 항상 어두운 화면이에요.</p>
      </div>
      <div class="set-sec">
        <h3>Player</h3>
        <label class="switch"><span>음성으로 횟수 세기</span><input type="checkbox" id="voice" ${p.voice ? 'checked' : ''}></label>
        <div class="row-between"><span class="muted small">기본 재생 방식 · ${p.mode === 'tap' ? '내 속도 맞춤' : '자동 재생'}</span>
          <button class="btn ghost small" data-act="tempo">학습한 속도 초기화</button></div>
      </div>
      <div class="set-sec">
        <h3>Music</h3>
        <div class="chips" id="mStyle">${Object.entries(STYLES).map(([k, v]) => `<button type="button" data-v="${k}" class="${p.music.style === k ? 'on' : ''}">${v.label}</button>`).join('')}</div>
        <label class="range">볼륨 <input type="range" min="0.1" max="1" step="0.05" value="${p.music.vol}" id="mVol"></label>
        <label class="switch"><span>박자를 내 운동 속도에 맞추기</span><input type="checkbox" id="mSync" ${p.music.sync ? 'checked' : ''}></label>
        <div class="row"><button class="btn ghost" data-act="preview">미리 듣기</button>
          <label class="btn ghost">내 음악 파일<input type="file" accept="audio/*" id="mFile" hidden></label></div>
        <p class="muted small" id="mFileInfo">기본 음악은 앱이 직접 연주하는 비트라 인터넷 없이도 나와요.</p>
      </div>
      <div class="set-sec">
        <h3>Backup</h3>
        <p class="muted small">기록은 이 폰 브라우저에만 저장돼요. 폰을 바꾸거나 앱 데이터를 지우기 전에 백업하세요.</p>
        <div class="row"><button class="btn ghost" data-act="export">백업 파일 저장</button>
          <label class="btn ghost">백업 불러오기<input type="file" accept="application/json" id="imp" hidden></label></div>
      </div>
      <div class="set-sec">
        <h3>Exercises</h3>
        <ul class="ex-list">${Object.values(EXERCISES).map((ex) => `<li>${thumb(ex.id)}<div><b>${ex.name}</b><span class="sub">${ex.tips[0]}</span></div><span></span></li>`).join('')}</ul>
      </div>
      <div class="set-sec">
        <button class="btn danger" data-act="reset" style="align-self:flex-start;padding-left:0">모든 기록 지우기</button>
        <p class="muted small">오늘홈트 · 데이터는 서버로 전송되지 않아요</p>
      </div>
    </div>
  </section>`;
  drawThumbs();
  const on = (act, fn) => app.querySelector(`[data-act="${act}"]`).addEventListener('click', fn);
  on('edit', () => go('setup'));

  // 푸시 알림
  const pushStatus = app.querySelector('#pushStatus');
  const showSub = (json) => {
    app.querySelector('#pushSub').classList.toggle('hidden', !json);
    app.querySelector('#pushJson').textContent = json || '';
  };
  const refreshPush = async () => {
    if (!pushSupported()) { pushStatus.textContent = '이 브라우저는 푸시 알림을 지원하지 않아요. 크롬에서 홈 화면에 설치한 앱으로 열어 주세요.'; return; }
    const sub = await currentSubscription().catch(() => null);
    if (Notification.permission === 'denied') pushStatus.textContent = '알림이 차단돼 있어요. 폰 설정 → 앱 → 크롬(또는 오늘홈트) → 알림에서 허용해 주세요.';
    else if (sub) pushStatus.textContent = '켜져 있어요. 매일 저녁 8시쯤, 운동 전이면 독려를, 운동 후면 오늘의 성과를 알려 줘요.';
    else pushStatus.textContent = '꺼져 있어요. 켜면 운동 전에는 독려, 운동 후에는 오늘의 성과를 알려 줘요.';
    showSub(sub ? JSON.stringify(sub.toJSON()) : '');
  };
  refreshPush();
  on('push-on', async () => {
    try { await enablePush(); await refreshPush(); app.querySelector('#pushSub').open = true; }
    catch (err) { notify(err.message === 'denied' ? '알림 권한을 허용해야 푸시를 받을 수 있어요.' : '이 브라우저에서는 푸시 알림을 켤 수 없어요.'); }
  });
  on('push-test', async () => {
    if (!(await showNow(db()))) notify('먼저 "푸시 알림 켜기"로 알림 권한을 허용해 주세요.');
  });
  on('push-copy', async () => {
    const t = app.querySelector('#pushJson').textContent;
    try { await navigator.clipboard.writeText(t); toast('구독 정보를 복사했어요'); }
    catch { const r = document.createRange(); r.selectNodeContents(app.querySelector('#pushJson')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('길게 눌러 복사하세요'); }
  });
  on('push-off', async () => {
    if (!await ask('푸시 알림 끄기', '이 폰의 푸시 구독을 해제할까요? 다시 켜면 새 구독 정보를 등록해야 해요.', '끄기', { danger: true })) return;
    await disablePush(); refreshPush();
  });
  on('ics', () => download(`ohometeu-${c.start}.ics`, icsFile(c), 'text/calendar'));
  on('tempo', () => { p.tempo = {}; save(); notify('동작별 속도를 기본값으로 되돌렸어요.'); });
  on('export', () => download(`ohometeu-backup-${today()}.json`, JSON.stringify(db(), null, 1), 'application/json'));
  on('reset', () => {
    ask('모든 기록 지우기', '정말 모든 기록과 설정을 지울까요? 되돌릴 수 없어요. 먼저 백업 파일을 저장해 두는 걸 권해요.', '모두 지우기', { danger: true })
      .then((y) => { if (y) { resetAll(); go('setup'); } });
  });
  app.querySelector('#voice').addEventListener('change', (e) => { p.voice = e.target.checked; save(); });
  app.querySelector('#theme').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    p.theme = b.dataset.v; save(); applyTheme();
    app.querySelectorAll('#theme button').forEach((x) => x.classList.toggle('on', x === b));
  });

  // 배경음악
  const m = p.music;
  let previewing = false;
  const previewBtn = app.querySelector('[data-act="preview"]');
  const preview = async (force) => {
    if (previewing && !force) { music.stop(); previewing = false; previewBtn.textContent = '미리 듣기'; return; }
    await music.start(m.style, m.vol);
    previewing = m.style !== 'off'; previewBtn.textContent = previewing ? '멈추기' : '미리 듣기';
  };
  previewBtn.addEventListener('click', () => preview(false));
  app.querySelector('#mStyle').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    m.style = b.dataset.v; save();
    app.querySelectorAll('#mStyle button').forEach((x) => x.classList.toggle('on', x === b));
    if (previewing || m.style !== 'off') preview(true);
  });
  app.querySelector('#mVol').addEventListener('input', (e) => { m.vol = Number(e.target.value); save(); music.vol = m.vol; music.setSoft(false); });
  app.querySelector('#mSync').addEventListener('change', (e) => { m.sync = e.target.checked; save(); });
  const info = app.querySelector('#mFileInfo');
  loadBlob('myMusic').then((b) => { if (b) info.textContent = `내 음악: ${b.name || '저장된 파일'} (${(b.size / 1048576).toFixed(1)}MB)`; }).catch(() => {});
  app.querySelector('#mFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      await saveBlob('myMusic', f);
      m.style = 'mine'; save();
      notify(`"${f.name}"을(를) 운동 음악으로 정했어요.`);
      settings();
    } catch { notify('음악 파일을 저장하지 못했어요. 파일이 너무 크면 더 작은 파일로 시도해 주세요.'); }
  });
  app.querySelector('#imp').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d.logs || !('challenge' in d)) throw new Error();
      if (await ask('백업 불러오기', '지금 기록을 백업 파일 내용으로 바꿀까요?', '바꾸기')) { replaceAll(d); go('home'); }
    } catch { notify('백업 파일을 읽지 못했어요.'); }
  });
}

function gcalLink(c) {
  const d = c.start.replaceAll('-', '');
  const [h, m] = c.remindAt.split(':').map(Number);
  const s = `${d}T${pad2(h)}${pad2(m)}00`;
  const e2 = new Date(2000, 0, 1, h, m + 30);
  const e = `${d}T${pad2(e2.getHours())}${pad2(e2.getMinutes())}00`;
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: '오늘홈트 운동 시간', dates: `${s}/${e}`, ctz: 'Asia/Seoul',
    details: `오늘의 홈트를 할 시간이에요.\n${location.origin}${location.pathname}`, recur: `RRULE:FREQ=DAILY;COUNT=${c.days}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

function icsFile(c) {
  const d = c.start.replaceAll('-', '');
  const [h, m] = c.remindAt.split(':');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ohometeu//KO', 'BEGIN:VEVENT',
    `UID:ohometeu-${d}@local`, `DTSTAMP:${d}T000000Z`, `DTSTART;TZID=Asia/Seoul:${d}T${h}${m}00`, 'DURATION:PT30M',
    `RRULE:FREQ=DAILY;COUNT=${c.days}`, 'SUMMARY:오늘홈트 운동 시간', `DESCRIPTION:${location.origin}${location.pathname}`,
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:오늘홈트', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- 설치 ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; document.querySelector('#installBtn')?.classList.remove('hidden'); });
const installBtn = () => `<button class="btn small ghost ${installEvt ? '' : 'hidden'}" id="installBtn">홈 화면에 설치</button>`;
function bindInstall() {
  app.querySelector('#installBtn')?.addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt(); await installEvt.userChoice; installEvt = null;
    app.querySelector('#installBtn')?.classList.add('hidden');
  });
}

// 하단 탭 아이콘
nav.querySelectorAll('[data-go]').forEach((b) => b.insertAdjacentHTML('afterbegin', icon({ home: 'today', calendar: 'calendar', rewards: 'gift', stats: 'stats', settings: 'settings' }[b.dataset.go])));

// ---------- 테마 (시스템 / 라이트 / 다크) ----------
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = db().prefs.theme || 'system';
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && darkQuery.matches);
  document.getElementById('themeColor')?.setAttribute('content', dark ? '#111213' : '#ecedea');
}
darkQuery.addEventListener('change', applyTheme);
applyTheme();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
navigator.storage?.persist?.();
go(db().challenge ? 'home' : 'setup');

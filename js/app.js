import { EXERCISES } from './exercises.js';
import { Avatar } from './avatar.js';
import { LEVELS, dayPlan, estimateSec } from './plan.js';
import { runWorkout } from './player.js';
import {
  db, save, replaceAll, resetAll, today, addDays, diffDays, parse, fmt, dayIndex, streak, bestStreak, latestWeight,
} from './store.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const CONDITIONS = { hard: '😫 힘들었어', ok: '🙂 적당했어', easy: '😄 쉬웠어' };
const CHEERS = [
  '오늘의 나는 어제의 나보다 강해요 💪', '시작한 것만으로 이미 절반!', '작은 땀방울이 모여 큰 변화가 돼요',
  '몸은 거짓말을 안 해요. 오늘도 쌓아볼까요?', '10분만 해도 0분보다 훨씬 좋아요', '꾸준함이 재능을 이겨요 🔥',
];
const dateLabel = (s) => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
const minText = (sec) => `${Math.max(1, Math.round(sec / 60))}분`;

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

function itemList(plan) {
  return `<ul class="ex-list">${plan.items.map((it) => {
    const ex = EXERCISES[it.id];
    const amount = ex.type === 'hold' ? `${it.target}초` : `${it.target}회`;
    return `<li><canvas data-ex="${it.id}"></canvas><div><b>${ex.name}</b><span>${it.sets}세트 × ${amount}${ex.unit ? ` · ${ex.unit}` : ''}</span></div></li>`;
  }).join('')}</ul>`;
}

// ---------- 화면 전환 ----------
function go(view, arg) {
  clearThumbs();
  window.scrollTo(0, 0);
  const c = db().challenge;
  if (!c && view !== 'setup') view = 'setup';
  nav.classList.toggle('hidden', view === 'setup' || view === 'player' || view === 'finish');
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.go === view));
  ({ setup, home, calendar, stats, settings, player, finish })[view](arg);
}
nav.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

// ---------- 챌린지 설정 ----------
function setup() {
  const c = db().challenge;
  app.innerHTML = `
  <section class="page setup">
    <h1>나만의 홈트 챌린지</h1>
    <p class="muted">기간을 정하고 매일 빠짐없이 해봐요. 기록은 이 폰에만 저장돼요.</p>
    <form id="f" class="form">
      <label>챌린지 기간</label>
      <div class="chips" id="days">
        ${[14, 30, 60].map((d) => `<button type="button" data-v="${d}" class="${(c?.days || 30) === d ? 'on' : ''}">${d}일</button>`).join('')}
        <input type="number" min="7" max="180" placeholder="직접" id="daysIn" value="${c && ![14, 30, 60].includes(c.days) ? c.days : ''}">
      </div>
      <label>시작일</label>
      <input type="date" id="start" value="${c?.start || today()}">
      <label>운동 수준</label>
      <div class="chips" id="level">
        ${Object.entries(LEVELS).map(([k, v]) => `<button type="button" data-v="${k}" class="${(c?.level || 'easy') === k ? 'on' : ''}">${v.label}</button>`).join('')}
      </div>
      <p class="hint">입문: 2세트, 무릎 푸시업 · 중급: 3세트 · 상급: 3세트, 횟수 1.4배. 매주 횟수가 조금씩 늘어나요.</p>
      <div class="two">
        <div><label>현재 체중 (kg)</label><input type="number" step="0.1" id="w0" value="${c?.startWeight || ''}" placeholder="예: 68.5"></div>
        <div><label>목표 체중 (kg)</label><input type="number" step="0.1" id="w1" value="${c?.goalWeight || ''}" placeholder="예: 62"></div>
      </div>
      <label>매일 운동할 시간</label>
      <input type="time" id="remind" value="${c?.remindAt || '20:00'}">
      <button class="btn primary big" type="submit">${c ? '저장하기' : '챌린지 시작하기 🔥'}</button>
      ${c ? '<button class="btn ghost" type="button" id="cancel">취소</button>' : ''}
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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- 홈 ----------
function home() {
  const c = db().challenge;
  const t = today();
  const i = dayIndex(t);
  const st = streak();
  const doneCount = Object.entries(db().logs).filter(([d, l]) => l.done && diffDays(c.start, d) >= 0 && diffDays(c.start, d) < c.days).length;
  const end = addDays(c.start, c.days - 1);
  let body = '';

  if (i == null && diffDays(t, c.start) > 0) {
    body = `<div class="card hero"><h2>챌린지 시작까지 D-${diffDays(t, c.start)}</h2><p>${dateLabel(c.start)}에 Day 1이 시작돼요. 미리 동작을 익혀 두세요!</p></div>
      <div class="card"><h3>Day 1 미리보기</h3>${itemList(dayPlan(c, 0))}</div>`;
  } else if (i == null) {
    body = `<div class="card hero done"><h2>🏆 챌린지 완주!</h2>
      <p>${c.days}일 중 <b>${doneCount}일</b> 운동했어요. 최고 연속 기록 ${bestStreak()}일.</p>
      <button class="btn primary big" data-act="new">새 챌린지 시작하기</button></div>`;
  } else {
    const plan = dayPlan(c, i);
    const log = db().logs[t];
    const y = addDays(t, -1);
    const yi = dayIndex(y);
    const missedY = yi != null && !db().logs[y]?.done;
    body = `
    <div class="card hero ${log?.done ? 'done' : ''}">
      <div class="hero-top"><span class="pill">Day ${i + 1} / ${c.days}</span><span class="pill fire">🔥 ${st}일 연속</span></div>
      <h2>${plan.emoji} ${plan.title}</h2>
      <p class="muted">${dateLabel(t)} · 약 ${minText(estimateSec(plan, db().prefs.tempo))}</p>
      ${log?.done
        ? `<p class="done-msg">✅ 오늘 운동 완료! ${minText(log.sec)} · ${log.kcal}kcal</p><button class="btn ghost" data-act="start" data-date="${t}">한 번 더 하기</button>`
        : `<p class="cheer">${CHEERS[i % CHEERS.length]}</p><button class="btn primary big" data-act="start" data-date="${t}">${log?.partial ? '이어서 다시 하기' : '오늘 운동 시작'} ▶</button>`}
    </div>
    ${missedY ? `<div class="card warn"><b>어제(Day ${yi + 1}) 운동을 놓쳤어요</b><p>오늘 안에 보충하면 연속 기록이 이어져요.</p><button class="btn ghost" data-act="start" data-date="${y}">어제 운동 보충하기</button></div>` : ''}
    <div class="card"><h3>오늘의 루틴</h3>${itemList(plan)}</div>
    <div class="progress-card card">
      <div class="row-between"><b>챌린지 진행률</b><span>${doneCount} / ${c.days}일</span></div>
      <div class="bar"><i style="width:${(doneCount / c.days) * 100}%"></i></div>
      <p class="muted small">${dateLabel(c.start)} ~ ${dateLabel(end)}</p>
    </div>
    ${i + 1 < c.days ? `<div class="card"><h3>내일 · Day ${i + 2}</h3><p class="muted">${dayPlan(c, i + 1).emoji} ${dayPlan(c, i + 1).title}</p></div>` : ''}`;
  }

  app.innerHTML = `<section class="page"><header class="page-head"><h1>오늘홈트</h1>${installBtn()}</header>${body}</section>`;
  drawThumbs();
  bindInstall();
  app.querySelectorAll('[data-act="start"]').forEach((b) => b.addEventListener('click', () => go('player', b.dataset.date)));
  app.querySelector('[data-act="new"]')?.addEventListener('click', () => { db().challenge = null; save(); go('setup'); });
}

// ---------- 플레이어 / 완료 ----------
function player(date) {
  const c = db().challenge;
  const i = dayIndex(date);
  if (i == null) return go('home');
  const plan = dayPlan(c, i);
  runWorkout(app, {
    plan,
    onFinish: (r) => go('finish', { date, r, done: true }),
    onExit: (r) => { saveLog(date, r, false); go('home'); },
  });
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

function finish({ date, r }) {
  saveLog(date, r, true);
  const st = streak();
  const total = Object.values(r.reps).reduce((a, b) => a + b, 0);
  const milestone = [3, 7, 14, 21, 30, 50, 60, 100].includes(st) ? `<p class="badge-big">🏅 ${st}일 연속 달성!</p>` : '';
  app.innerHTML = `
  <section class="page finish">
    <div class="confetti">🎉</div>
    <h1>Day ${dayIndex(date) + 1} 완료!</h1>
    ${milestone}
    <div class="stat-grid">
      <div><b>${minText(r.sec)}</b><span>운동 시간</span></div>
      <div><b>${r.kcal}</b><span>kcal</span></div>
      <div><b>${total}</b><span>총 횟수</span></div>
      <div><b>🔥 ${st}</b><span>연속 일수</span></div>
    </div>
    <form id="f" class="form card">
      <label>오늘 컨디션</label>
      <div class="chips" id="cond">${Object.entries(CONDITIONS).map(([k, v]) => `<button type="button" data-v="${k}">${v}</button>`).join('')}</div>
      <label>오늘 체중 (선택)</label>
      <input type="number" step="0.1" id="w" placeholder="kg" value="${db().weights[date] || ''}">
      <label>메모 (선택)</label>
      <textarea id="memo" rows="2" placeholder="예: 스쿼트가 한결 쉬워졌다">${esc(db().logs[date]?.memo)}</textarea>
      <button class="btn primary big" type="submit">기록 저장</button>
    </form>
  </section>`;
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
    cells += `<button class="${cls}" data-d="${ds}"><span>${d}</span>${log?.done ? '<i>🔥</i>' : i != null ? `<small>D${i + 1}</small>` : ''}</button>`;
  }
  const si = dayIndex(sel);
  const log = db().logs[sel];
  let detail = `<p class="muted">${dateLabel(sel)} · 챌린지 기간이 아니에요</p>`;
  if (si != null) {
    const plan = dayPlan(c, si);
    const y = addDays(t, -1);
    detail = `
      <div class="row-between"><h3>${dateLabel(sel)} · Day ${si + 1}</h3><span class="pill">${plan.emoji} ${plan.title}</span></div>
      ${log ? `<p>${log.done ? '✅ 완료' : '◐ 부분 완료'} · ${minText(log.sec)} · ${log.kcal}kcal${log.condition ? ` · ${CONDITIONS[log.condition]}` : ''}</p>
        ${log.memo ? `<p class="memo">“${esc(log.memo)}”</p>` : ''}
        <p class="muted small">${Object.entries(log.reps || {}).map(([id, n]) => `${EXERCISES[id].name} ${n}${EXERCISES[id].type === 'hold' ? '초' : '회'}`).join(' · ')}</p>`
      : diffDays(sel, t) > 0 ? '<p class="muted">기록 없음</p>' : ''}
      ${db().weights[sel] ? `<p class="muted small">체중 ${db().weights[sel]}kg</p>` : ''}
      ${!log?.done && (sel === t || sel === y) ? `<button class="btn primary" data-start="${sel}">${sel === t ? '오늘 운동 시작' : '어제 운동 보충하기'}</button>` : ''}
      ${diffDays(t, sel) > 0 ? itemList(plan) : ''}`;
  }
  app.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>운동 기록</h1></header>
    <div class="card">
      <div class="cal-head"><button class="icon-btn" data-m="-1">‹</button><b>${Y}년 ${M}월</b><button class="icon-btn" data-m="1">›</button></div>
      <div class="cal-grid wd">${WD.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <div class="legend"><span><i class="lg done"></i>완료</span><span><i class="lg partial"></i>부분</span><span><i class="lg missed"></i>놓침</span></div>
    </div>
    <div class="card">${detail}</div>
  </section>`;
  drawThumbs();
  app.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(Y, M - 1 + Number(b.dataset.m), 1);
    calMonth = fmt(d).slice(0, 7); calendar();
  }));
  app.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { clearThumbs(); calendar(b.dataset.d); }));
  app.querySelector('[data-start]')?.addEventListener('click', (e) => go('player', e.target.dataset.start));
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

  app.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>통계</h1></header>
    <div class="stat-grid">
      <div><b>${done}<small>/${c.days}</small></b><span>완료한 날</span></div>
      <div><b>${rate}%</b><span>달성률</span></div>
      <div><b>🔥 ${streak()}</b><span>현재 연속 (최고 ${bestStreak()})</span></div>
      <div><b>${Math.round(sec / 60)}분</b><span>총 운동 시간</span></div>
      <div><b>${kcal.toLocaleString()}</b><span>총 kcal</span></div>
      <div><b>${w0 && wNow ? (wNow - w0 > 0 ? '+' : '') + (wNow - w0).toFixed(1) : '-'}<small>kg</small></b><span>체중 변화</span></div>
    </div>
    <div class="card">
      <div class="row-between"><h3>체중 변화</h3>${c.goalWeight ? `<span class="muted small">목표 ${c.goalWeight}kg</span>` : ''}</div>
      ${weightChart(c)}
      <form id="wf" class="inline-form">
        <input type="date" id="wd" value="${today()}"><input type="number" step="0.1" id="wv" placeholder="kg">
        <button class="btn primary" type="submit">기록</button>
      </form>
    </div>
    <div class="card">
      <h3>동작별 누적</h3>
      ${Object.keys(reps).length ? `<ul class="rep-list">${Object.entries(reps).sort((a, b) => b[1] - a[1]).map(([id, n]) =>
        `<li><span>${EXERCISES[id].name}</span><b>${n.toLocaleString()}${EXERCISES[id].type === 'hold' ? '초' : '회'}</b></li>`).join('')}</ul>`
        : '<p class="muted">아직 기록이 없어요. 오늘 첫 운동을 해볼까요?</p>'}
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
  const W = 320, H = 150, P = 28;
  const vals = pts.map(([, v]) => v).concat(c.goalWeight ? [c.goalWeight] : []);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const span = Math.max(c.days - 1, diffDays(c.start, pts.at(-1)[0]), 1);
  const x = (d) => P + (clamp(diffDays(c.start, d), 0, span) / span) * (W - P - 8);
  const y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (H - 30);
  const line = pts.map(([d, v]) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="체중 그래프">
    <text x="2" y="${y(hi) + 4}" class="ax">${hi}</text><text x="2" y="${y(lo) + 4}" class="ax">${lo}</text>
    <line x1="${P}" x2="${W - 8}" y1="${y(lo)}" y2="${y(lo)}" class="grid"/>
    ${c.goalWeight ? `<line x1="${P}" x2="${W - 8}" y1="${y(c.goalWeight)}" y2="${y(c.goalWeight)}" class="goal"/><text x="${W - 8}" y="${y(c.goalWeight) - 4}" class="ax goal-t" text-anchor="end">목표</text>` : ''}
    <polyline points="${line}" class="wline"/>
    ${pts.map(([d, v]) => `<circle cx="${x(d)}" cy="${y(v)}" r="3.5" class="wdot"/>`).join('')}
    <text x="${W - 8}" y="${H - 4}" class="ax" text-anchor="end">Day ${span + 1}</text><text x="${P}" y="${H - 4}" class="ax">Day 1</text>
  </svg>`;
}

// ---------- 설정 ----------
function settings() {
  const c = db().challenge;
  const p = db().prefs;
  app.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>설정</h1></header>
    <div class="card">
      <h3>내 챌린지</h3>
      <p>${c.days}일 · ${LEVELS[c.level].label} · ${dateLabel(c.start)} 시작</p>
      <button class="btn ghost" data-act="edit">챌린지 설정 바꾸기</button>
    </div>
    <div class="card">
      <h3>매일 알림</h3>
      <p class="muted small">폰 캘린더에 ${c.remindAt} 반복 일정을 넣어 두면 앱을 안 열어도 알림이 와요.</p>
      <a class="btn primary" target="_blank" rel="noopener" href="${gcalLink(c)}">구글 캘린더에 알림 추가</a>
      <button class="btn ghost" data-act="ics">캘린더 파일(.ics)로 받기</button>
    </div>
    <div class="card">
      <h3>운동 플레이어</h3>
      <label class="switch"><input type="checkbox" id="voice" ${p.voice ? 'checked' : ''}><span>음성으로 횟수 세기</span></label>
      <p class="muted small">기본 재생 방식: <b>${p.mode === 'tap' ? '내 속도 맞춤 (탭)' : '자동 재생'}</b> · 운동 중 화면에서 바꿀 수 있어요.</p>
      <button class="btn ghost" data-act="tempo">동작별 학습된 속도 초기화</button>
    </div>
    <div class="card">
      <h3>백업</h3>
      <p class="muted small">기록은 이 폰 브라우저에만 저장돼요. 폰을 바꾸거나 앱 데이터를 지우기 전에 꼭 백업하세요.</p>
      <div class="row"><button class="btn ghost" data-act="export">백업 파일 저장</button><label class="btn ghost">백업 불러오기<input type="file" accept="application/json" id="imp" hidden></label></div>
    </div>
    <div class="card">
      <h3>동작 도감</h3>
      <ul class="ex-list">${Object.values(EXERCISES).map((ex) => `<li><canvas data-ex="${ex.id}"></canvas><div><b>${ex.name}</b><span>${ex.tips[0]}</span></div></li>`).join('')}</ul>
    </div>
    <button class="btn ghost danger" data-act="reset">모든 기록 지우기</button>
    <p class="muted small center">오늘홈트 v1 · 데이터는 서버로 전송되지 않아요</p>
  </section>`;
  drawThumbs();
  const on = (act, fn) => app.querySelector(`[data-act="${act}"]`).addEventListener('click', fn);
  on('edit', () => go('setup'));
  on('ics', () => download(`ohometeu-${c.start}.ics`, icsFile(c), 'text/calendar'));
  on('tempo', () => { p.tempo = {}; save(); alert('동작별 속도를 기본값으로 되돌렸어요.'); });
  on('export', () => download(`ohometeu-backup-${today()}.json`, JSON.stringify(db(), null, 1), 'application/json'));
  on('reset', () => {
    if (confirm('정말 모든 기록과 설정을 지울까요? 되돌릴 수 없어요.\n(먼저 백업 파일을 저장해 두는 걸 권해요)')) { resetAll(); go('setup'); }
  });
  app.querySelector('#voice').addEventListener('change', (e) => { p.voice = e.target.checked; save(); });
  app.querySelector('#imp').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d.logs || !('challenge' in d)) throw new Error();
      if (confirm('지금 기록을 백업 파일 내용으로 바꿀까요?')) { replaceAll(d); go('home'); }
    } catch { alert('백업 파일을 읽지 못했어요.'); }
  });
}

function gcalLink(c) {
  const d = c.start.replaceAll('-', '');
  const [h, m] = c.remindAt.split(':').map(Number);
  const s = `${d}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
  const e2 = new Date(2000, 0, 1, h, m + 30);
  const e = `${d}T${String(e2.getHours()).padStart(2, '0')}${String(e2.getMinutes()).padStart(2, '0')}00`;
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: '🔥 오늘홈트 운동 시간', dates: `${s}/${e}`, ctz: 'Asia/Seoul',
    details: `오늘의 홈트를 할 시간이에요!\n${location.origin}${location.pathname}`, recur: `RRULE:FREQ=DAILY;COUNT=${c.days}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

function icsFile(c) {
  const d = c.start.replaceAll('-', '');
  const [h, m] = c.remindAt.split(':');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ohometeu//KO', 'BEGIN:VEVENT',
    `UID:ohometeu-${d}@local`, `DTSTAMP:${d}T000000Z`, `DTSTART;TZID=Asia/Seoul:${d}T${h}${m}00`, 'DURATION:PT30M',
    `RRULE:FREQ=DAILY;COUNT=${c.days}`, 'SUMMARY:🔥 오늘홈트 운동 시간', `DESCRIPTION:${location.origin}${location.pathname}`,
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
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (location.hash !== '#player') document.querySelector('#installBtn')?.classList.remove('hidden'); });
const installBtn = () => `<button class="btn small ghost ${installEvt ? '' : 'hidden'}" id="installBtn">홈 화면에 설치</button>`;
function bindInstall() {
  app.querySelector('#installBtn')?.addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt(); await installEvt.userChoice; installEvt = null;
    app.querySelector('#installBtn')?.classList.add('hidden');
  });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
navigator.storage?.persist?.();
go(db().challenge ? 'home' : 'setup');

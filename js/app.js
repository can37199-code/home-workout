import { EXERCISES } from './exercises.js';
import { MEDIA } from './media.js';
import { Avatar } from './avatar.js';
import { LEVELS, PROGRAMS, programOf, dayPlan, estimateSec, miniPlan, challengePlan, ADAPT_MIN, ADAPT_MAX } from './plan.js';
import { LINES } from './voice-lines.js';
import { runWorkout } from './player.js';
import { ask, notify } from './ui.js';
import { music, STYLES } from './music.js';
import { saveBlob, loadBlob } from './idb.js';
import { startPlaybackMode, stopPlaybackMode } from './audio.js';
import { icon } from './icons.js';
import * as RW from './rewards.js';
import * as BILL from './billing.js';
import { drawShareCard, shareCard } from './share.js';
import { FLAGS } from './flags.js';
import { PUSH_HOUR, pushSupported, currentSubscription, enablePush, disablePush, showNow as webShowNow } from './push.js';
import { hideSplash, remindAt, remindLabel, nativeShareFile, setThemeBars, isNative, nativeNotifyPermission, nativeNotifyEnable, nativeReschedule, nativeShowNow, onBackButton, onResume } from './native.js';
import {
  db, save, replaceAll, resetAll, today, addDays, diffDays, parse, fmt, dayIndex, streak, bestStreak, latestWeight, onSave,
} from './store.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const CONDITIONS = { hard: '힘들었어요', ok: '적당했어요', easy: '가뿐했어요' };
const CHEERS = [
  '어제보다 한 번만 더.', '시작하면 절반은 끝난 거예요.', '작은 반복이 몸을 바꿔요.',
  '오늘 쌓은 만큼 내일이 가벼워져요.', '10분이라도 0분보다 훨씬 나아요.', '꾸준함이 결국 이겨요.',
];
const dateLabel = (s) => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`; };
const dateShort = (s) => { const d = parse(s); return `${d.getMonth() + 1}.${d.getDate()}`; };
const stamp = (s) => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`; };
// 글자 로고: "오늘"은 가볍게, "홈트"는 굵게, 끝에 진행 점
const wordmark = (size = '') => `<span class="wordmark ${size}" role="img" aria-label="오늘홈트"><span>오늘</span><b>홈트</b><i></i></span>`;
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
let currentView = null;
function go(view, arg) {
  clearThumbs();
  music.stop();
  window.scrollTo(0, 0);
  const c = db().challenge;
  const FLOW = ['welcome', 'health', 'setup'];
  if (!c && !FLOW.includes(view)) view = db().prefs.onboarded ? 'setup' : 'welcome';
  if (!c && view === 'setup' && !db().prefs.onboarded) view = 'welcome';
  // 무료 체험이 끝났으면 운동 대신 이용권 화면으로 (구매하면 원래 하려던 운동으로 이어 간다)
  if (view === 'player' && !BILL.canWorkout()) { arg = { next: arg }; view = 'paywall'; }
  nav.classList.toggle('hidden', ['welcome', 'health', 'setup', 'notifyAsk', 'paywall', 'player', 'finish'].includes(view));
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.go === view));
  currentView = view;
  ({ welcome, health, notifyAsk, paywall, setup, home, calendar, rewards, stats, settings, player, finish })[view](arg);
  enhance();
}

// 화면이 바뀔 때: 섹션이 차례로 떠오르고, 숫자는 0에서 올라간다
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function enhance() {
  const page = app.querySelector('.page');
  if (!page) return;
  [...page.children].forEach((el, i) => el.style.setProperty('--d', `${Math.min(i, 8) * 60}ms`));
  page.classList.add('enter');
  if (reduceMotion.matches) return;
  page.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count) || 0, padN = Number(el.dataset.pad) || 0;
    if (!to) return;
    const show = (v) => { el.textContent = padN ? String(v).padStart(padN, '0') : v.toLocaleString(); };
    const t0 = performance.now(), D = 900;
    show(0);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / D);
      show(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => show(to), D + 200); // 화면이 가려져 애니메이션이 멈춰도 최종 값은 보이게
  });
}
nav.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

// ---------- 챌린지 설정 ----------
function setup() {
  const c = db().challenge;
  app.innerHTML = `
  <section class="page setup">
    <div class="setup-hero">
      ${c ? '<span class="eyebrow">챌린지 설정</span><div class="display ko">계획<br>바꾸기</div>' : `${obSteps(2)}<span class="eyebrow">챌린지 정하기</span><div class="display ko">나의<br>챌린지</div>`}
      <p class="muted">기간을 정하고 하루도 빠짐없이 해 봐요. 기록은 이 폰에만 저장돼요.</p>
    </div>
    <form id="f" class="form">
      <div class="field">
        <label>프로그램</label>
        <div class="programs" id="program">${Object.entries(PROGRAMS).map(([k, p]) => `<button type="button" data-v="${k}" data-days="${p.days}" class="prog-card ${(c?.program || 'diet30') === k ? 'on' : ''}"><b>${p.name}</b><span>${p.desc}</span></button>`).join('')}</div>
      </div>
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
  // 프로그램을 바꾸면 기간도 그 프로그램 기본값으로
  app.querySelector('#program').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    app.querySelectorAll('#program button').forEach((x) => x.classList.toggle('on', x === b));
    const d = Number(b.dataset.days), chip = app.querySelector(`#days button[data-v="${d}"]`);
    app.querySelectorAll('#days button').forEach((x) => x.classList.toggle('on', x === chip));
    app.querySelector('#daysIn').value = chip ? '' : d;
  });
  app.querySelector('#daysIn').addEventListener('input', () => app.querySelectorAll('#days button').forEach((x) => x.classList.remove('on')));
  app.querySelector('#cancel')?.addEventListener('click', () => go('settings'));
  app.querySelector('#f').addEventListener('submit', (e) => {
    e.preventDefault();
    const days = Number(app.querySelector('#daysIn').value) || Number(app.querySelector('#days .on')?.dataset.v) || 30;
    const w0 = Number(app.querySelector('#w0').value) || null;
    const start = app.querySelector('#start').value || today();
    db().challenge = {
      ...(c || {}),
      program: app.querySelector('#program .on')?.dataset.v || 'diet30',
      start, days: clamp(days, 7, 180),
      level: app.querySelector('#level .on')?.dataset.v || 'easy',
      startWeight: w0, goalWeight: Number(app.querySelector('#w1').value) || null,
      remindAt: app.querySelector('#remind').value || '20:00',
    };
    if (w0 && !db().weights[start]) db().weights[start] = w0;
    BILL.ensureTrial();
    save();
    go(!c && isNative() && db().prefs.notify === undefined ? 'notifyAsk' : 'home');
  });
}

// ---------- 첫 실행 안내: 환영 → 건강 확인 → 챌린지 설정 → (앱) 알림 허용 ----------
// 첫 화면·이용권 화면 위쪽의 코치 영상: 동작 몇 개를 번갈아 반복 재생한다 (소리 없음)
const HERO_CLIPS = ['squat', 'jumpingJack', 'lunge', 'mountainClimber'];
function heroVideo(cls = '') {
  return `<div class="hero-video ${cls}"><video id="heroV" muted playsinline autoplay preload="auto" poster="${MEDIA.squat.poster}"></video><span class="p-ai">AI 생성 영상</span></div>`;
}
function startHero() {
  const v = app.querySelector('#heroV'); if (!v) return;
  let k = 0, loops = 0;
  const load = () => { v.src = MEDIA[HERO_CLIPS[k]].src; v.play().catch(() => {}); };
  v.addEventListener('ended', () => { if (++loops >= 2) { loops = 0; k = (k + 1) % HERO_CLIPS.length; load(); } else { v.currentTime = 0; v.play().catch(() => {}); } });
  load();
}
const obSteps = (n) => `<div class="ob-steps" aria-label="${n} / 3단계">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</div>`;

function welcome() {
  app.innerHTML = `
  <section class="page onboard welcome">
    ${heroVideo('tall')}
    <div class="ob-hero-text">
      ${wordmark('xl')}
      <p class="ob-slogan">집에서 하루 10~20분,<br>코치 영상 따라 빠짐없이.</p>
    </div>
    <ul class="ob-points">
      <li>${icon('play')}<div><b>영상 코치를 따라 하면 끝</b><span>동작마다 영상과 음성이 횟수를 세 줘요.</span></div></li>
      <li>${icon('trophy')}<div><b>매일 하면 쌓이는 보상</b><span>코인을 모아 내가 정한 선물로 바꿔요.</span></div></li>
      <li>${icon('download')}<div><b>가입 없이, 기록은 이 폰에만</b><span>영상 속 코치는 AI로 만든 가상 인물이에요.</span></div></li>
    </ul>
    <button class="btn primary big" data-act="next"><span>7일 무료로 시작하기</span>${icon('arrow')}</button>
    <p class="legal-links center"><a href="${LEGAL.terms}" target="_blank" rel="noopener">이용약관</a><span class="dot"></span><a href="${LEGAL.privacy}" target="_blank" rel="noopener">개인정보처리방침</a></p>
  </section>`;
  startHero();
  app.querySelector('[data-act="next"]').addEventListener('click', () => go('health'));
}

// 운동 전 건강 확인 (PAR-Q를 쉬운 말로 줄인 것). '예'가 하나라도 있으면 상담을 권하고 입문 단계로 시작하게 한다
const HEALTH_QS = [
  '의사에게 심장 질환이 있다는 말을 들은 적이 있나요?',
  '운동할 때나 쉴 때 가슴 통증을 느낀 적이 있나요?',
  '어지럼증으로 휘청이거나 정신을 잃은 적이 있나요?',
  '운동하면 더 나빠질 수 있는 뼈·관절 문제가 있나요?',
  '혈압이나 심장 때문에 약을 먹고 있나요?',
  '임신 중이거나 출산한 지 6개월이 안 됐나요?',
];
function health() {
  app.innerHTML = `
  <section class="page onboard">
    <header class="ob-head">${obSteps(1)}<span class="eyebrow">시작 전 확인</span><h1>운동 전 건강 확인</h1>
      <p class="muted">안전하게 시작하려고 여쭤봐요. 답은 이 폰에만 저장돼요.</p>
      <button class="btn ghost hq-none" type="button" data-act="none">${icon('check')} 모두 해당 없어요</button></header>
    <div class="block hq-list">
      ${HEALTH_QS.map((q, k) => `<div class="hq" data-k="${k}"><p>${q}</p><div class="seg"><button type="button" data-v="0">아니요</button><button type="button" data-v="1">예</button></div></div>`).join('')}
    </div>
    <div class="note warn hidden" id="hWarn"><b>시작 전에 의사와 상담하길 권해요</b>
      <p class="muted">상담 후에 시작하거나, 가장 쉬운 '입문' 단계로 천천히 시작하세요. 운동 중 통증·어지러움·숨이 너무 찬 느낌이 들면 바로 멈추세요.</p>
      <label class="switch"><span>확인했어요. 무리하지 않을게요</span><input type="checkbox" id="hAck"></label></div>
    <button class="btn primary big" data-act="next" disabled><span>다음</span>${icon('arrow')}</button>
  </section>`;
  const ans = Array(HEALTH_QS.length).fill(null);
  const btn = app.querySelector('[data-act="next"]'), warn = app.querySelector('#hWarn'), ack = app.querySelector('#hAck');
  const refresh = () => {
    const anyYes = ans.includes(1);
    warn.classList.toggle('hidden', !anyYes);
    btn.disabled = ans.includes(null) || (anyYes && !ack.checked);
  };
  app.querySelectorAll('.hq').forEach((row) => row.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    ans[Number(row.dataset.k)] = Number(b.dataset.v); refresh();
  }));
  ack.addEventListener('change', refresh);
  app.querySelector('[data-act="none"]').addEventListener('click', () => {
    app.querySelectorAll('.hq').forEach((row) => row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === '0')));
    ans.fill(0); refresh();
    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  btn.addEventListener('click', () => {
    db().prefs.health = { date: today(), yes: ans.map((v, k) => (v ? k : -1)).filter((k) => k >= 0) };
    db().prefs.onboarded = true; save();
    go('setup');
  });
}

// (앱) 챌린지를 만든 직후 알림 허용을 묻는다
function notifyAsk() {
  app.innerHTML = `
  <section class="page onboard">
    <header class="ob-head">${obSteps(3)}<span class="eyebrow">마지막 단계 · 알림</span><h1>매일 ${remindLabel(db())}에<br>알려 드릴까요?</h1>
      <p class="muted">운동 전에는 오늘 할 운동과 보상을, 운동 후에는 오늘의 성과를 알려 드려요. 설정에서 언제든 끌 수 있어요.</p></header>
    <div class="ob-bell">${icon('bell')}</div>
    <button class="btn primary big" data-act="yes"><span>알림 받기</span>${icon('arrow')}</button>
    <button class="btn" data-act="no">나중에</button>
  </section>`;
  app.querySelector('[data-act="yes"]').addEventListener('click', async () => {
    db().prefs.notify = await nativeNotifyEnable(); save();
    if (!db().prefs.notify) toast('알림은 설정에서 다시 켤 수 있어요');
    go('home');
  });
  app.querySelector('[data-act="no"]').addEventListener('click', () => { db().prefs.notify = false; save(); go('home'); });
}

// ---------- 이용권(결제) ----------
const trialChip = () => {
  const a = BILL.access();
  if (a.pending) return `<button class="trial-bar" data-act="paywall">${icon('clock')}<span>결제를 확인하고 있어요 · 확인되면 바로 열려요</span></button>`;
  if (a.status === 'trial') return `<button class="trial-bar" data-act="paywall">${icon('gift')}<span>무료 체험 <b>${a.daysLeft === 1 ? '오늘까지' : `${a.daysLeft}일 남음`}</b></span><span class="tb-cta">평생 이용권 ${BILL.PRODUCT.priceLabel}</span></button>`;
  if (a.status === 'expired') return `<div class="note warn"><b>무료 체험이 끝났어요</b><p class="muted">평생 이용권으로 운동을 이어 가세요. 지금까지의 기록은 그대로 볼 수 있어요.</p><button class="btn primary" data-act="paywall">평생 이용권 보기 · ${BILL.PRODUCT.priceLabel}</button></div>`;
  return '';
};

// 지금까지의 내 기록 (이용권 화면에서 "이어 가기"를 권할 때)
function myRecord() {
  const logs = Object.values(db().logs).filter((l) => l.done);
  return { days: logs.length, kcal: Math.round(logs.reduce((n, l) => n + (l.kcal || 0), 0)), min: Math.round(logs.reduce((n, l) => n + (l.sec || 0), 0) / 60), streak: streak() };
}

function paywall(arg = {}) {
  const a = BILL.access();
  const owned = a.status === 'premium' || a.status === 'owner';
  const rec = myRecord();
  const md = (d) => { const x = parse(d); return `${x.getMonth() + 1}월 ${x.getDate()}일`; };
  const head = a.status === 'expired' ? '무료 체험이 끝났어요' : owned ? '평생 이용권을 갖고 있어요' : `무료 체험 ${a.daysLeft === 1 ? '오늘까지' : `${a.daysLeft}일 남음`}`;
  const title = a.status === 'expired' && rec.days ? '여기서 멈추기엔<br>아까운 기록이에요' : '매일 하는 습관,<br>평생 이용권으로';
  app.innerHTML = `
  <section class="page paywall">
    <div class="pw-media">
      ${heroVideo()}
      <button class="icon-btn pw-close" data-act="close" aria-label="닫기">${icon('close')}</button>
    </div>
    <div class="pw-hero">
      <span class="eyebrow">${head}</span>
      <h1>${title}</h1>
    </div>
    ${rec.days ? `<div class="pw-record"><span class="eyebrow">지금까지 내 기록</span>
      <div><b class="num">${rec.days}<small>일</small></b><span>운동한 날</span></div>
      <div><b class="num">${rec.kcal.toLocaleString()}<small>kcal</small></b><span>소모 칼로리</span></div>
      <div><b class="num">${rec.min}<small>분</small></b><span>운동 시간</span></div></div>` : ''}
    <ul class="pw-list">
      <li>${icon('play')}<div><b>실사 코치 영상 + 음성 코칭</b><span>보고 따라 하면 횟수는 앱이 세요</span></div></li>
      <li>${icon('flag')}<div><b>모든 챌린지 프로그램</b><span>컨디션에 맞춰 운동량이 자동으로 바뀌어요</span></div></li>
      <li>${icon('trophy')}<div><b>보상·배지·알림으로 끝까지</b><span>이후 추가되는 기능도 모두 포함</span></div></li>
    </ul>
    ${a.status === 'trial' ? `<ol class="pw-timeline">
      <li class="on"><b>오늘</b><span>모든 기능 무료 체험 중</span></li>
      <li><b>${md(a.endsOn)}</b><span>체험 마지막 날</span></li>
      <li><b>그 후</b><span>자동 결제 없음 · 원할 때만 구매</span></li>
    </ol>` : ''}
    <div class="pw-price"><div><b>${BILL.PRODUCT.priceLabel}</b><span>한 번 결제 · 평생 이용 · 30일 기준 하루 약 330원</span></div><span class="tag">구독 아님</span></div>
    ${a.pending ? '<p class="note">결제를 확인하고 있어요. 확인되면 자동으로 열려요. 잠시 후 다시 확인해 주세요.</p>' : ''}
    ${owned ? `<button class="btn primary big" data-act="close"><span>운동하러 가기</span>${icon('arrow')}</button>`
      : `<button class="btn primary big" data-act="buy"${a.pending ? ' disabled' : ''}><span>${BILL.PRODUCT.priceLabel}에 평생 이용권 구매</span>${icon('arrow')}</button>
         <button class="btn link-btn" data-act="restore">이미 구매했어요 · 구매 복원</button>`}
    ${a.status === 'expired' ? '<button class="btn" data-act="records">구매하지 않고 기록만 보기</button>' : ''}
    <p class="pw-legal">결제는 Google Play 계정으로 처리돼요. 구매 후 7일 이내에는 청약철회할 수 있어요. 다만 유료로 열린 프로그램을 이용하기 시작하면 「전자상거래법」 제17조 제2항에 따라 청약철회가 제한될 수 있어요. 환불은 Google Play 환불 절차를 따라요.</p>
    <p class="legal-links center"><a href="${LEGAL.terms}" target="_blank" rel="noopener">이용약관</a><span class="dot"></span><a href="${LEGAL.privacy}" target="_blank" rel="noopener">개인정보처리방침</a></p>
    ${BILL.isTestPayment() ? '<p class="pw-test">테스트 결제 모드 · 실제로 돈이 나가지 않아요</p>' : ''}
  </section>`;
  startHero();
  const on = (act, fn) => app.querySelectorAll(`[data-act="${act}"]`).forEach((b) => b.addEventListener('click', fn));
  on('close', () => go('home'));
  on('records', () => go('calendar'));
  on('buy', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await BILL.purchase();
    if (r === 'success') { toast('구매 완료! 모든 기능이 열렸어요'); return arg.next ? go('player', arg.next) : go('home'); }
    if (r === 'pending') { await notify('결제가 확인되면 자동으로 열려요. 편의점·계좌 결제는 확인까지 시간이 걸릴 수 있어요.', '결제 확인 중'); return paywall(arg); }
    if (r === 'error') await notify('결제를 완료하지 못했어요. 돈은 빠져나가지 않았어요. 잠시 후 다시 시도해 주세요.', '결제 실패');
    else toast('결제를 취소했어요');
    btn.disabled = false;
  });
  on('restore', async () => {
    if (await BILL.restore()) { toast('구매를 복원했어요'); go('home'); }
    else notify('이 Google 계정으로 구매한 기록을 찾지 못했어요. 구매할 때 쓴 계정으로 로그인했는지 확인해 주세요.', '복원할 구매가 없어요');
  });
}

// 테스트 결제 시트: 실제 Google Play 결제 화면 대신 결과를 골라 흐름을 시험한다
BILL.setTestSheet(() => new Promise((resolve) => {
  const el = document.createElement('div');
  el.className = 'modal sheet';
  el.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <span class="eyebrow">테스트 결제 · 실제 결제 아님</span>
      <h2>${BILL.PRODUCT.name}</h2>
      <p class="modal-msg">${BILL.PRODUCT.priceLabel} · 실제 앱에서는 이 자리에 Google Play 결제 화면이 떠요. 시험할 결과를 고르세요.</p>
      <div class="sheet-btns">
        <button class="btn primary" data-r="success">결제 성공</button>
        <button class="btn ghost" data-r="cancel">사용자가 취소</button>
        <button class="btn ghost" data-r="pending">결제 보류 (편의점·계좌 결제)</button>
        <button class="btn ghost" data-r="error">결제 오류</button>
      </div>
    </div>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b && e.target !== el) return;
    el.remove(); resolve(b ? b.dataset.r : 'cancel');
  });
  document.body.append(el);
}));

// 설정 맨 아래 테스트 메뉴 (출시용 빌드에는 없다)
function testMenuBlock() {
  if (!FLAGS.testMenu) return '';
  const a = BILL.access(), b = db().billing || {};
  const label = { owner: '개발자 모드(모두 열림)', premium: '구매함', trial: `체험 중 · ${a.daysLeft}일 남음`, expired: '체험 끝' }[a.status];
  return `
      <div class="block set test-menu">
        <div class="block-head"><h2>${icon('sparkle')}테스트 메뉴</h2><span class="muted small">출시 빌드에는 안 보여요</span></div>
        <p class="muted small">지금 상태: <b>${label}</b>${a.pending ? ' · 결제 보류 중' : ''}${b.test?.storeOwned ? ' · 계정에 구매 기록 있음' : ''}</p>
        ${FLAGS.ownerUnlocked ? `<label class="switch"><span>판매 모드 미리보기 (체험·결제 화면 켜기)</span><input type="checkbox" data-t="toggleSalesPreview" ${b.test?.salesPreview ? 'checked' : ''}></label>` : ''}
        <div class="test-grid">
          <button class="btn ghost small" data-t="trialFresh">체험 처음부터 (7일)</button>
          <button class="btn ghost small" data-t="trialLastDay">체험 마지막 날로</button>
          <button class="btn ghost small" data-t="trialExpire">체험 끝내기</button>
          <button class="btn ghost small" data-t="paywall">결제 화면 열기</button>
          <button class="btn ghost small" data-t="approvePending">보류 결제 승인</button>
          <button class="btn ghost small" data-t="reinstall">앱 재설치 흉내 (복원 시험)</button>
          <button class="btn ghost small" data-t="refund">환불 처리</button>
          <button class="btn ghost small" data-t="resetAll">결제 상태 초기화</button>
          <button class="btn ghost small" data-t="onboarding">첫 실행 안내 다시 보기</button>
        </div>
      </div>`;
}
function bindTestMenu() {
  app.querySelectorAll('.test-menu [data-t]').forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'click', () => {
    const t = el.dataset.t;
    if (t === 'paywall') return go('paywall');
    if (t === 'onboarding') { db().prefs.onboarded = false; save(); return go('welcome'); }
    BILL.testTools[t]();
    toast('적용했어요'); settings();
    app.querySelector('.test-menu')?.scrollIntoView({ block: 'center' });
  }));
}

// ---------- 홈 ----------
function ticks(c, t) {
  let html = '';
  for (let k = 0; k < c.days; k++) {
    const d = addDays(c.start, k);
    const l = db().logs[d];
    let cls = l?.done ? 'done' : l?.partial ? 'partial' : diffDays(d, t) > 0 ? 'missed' : '';
    if (d === t) cls += ' now';
    html += `<i class="${cls}" style="--k:${k}"></i>`;
  }
  return `<div class="ticks" aria-hidden="true">${html}</div>`;
}

// 홈 상단: 레벨·코인·방어권
function statusBar() {
  const L = RW.levelInfo(); const r = db().rewards;
  return `<button class="status" data-go-to="rewards" aria-label="보상 보기">
    <span class="lv"><b>Lv.${L.lv}</b> ${L.title}</span>
    <span class="xpbar"><i style="width:${Math.round(L.pct * 100)}%"></i></span>
    <span class="coins">${icon('coin')}<b class="num" data-count="${r.coins}">${r.coins.toLocaleString()}</b></span>
    <span class="shields" title="스트릭 방어권">${icon('shield')}<b class="num">${r.shields}</b></span>
  </button>`;
}

function missionsBlock(compact = true) {
  const w = RW.weeklyMissions();
  return `<div class="block t-teal">
    <div class="block-head"><h2>${icon('target')}이번 주 미션</h2><span class="muted small">${w.claimed ? '보상 받음' : w.allDone ? '보상을 받으세요' : '모두 하면 +200 코인'}</span></div>
    <ul class="missions">${w.list.map((m) => `<li class="${m.done ? 'done' : ''}">
      <span class="m-label">${m.done ? icon('check') : ''}${m.label}</span>
      <span class="num">${m.value.toLocaleString()}<small> / ${m.target.toLocaleString()}${m.unit}</small></span>
      <span class="bar"><i style="width:${(m.value / m.target) * 100}%"></i></span></li>`).join('')}</ul>
    ${w.allDone && !w.claimed ? `<button class="btn primary big" data-act="claim"><span>주간 보상 받기</span>${icon('gift')}</button>` : ''}
  </div>`;
}

// 홈용 한 줄 미션 요약 (보상을 받을 수 있을 때만 전체 카드)
function missionsLine() {
  const w = RW.weeklyMissions();
  if (w.allDone && !w.claimed) return missionsBlock();
  const n = w.list.filter((m) => m.done).length;
  return `<button type="button" class="mission-line" data-go-to="rewards" data-anchor="challenge">${icon('target')}
    <span class="ml-text"><b>이번 주 미션 ${n} / ${w.list.length}</b><small>${w.claimed ? '이번 주 보상을 받았어요' : '모두 하면 +200 코인'}</small></span>
    <span class="ml-bars">${w.list.map((m) => `<i style="--p:${Math.min(1, m.value / m.target)}"></i>`).join('')}</span>${icon('next')}</button>`;
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
    <div class="today hero-today">
      <span class="eyebrow">시작까지</span>
      <div class="day-big"><span class="d">D-${diffDays(t, c.start)}</span></div>
      <p class="muted">${dateLabel(c.start)}에 Day 1이 시작돼요. 동작을 미리 익혀 두세요.</p>
    </div>
    <div class="block"><div class="block-head"><h2>${icon('list')}Day 1 루틴</h2></div>${itemList(dayPlan(c, 0))}</div>`;
  } else if (i == null) {
    body = `
    <div class="today hero-today">
      <span class="eyebrow">챌린지 완주</span>
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
    <div class="today hero-today">
      <div class="today-top">
        <span class="eyebrow">${stamp(t)}</span>
        <span class="streak">${icon('flame')}<span class="num" data-count="${st}">${st}</span>일 연속</span>
      </div>
      <div class="day-big"><span class="d" data-count="${i + 1}" data-pad="2">${pad2(i + 1)}</span><span class="of">/ ${c.days}</span></div>
      ${ticks(c, t)}
      <div class="ticks-legend"><span>DAY 1 · ${dateShort(c.start)}</span><span>${doneCount}일 완료</span><span>DAY ${c.days} · ${dateShort(end)}</span></div>
    </div>

    <div class="plan-title">
      <span><span class="tag">${plan.tag}</span></span>
      <h2>${plan.title}</h2>
      <div class="plan-meta"><span>${plan.items.length}개 동작</span><span class="dot"></span><span>약 ${minText(estimateSec(plan))}</span>${plan.adapt !== 1 ? `<span class="dot"></span><span class="adapt-chip ${plan.adapt < 1 ? 'down' : 'up'}">운동량 ${Math.round(plan.adapt * 100)}%</span>` : ''}</div>
      ${c.adaptNote && diffDays(c.adaptNote.date, t) <= 1 && !log?.done ? `<p class="adapt-note">${ADAPT_REASON[c.adaptNote.reason] || ''} 오늘 운동량을 ${Math.round(Math.abs(c.adaptNote.to - c.adaptNote.from) * 100)}% ${c.adaptNote.to < c.adaptNote.from ? '줄였어요' : '늘렸어요'}.</p>` : ''}
      ${log?.done
        ? `<p class="done-line">${icon('check')} 오늘 운동을 마쳤어요 · ${minText(log.sec)} · ${log.kcal}kcal</p>
           <button class="btn ghost big" data-act="start" data-date="${t}"><span>한 번 더 하기</span>${icon('arrow')}</button>`
        : `<p class="cheer">${comeback ? '다시 왔네요. 오늘 끝내면 기본 코인이 2배예요.' : CHEERS[i % CHEERS.length]}</p>
           <button class="btn primary big" data-act="start" data-date="${t}"><span>${log?.partial ? '이어서 다시 하기' : '오늘 운동 시작'}</span><span class="btn-reward">${icon('coin')}+${preview}</span></button>
           ${miniLeft ? `<button class="btn ghost mini-btn" data-act="mini" data-date="${t}"><span>컨디션이 안 좋다면 <b>7분 미니 운동</b></span><small>이번 주 1번</small></button>` : ''}`}
    </div>

    ${usedShields ? `<div class="note good"><b>스트릭 방어권 ${usedShields}개를 썼어요</b><p class="muted">놓친 날을 메워서 연속 기록이 이어져요. 남은 방어권 ${db().rewards.shields}개.</p></div>` : ''}
    ${photoDay ? `<div class="note"><b>오늘은 몸 사진 찍는 날 · Day ${i + 1}</b><p class="muted">같은 자리, 같은 각도로 찍어 두면 변화 리포트에서 Day 1과 나란히 비교해 줘요.</p>
      <button class="btn ghost" data-go-to="rewards" data-anchor="report">${icon('camera')} 사진 기록하러 가기</button></div>` : ''}

    ${doneCount >= 3 && daysSince(db().prefs.lastBackup) >= 7 ? `<div class="note"><b>${db().prefs.lastBackup ? `백업한 지 ${daysSince(db().prefs.lastBackup)}일 지났어요` : '아직 백업한 적이 없어요'}</b><p class="muted">기록·코인·몸 사진은 이 폰에만 있어요. ${isNative() ? '구글 드라이브나 내 파일' : '파일 앱(iCloud Drive)'}에 한 번 저장해 두세요.</p><button class="btn ghost" data-act="backup">${icon('download')} 지금 백업하기</button></div>` : ''}
    ${missedY ? `<div class="note"><b>어제 Day ${yi + 1}을 놓쳤어요</b><p class="muted">오늘 안에 보충하면 연속 기록이 이어져요.</p>
      <button class="btn ghost" data-act="start" data-date="${y}">어제 운동 보충하기</button></div>` : ''}

    ${missionsLine()}

    ${isChallengeDay ? `<div class="note good"><b>오늘은 도전 데이</b><p class="muted">가벼운 회복 루틴을 끝내고, 한 동작으로 최고 기록에 도전해 보세요. 기록을 깨면 +50 코인.</p>
      <button class="btn ghost" data-go-to="rewards" data-anchor="pr">${icon('trophy')} 최고 기록 도전하기</button></div>` : ''}

    <div class="block">
      <div class="block-head"><h2>${icon('list')}오늘의 루틴</h2><span class="muted small">세트 사이 휴식 ${plan.rest}초</span></div>
      ${itemList(plan)}
      ${next ? `<div class="next-day"><span>내일 · Day ${i + 2}</span><b>${next.title}</b></div>` : ''}
    </div>`;
  }

  app.innerHTML = `<section class="page"><header class="page-head">${wordmark()}${installBtn()}</header>${statusBar()}${c ? trialChip() : ''}${body}</section>`;
  drawThumbs();
  bindInstall();
  bindCommon(home);
  app.querySelectorAll('[data-act="start"]').forEach((b) => b.addEventListener('click', () => go('player', { date: b.dataset.date })));
  app.querySelector('[data-act="backup"]')?.addEventListener('click', async () => { if (await backupNow()) { toast('백업했어요'); home(); } });
  app.querySelector('[data-act="mini"]')?.addEventListener('click', (e) => go('player', { date: e.currentTarget.dataset.date, mini: true }));
  app.querySelector('[data-act="new"]')?.addEventListener('click', () => { db().challenge = null; save(); go('setup'); });
  app.querySelectorAll('[data-act="paywall"]').forEach((b) => b.addEventListener('click', () => go('paywall')));
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
      if (!r.full && !mini) adjustAdapt(date, 0.95, 'skip');
      go('finish', { date, r, award });
    },
    onExit: (r) => {
      saveLog(date, r, false);
      const award = RW.awardWorkout(date, r);
      if (r.ratio < 1) adjustAdapt(date, 0.95, 'quit');
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
      <div class="display">Day ${pad2(dayIndex(date) + 1)}<em>완료</em></div>
      ${milestone}
    </div>
    <div class="stat-grid rise">
      <div><b>${Math.max(1, Math.round(r.sec / 60))}<small>분</small></b><span>운동 시간</span></div>
      <div><b><span data-count="${r.kcal}">${r.kcal}</span><small>kcal</small></b><span>소모 칼로리</span></div>
      <div><b><span data-count="${total}">${total}</span></b><span>총 횟수</span></div>
      <div><b>${st}<small>일</small></b><span>연속 기록</span></div>
    </div>
    <button class="btn ghost big share-btn rise" data-act="share" type="button"><span>오늘 기록 이미지로 공유하기</span>${icon('share')}</button>

    <div class="block rise">
      <div class="block-head"><h2>${icon('coin')}오늘 받은 보상</h2><span class="num earn">${icon('coin')} +<span data-count="${award.coins}">${award.coins}</span></span></div>
      <ul class="earn-list">${earnLines}</ul>
      <div class="lvline"><span><b>Lv.${L.lv}</b> ${L.title}</span><span class="xpbar"><i style="width:${Math.round(L.pct * 100)}%"></i></span><span class="muted small num">${L.into} / ${L.need} XP</span></div>
      ${award.levelUp ? `<p class="levelup">레벨 업! Lv.${award.levelUp.from} → Lv.${award.levelUp.to} · ${L.titleKo}</p>` : ''}
      ${badgeHtml ? `<div class="new-badges">${badgeHtml}</div>` : ''}
    </div>

    ${cardOpen ? `<div class="block" id="cardBlock">
      <div class="block-head"><h2>${icon('gift')}보상 카드</h2><span class="muted small">한 장을 골라 뒤집으세요</span></div>
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
    const tierName = card.tier === 'legend' ? '전설' : card.tier === 'rare' ? '희귀' : '일반';
    b.querySelector('.front').innerHTML = `<small>${tierName}</small><b>${card.label}</b>`;
    b.classList.add('flipped', card.tier);
    app.querySelectorAll('.card-flip').forEach((x) => { if (x !== b) x.classList.add('dim'); });
    app.querySelector('#cardMsg').textContent = card.tier === 'legend' ? '전설 카드! 오늘 운이 좋네요.' : card.tier === 'rare' ? '희귀 카드를 뽑았어요.' : '내일 또 뽑을 수 있어요.';
    if (card.badges?.length) toast(`새 배지: ${card.badges.map((x) => x.name).join(', ')}`);
  });
  app.querySelector('[data-act="share"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const c = db().challenge;
      const done = Array.from({ length: c.days }, (_, k) => !!db().logs[addDays(c.start, k)]?.done);
      const blob = await drawShareCard({ day: dayIndex(date) + 1, days: c.days, done, min: Math.max(1, Math.round(r.sec / 60)), kcal: r.kcal, total, streak: st, title: dayPlan(c, dayIndex(date)).title, dateLabel: stamp(date) });
      await shareCard(blob, `오늘홈트-day${dayIndex(date) + 1}.png`);
    } catch { notify('이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    btn.disabled = false;
  });
  app.querySelector('#cond').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    app.querySelectorAll('#cond button').forEach((x) => x.classList.toggle('on', x === b));
  });
  app.querySelector('#f').addEventListener('submit', (e) => {
    e.preventDefault();
    const log = db().logs[date];
    log.condition = app.querySelector('#cond .on')?.dataset.v || log.condition || null;
    if (log.condition === 'hard') adjustAdapt(date, 0.9, 'hard');
    if (log.condition === 'easy') adjustAdapt(date, 1.1, 'easy');
    log.memo = app.querySelector('#memo').value.trim();
    const w = Number(app.querySelector('#w').value);
    if (w) db().weights[date] = w;
    save(); go('home');
    // 저녁 8시 알림이 이미 지난 뒤에 운동을 마쳤다면, 오늘의 성과 알림을 지금 보낸다 (8시 전이면 8시 알림이 성과를 정리해 준다)
    const rt = remindAt(db()), nowD = new Date();
    const afterRemind = isNative() ? nowD.getHours() * 60 + nowD.getMinutes() >= rt.h * 60 + rt.m : nowD.getHours() >= PUSH_HOUR;
    if (afterRemind && !db().rewards.recapSent?.[date]) {
      (isNative() ? nativeShowNow(db()) : webShowNow(db())).then((ok) => { if (ok) { (db().rewards.recapSent ||= {})[date] = true; save(); } });
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
    <div class="block detail">${detail}</div>
  </section>`;
  drawThumbs();
  app.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(Y, M - 1 + Number(b.dataset.m), 1);
    calMonth = fmt(d).slice(0, 7); clearThumbs(); calendar();
  }));
  app.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { clearThumbs(); calendar(b.dataset.d); }));
  app.querySelector('[data-start]')?.addEventListener('click', (e) => go('player', { date: e.currentTarget.dataset.start }));
}

// ---------- 운동량 자동 조절 ----------
// 컨디션(힘들었어요/가뿐했어요)과 완주 여부로 다음 운동량을 ±5~10% 바꾼다. 하루에 한 번만.
function adjustAdapt(date, factor, reason) {
  const c = db().challenge;
  if (!c || db().prefs.autoAdapt === false) return;
  c.adaptDone ||= {};
  if (c.adaptDone[date]?.includes(reason)) return;
  const from = c.adapt || 1;
  const to = Math.round(Math.min(ADAPT_MAX, Math.max(ADAPT_MIN, from * factor)) * 100) / 100;
  (c.adaptDone[date] ||= []).push(reason);
  if (to === from) return save();
  c.adapt = to;
  c.adaptNote = { date, from, to, reason };
  save();
}
const ADAPT_REASON = { hard: '지난 운동이 힘들었다고 해서', easy: '지난 운동이 가뿐했다고 해서', skip: '지난 운동에서 세트를 건너뛰어서', quit: '지난 운동을 중간에 멈춰서' };

// ---------- 백업 (사진 포함) ----------
const daysSince = (d) => (d ? diffDays(d, today()) : Infinity);
async function backupNow() {
  const data = JSON.parse(JSON.stringify(db()));
  data.photoData = {};
  for (const d of Object.keys(db().rewards.photos || {})) {
    const b = await loadBlob('photo:' + d).catch(() => null);
    if (b) data.photoData[d] = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  }
  const name = `오늘홈트-백업-${today()}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (isNative()) {
    if (!(await nativeShareFile(name, JSON.stringify(data), '오늘홈트 백업'))) return false;
    db().prefs.lastBackup = today(); save();
    return true;
  }
  let done = false;
  // 아이폰: 공유 시트 → "파일에 저장"으로 iCloud Drive에 바로 저장
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '오늘홈트 백업' }); done = true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  if (!done) download(name, await file.text(), 'application/json');
  db().prefs.lastBackup = today(); save();
  return true;
}
async function restoreFrom(d) {
  const photos = d.photoData || {};
  delete d.photoData;
  replaceAll(d);
  for (const [date, url] of Object.entries(photos)) {
    const blob = await (await fetch(url)).blob();
    await saveBlob('photo:' + date, blob);
  }
}

// ---------- 오프라인용으로 모두 받기 ----------
const OFFLINE_FILES = () => [
  ...Object.values(MEDIA).flatMap((m) => [m.src, m.poster]),
  ...Object.keys(LINES).map((k) => `media/voice/${k}.mp3`),
  'media/silence.mp3',
];
async function offlineStatus() {
  if (!('caches' in window)) return { have: 0, total: OFFLINE_FILES().length };
  const files = OFFLINE_FILES();
  let have = 0;
  for (const u of files) if (await caches.match(new URL(u, location.href).pathname)) have++;
  return { have, total: files.length };
}
async function downloadAll(onProgress) {
  const files = OFFLINE_FILES();
  let n = 0, failed = 0;
  const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      try { const r = await fetch(u); if (!r.ok) failed++; else await r.arrayBuffer(); } catch { failed++; }
      onProgress(++n, files.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return failed;
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

// 보상 화면 탭: 보상(코인·교환) / 도전(미션·기록·변화) / 배지
const RTABS = [['reward', '보상'], ['challenge', '도전·기록'], ['badge', '배지']];
let rewardsTab = 'reward';
function rewards(anchor) {
  if (anchor === 'pr' || anchor === 'report' || anchor === 'challenge') rewardsTab = 'challenge';
  else if (RTABS.some(([k]) => k === anchor)) rewardsTab = anchor;
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
    <div class="seg wide rtabs" id="rTabs" role="tablist">${RTABS.map(([k, v]) => `<button type="button" role="tab" data-tab-btn="${k}" class="${rewardsTab === k ? 'on' : ''}">${v}</button>`).join('')}</div>

    <div class="wallet" data-tab="reward">
      <div class="wallet-coins"><span class="eyebrow">코인</span><b class="num" data-count="${r.coins}">${r.coins.toLocaleString()}</b></div>
      <div class="wallet-side">
        <div><span class="eyebrow">레벨</span><b class="num">${L.lv}</b><small>${L.titleKo}</small></div>
        <div><span class="eyebrow">방어권</span><b class="num">${r.shields}<small>/ ${RW.MAX_SHIELDS}</small></b><small>놓친 날 메우기</small></div>
      </div>
      <div class="lvline"><span class="xpbar"><i style="width:${Math.round(L.pct * 100)}%"></i></span><span class="muted small num">다음 레벨까지 ${L.need - L.into} XP</span></div>
      <p class="muted small">방어권은 7일 연속할 때마다 1개씩 받아요(최대 2개). 하루를 놓치면 이틀 뒤 자동으로 써서 연속 기록을 지켜 줘요.</p>
    </div>

    <div class="block" data-tab="reward">
      <div class="block-head"><h2>${icon('gift')}내가 정한 보상</h2><span class="muted small">코인으로 교환</span></div>
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

    <div class="block flat" data-tab="reward">
      <div class="block-head"><h2>${icon('box')}보상함</h2><span class="muted small">교환한 보상</span></div>
      ${redeemed}
    </div>

    <div class="tabwrap" data-tab="challenge">${missionsBlock(false)}</div>

    <div class="block t-teal" id="pr" data-tab="challenge">
      <div class="block-head"><h2>${icon('trophy')}최고 기록 도전</h2><span class="muted small">기록을 깨면 +50 코인</span></div>
      <ul class="ex-list pr-list">${prRows}</ul>
    </div>

    <div class="block t-violet" id="report" data-tab="challenge">
      <div class="block-head"><h2>${icon('camera')}변화 리포트</h2><span class="muted small">사진은 이 폰에만 저장돼요</span></div>
      <div class="compare">
        <figure><div class="ph" id="phFirst">${firstPhoto ? '' : '<span>첫 사진</span>'}</div><figcaption>${firstPhoto ? `처음 · ${dateShort(firstPhoto)}` : '처음'}</figcaption></figure>
        <figure><div class="ph" id="phLast">${lastPhoto && lastPhoto !== firstPhoto ? '' : '<span>최근 사진</span>'}</div><figcaption>${lastPhoto && lastPhoto !== firstPhoto ? `최근 · ${dateShort(lastPhoto)}` : '최근'}</figcaption></figure>
      </div>
      <div class="kv"><span>운동한 날 <b>${doneDays}일</b></span><span>체중 <b>${w0 && w1 ? `${w0} → ${w1}kg (${(w1 - w0 > 0 ? '+' : '') + (w1 - w0).toFixed(1)})` : '기록 없음'}</b></span></div>
      <label class="btn ghost big"><span>${r.photos[today()] ? '오늘 사진 다시 찍기' : '오늘 몸 사진 기록'}</span>${icon('camera')}<input type="file" accept="image/*" id="photoIn" hidden></label>
      <p class="muted small">Day 1, 7, 14, 30에 같은 자리·같은 각도로 찍으면 변화가 잘 보여요. 매주 첫 사진은 +30 코인.</p>
    </div>

    <div class="block" data-tab="badge">
      <div class="block-head"><h2>${icon('medal')}배지</h2><span class="muted small">${badgeCount} / ${RW.BADGES.length}</span></div>
      <ul class="badges">${badges}</ul>
    </div>

    <div class="block flat" data-tab="reward">
      <div class="block-head"><h2>${icon('clock')}최근 적립</h2></div>
      ${ledger ? `<ul class="ledger">${ledger}</ul>` : '<p class="muted small">운동을 마치면 여기에 쌓여요.</p>'}
    </div>
  </section>`;
  drawThumbs();
  bindCommon(rewards);
  const showTab = (t) => {
    rewardsTab = t;
    app.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('hidden', el.dataset.tab !== t));
    app.querySelectorAll('[data-tab-btn]').forEach((b) => { b.classList.toggle('on', b.dataset.tabBtn === t); b.setAttribute('aria-selected', b.dataset.tabBtn === t); });
  };
  showTab(rewardsTab);
  app.querySelector('#rTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab-btn]'); if (b) { showTab(b.dataset.tabBtn); window.scrollTo(0, 0); } });

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

  if (anchor === 'pr' || anchor === 'report') requestAnimationFrame(() => app.querySelector('#' + anchor)?.scrollIntoView({ block: 'start' }));
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
      <div><b><span data-count="${done}">${done}</span><small>/ ${c.days}</small></b><span>완료한 날</span></div>
      <div><b><span data-count="${rate}">${rate}</span><small>%</small></b><span>달성률</span></div>
      <div><b>${streak()}<small>일</small></b><span>현재 연속 · 최고 ${bestStreak()}일</span></div>
      <div><b><span data-count="${Math.round(sec / 60)}">${Math.round(sec / 60)}</span><small>분</small></b><span>총 운동 시간</span></div>
      <div><b><span data-count="${kcal}">${kcal.toLocaleString()}</span></b><span>총 소모 kcal</span></div>
      <div><b>${dw == null ? '–' : (dw > 0 ? '+' : '') + dw.toFixed(1)}<small>kg</small></b><span>체중 변화</span></div>
    </div>
    <div class="block">
      <div class="block-head"><h2>${icon('scale')}체중</h2>
        <div class="seg mini" id="wRange"><button type="button" data-v="fit" class="${weightRange === 'fit' ? 'on' : ''}">기록 기간</button><button type="button" data-v="all" class="${weightRange === 'all' ? 'on' : ''}">챌린지 전체</button></div></div>
      ${w0 && wNow ? `<p class="w-sum">시작 <b>${w0}</b> → 지금 <b>${wNow}kg</b> <span class="${dw <= 0 ? 'good' : 'bad'}">(${(dw > 0 ? '+' : '') + dw.toFixed(1)})</span>${c.goalWeight ? ` · 목표까지 <b>${Math.max(0, wNow - c.goalWeight).toFixed(1)}kg</b>` : ''}</p>` : ''}
      ${weightChart(c)}
      <form id="wf" class="inline-form">
        <input type="date" id="wd" value="${today()}" aria-label="날짜"><input type="number" step="0.1" inputmode="decimal" id="wv" placeholder="kg" aria-label="체중">
        <button class="btn primary" type="submit">기록</button>
      </form>
    </div>
    <div class="block flat">
      <div class="block-head"><h2>${icon('stats')}동작별 누적</h2></div>
      ${Object.keys(reps).length ? `<ul class="rep-list">${Object.entries(reps).sort((a, b) => b[1] - a[1]).map(([id, n]) =>
        `<li><span>${EXERCISES[id].name}</span><b>${n.toLocaleString()}<span class="muted small"> ${EXERCISES[id].type === 'hold' ? '초' : '회'}</span></b>
        <span class="bar"><i style="width:${(n / maxRep) * 100}%"></i></span></li>`).join('')}</ul>`
        : '<p class="muted">아직 기록이 없어요. 첫 운동을 마치면 여기에 쌓여요.</p>'}
    </div>
  </section>`;
  app.querySelector('#wRange').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { weightRange = b.dataset.v; stats(); } });
  app.querySelector('#wf').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Number(app.querySelector('#wv').value);
    if (!v) return;
    db().weights[app.querySelector('#wd').value || today()] = v; save(); stats();
  });
}

// 체중 그래프: 기본은 기록이 있는 기간에 맞춰 크게(fit), 바꾸면 챌린지 전체(all). 세로축은 기록 범위에 맞춘다.
let weightRange = 'fit';
function weightChart(c) {
  const pts = Object.entries(db().weights).sort(([a], [b]) => (a < b ? -1 : 1));
  if (pts.length < 1) return `<div class="empty-state">${icon('scale')}<b>체중을 기록하면 그래프가 그려져요</b><span>아래에 오늘 체중을 넣어 보세요. 일주일에 한두 번이면 충분해요.</span></div>`;
  const W = 340, H = 170, L = 38, Rr = 14, T = 22, B = 26;
  const vals = pts.map(([, v]) => v);
  const goalIn = c.goalWeight && c.goalWeight >= Math.min(...vals) - 1.5 && c.goalWeight <= Math.max(...vals) + 1.5;
  const all = goalIn ? vals.concat(c.goalWeight) : vals;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1.6) { const m = (hi + lo) / 2; lo = m - 0.8; hi = m + 0.8; }
  lo = Math.floor((lo - 0.2) * 2) / 2; hi = Math.ceil((hi + 0.2) * 2) / 2;
  const d0 = weightRange === 'all' ? c.start : pts[0][0];
  const span = weightRange === 'all' ? Math.max(c.days - 1, 1) : Math.max(diffDays(pts[0][0], pts.at(-1)[0]), 6);
  const x = (d) => L + (clamp(diffDays(d0, d), 0, span) / span) * (W - L - Rr);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const xy = pts.map(([d, v]) => [x(d), y(v)]);
  const line = xy.map(([p, q]) => `${p.toFixed(1)},${q.toFixed(1)}`).join(' ');
  const area = `${xy[0][0].toFixed(1)},${(H - B).toFixed(1)} ${line} ${xy.at(-1)[0].toFixed(1)},${(H - B).toFixed(1)}`;
  const ticks = [lo, (lo + hi) / 2, hi];
  const md = (d) => { const t = parse(d); return `${t.getMonth() + 1}/${t.getDate()}`; };
  const last = pts.at(-1), [lx, ly] = xy.at(-1);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="체중 그래프, 최근 ${last[1]}kg">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 3.5}" class="ax" text-anchor="end">${v.toFixed(1)}</text>`).join('')}
    <text x="${L - 6}" y="${T - 9}" class="ax" text-anchor="end">kg</text>
    ${goalIn ? `<line x1="${L}" x2="${W - Rr}" y1="${y(c.goalWeight)}" y2="${y(c.goalWeight)}" class="goal"/><text x="${W - Rr}" y="${y(c.goalWeight) - 5}" class="ax goal-t" text-anchor="end">목표 ${c.goalWeight}kg</text>` : ''}
    ${pts.length > 1 ? `<polygon points="${area}" class="area"/><polyline points="${line}" class="wline"/>` : ''}
    ${xy.slice(0, -1).map(([p, q]) => `<circle cx="${p}" cy="${q}" r="2.6" class="wdot"/>`).join('')}
    <circle cx="${lx}" cy="${ly}" r="4.8" class="wlast"/>
    <text x="${clamp(lx, L + 24, W - Rr - 4)}" y="${ly - 10}" class="ax wval" text-anchor="${lx > W - 60 ? 'end' : 'middle'}">${last[1]}kg</text>
    <text x="${L}" y="${H - 8}" class="ax">${weightRange === 'all' ? 'DAY 1' : md(pts[0][0])}</text>
    <text x="${W - Rr}" y="${H - 8}" class="ax" text-anchor="end">${weightRange === 'all' ? `DAY ${c.days}` : md(addDays(pts[0][0], span))}</text>
  </svg>`;
}

// ---------- 설정 ----------
// 첫 화면은 묶음별 목록(내 챌린지 / 알림·운동 / 화면 / 데이터 / 정보). 자주 안 쓰는 항목은 하위 화면(sub)으로 연다.
const LEGAL = {
  terms: 'https://can37199-code.github.io/home-workout/terms.html',
  privacy: 'https://can37199-code.github.io/home-workout/privacy.html',
};
const MUSIC_LABEL = () => (db().prefs.music.style === 'mine' ? '내 음악 파일' : STYLES[db().prefs.music.style]?.label || '끔');
const srow = ({ ico, title, sub = '', trail = '', act = '', subPage = '', href = '', danger = false, id = '' }) => {
  const inner = `<span class="sico">${icon(ico)}</span><span class="stext"><b>${title}</b>${sub ? `<span${id ? ` id="${id}"` : ''}>${sub}</span>` : ''}</span>${trail}`;
  if (href) return `<a class="srow" href="${href}" target="_blank" rel="noopener">${inner}${icon('next')}</a>`;
  if (act || subPage) return `<button type="button" class="srow${danger ? ' danger' : ''}" ${act ? `data-act="${act}"` : `data-sub="${subPage}"`}>${inner}${trail ? '' : icon('next')}</button>`;
  return `<div class="srow">${inner}</div>`;
};
const sgroup = (title, rows) => `<div class="sgroup"><span class="sgroup-title">${title}</span><div class="sgroup-box">${rows.join('')}</div></div>`;
const toggle = (id, on) => `<span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} aria-label="켜기/끄기"></span>`;

function settings(sub) {
  if (sub) return settingsSub(sub);
  const c = db().challenge;
  const p = db().prefs;
  const a = BILL.access();
  const adaptPct = Math.round((c.adapt || 1) * 100);
  app.innerHTML = `
  <section class="page settings-page">
    <header class="page-head"><h1>설정</h1></header>
    ${sgroup('내 챌린지', [
      srow({ ico: 'flag', title: `${programOf(c).name} · ${c.days}일 · ${LEVELS[c.level].label}`, sub: `${dateLabel(c.start)} 시작 · 매일 ${remindLabel(db())}`, act: 'edit', trail: '<span class="strail">바꾸기</span>' }),
      a.status !== 'owner' ? srow({ ico: 'gift', title: '이용권', sub: { premium: '평생 이용권 보유', trial: `무료 체험 ${a.daysLeft}일 남음`, expired: '무료 체험 끝' }[a.status], act: 'paywall' }) : '',
    ])}
    ${sgroup('알림·운동', [
      isNative()
        ? srow({ ico: 'bell', title: '매일 운동 알림', sub: '확인하는 중…', id: 'notifyStatus', trail: toggle('notifyOn', false) })
        : srow({ ico: 'bell', title: '푸시 알림', sub: '매일 저녁 8시쯤', subPage: 'push' }),
      srow({ ico: 'calendar', title: '캘린더에 운동 일정 넣기', sub: '폰 캘린더에 매일 반복 일정', subPage: 'calendar' }),
      srow({ ico: 'play', title: '음성으로 횟수 세기', sub: '동작이 끝날 때마다 숫자를 불러 줘요', trail: toggle('voice', p.voice) }),
      srow({ ico: 'music', title: '배경음악', sub: MUSIC_LABEL(), subPage: 'music' }),
      srow({ ico: 'sparkle', title: '운동량 자동 조절', sub: `지금 ${adaptPct}% · 컨디션에 맞춰 바뀌어요`, subPage: 'adapt' }),
    ])}
    ${sgroup('화면', [`<div class="srow col"><span class="stext"><b>화면 테마</b><span>운동 화면은 항상 어두운 화면이에요</span></span>
        <div class="seg wide" id="theme">${[['system', '시스템 설정'], ['light', '라이트'], ['dark', '다크']].map(([k, v]) => `<button type="button" data-v="${k}" class="${(p.theme || 'system') === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>`])}
    ${sgroup('데이터', [
      srow({ ico: 'download', title: '백업', sub: p.lastBackup ? `마지막 백업 ${daysSince(p.lastBackup) === 0 ? '오늘' : daysSince(p.lastBackup) + '일 전'}` : '아직 백업한 적이 없어요', subPage: 'backup' }),
      !isNative() ? srow({ ico: 'download', title: '오프라인용으로 받기', sub: '인터넷 없이 운동하기', subPage: 'offline' }) : '',
      srow({ ico: 'trash', title: '모든 기록 지우기', act: 'reset', danger: true }),
    ])}
    ${sgroup('정보', [
      srow({ ico: 'dumbbell', title: '동작 도감', sub: `${Object.keys(EXERCISES).length}개 동작과 자세 포인트`, subPage: 'library' }),
      srow({ ico: 'sparkle', title: 'AI 코치·음성·글꼴 안내', subPage: 'about' }),
      srow({ ico: 'list', title: '이용약관', href: LEGAL.terms }),
      srow({ ico: 'list', title: '개인정보처리방침', href: LEGAL.privacy }),
    ])}
    <p class="version">${wordmark('sm')}<span>버전 1.0.0 · 기록은 이 폰에만 저장돼요</span></p>
${testMenuBlock()}
  </section>`;
  app.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => go('settings', b.dataset.sub)));
  const on = (act, fn) => app.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
  on('edit', () => go('setup'));
  on('paywall', () => go('paywall'));
  on('reset', () => {
    ask('모든 기록 지우기', '정말 모든 기록과 설정을 지울까요? 되돌릴 수 없어요. 먼저 백업 파일을 저장해 두는 걸 권해요.', '모두 지우기', { danger: true })
      .then((y) => { if (y) { resetAll(); go('setup'); } });
  });
  bindTestMenu();
  app.querySelector('#voice').addEventListener('change', (e) => { p.voice = e.target.checked; save(); });
  app.querySelector('#theme').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    p.theme = b.dataset.v; save(); applyTheme();
    app.querySelectorAll('#theme button').forEach((x) => x.classList.toggle('on', x === b));
  });

  // 앱: 폰 예약 알림 (켜기/끄기 스위치)
  if (isNative()) {
    const st = app.querySelector('#notifyStatus'), sw = app.querySelector('#notifyOn');
    const refresh = async () => {
      const perm = await nativeNotifyPermission();
      const onNow = p.notify === true && perm === 'granted';
      sw.checked = onNow;
      st.textContent = perm === 'denied' ? '폰 설정 → 애플리케이션 → 오늘홈트 → 알림에서 허용해 주세요'
        : onNow ? `매일 ${remindLabel(db())}쯤 · 운동 전엔 독려, 운동 후엔 성과` : '꺼져 있어요';
    };
    refresh();
    sw.addEventListener('change', async () => {
      if (!sw.checked) p.notify = false;
      else if (await nativeNotifyEnable()) { p.notify = true; nativeShowNow(db()).catch(() => {}); }
      else notify('알림 권한을 허용해야 운동 알림을 받을 수 있어요.');
      save(); refresh();
    });
  }
}

function settingsSub(sub) {
  const c = db().challenge;
  const p = db().prefs;
  const TITLES = { push: '푸시 알림', calendar: '캘린더에 운동 일정 넣기', music: '배경음악', adapt: '운동량 자동 조절', backup: '백업', offline: '오프라인용으로 받기', library: '동작 도감', about: 'AI 코치·음성·글꼴 안내' };
  let body = '';
  if (sub === 'push') body = `
      <p class="muted" id="pushStatus">확인하는 중…</p>
      <div class="row"><button class="btn primary" data-act="push-on">푸시 알림 켜기</button><button class="btn ghost" data-act="push-test">알림 미리보기</button></div>
      <details class="hidden" id="pushSub">
        <summary class="small">구독 정보 · 처음 한 번 등록</summary>
        <p class="small">아래 구독 정보를 복사해서 Claude에게 보내 주세요. 한 번 등록하면 매일 8시에 알림이 와요. 알림을 껐다 다시 켜면 새로 등록해야 해요.</p>
        <pre class="sub-json" id="pushJson"></pre>
        <div class="row"><button class="btn ghost" data-act="push-copy">구독 정보 복사</button><button class="btn danger" data-act="push-off">알림 끄기</button></div>
      </details>`;
  if (sub === 'calendar') body = `
      <p class="muted">폰 캘린더에 매일 ${c.remindAt} 운동 일정을 챌린지 기간(${c.days}일) 동안 반복해서 넣어요. 앱 알림과 함께 쓰면 잊지 않기 좋아요.</p>
      <div class="row"><a class="btn primary" target="_blank" rel="noopener" href="${gcalLink(c)}">구글 캘린더에 추가</a>
        <button class="btn ghost" data-act="ics">다른 캘린더용 파일</button></div>`;
  if (sub === 'music') body = `
      <div class="chips" id="mStyle">${Object.entries(STYLES).map(([k, v]) => `<button type="button" data-v="${k}" class="${p.music.style === k ? 'on' : ''}">${v.label}</button>`).join('')}</div>
      <label class="range">볼륨 <input type="range" min="0.1" max="1" step="0.05" value="${p.music.vol}" id="mVol"></label>
      <div class="row"><button class="btn ghost" data-act="preview">미리 듣기</button>
        <label class="btn ghost">내 음악 파일<input type="file" accept="audio/*" id="mFile" hidden></label></div>
      <p class="muted small" id="mFileInfo">기본 음악은 앱이 직접 연주하는 비트라 인터넷 없이도 나와요. 운동 중에도 음악 버튼으로 바꿀 수 있어요.</p>`;
  if (sub === 'adapt') body = `
      <label class="switch"><span>컨디션과 완주 여부로 다음 운동량 조절</span><input type="checkbox" id="autoAdapt" ${p.autoAdapt === false ? '' : 'checked'}></label>
      <p class="muted">"힘들었어요"면 10% 줄이고, "가뿐했어요"면 10% 늘려요. 세트를 건너뛰거나 중간에 멈추면 5% 줄여요. 70~140% 안에서 바뀌어요.</p>
      <p><b>지금 운동량 ${Math.round((c.adapt || 1) * 100)}%</b></p>
      ${(c.adapt || 1) !== 1 ? '<button class="btn ghost" data-act="adapt-reset">운동량 100%로 되돌리기</button>' : ''}`;
  if (sub === 'backup') body = `
      <p class="muted">기록·코인·몸 사진을 파일 하나로 저장해요. ${isNative() ? '공유 화면에서 구글 드라이브나 내 파일을 고르세요.' : '공유 화면에서 "파일에 저장"을 고르면 iCloud Drive에 들어가요.'} 7일이 지나면 홈에서 알려 드려요.</p>
      <div class="row"><button class="btn primary" data-act="export">지금 백업하기</button>
        <label class="btn ghost">백업 불러오기<input type="file" accept="application/json" id="imp" hidden></label></div>`;
  if (sub === 'offline') body = `
      <p class="muted">운동 영상과 음성(약 ${Math.round((Object.keys(MEDIA).length * 0.45 + 2.2) * 10) / 10}MB)을 미리 받아 두면 인터넷이 없어도 끊김 없이 운동할 수 있어요. 와이파이에서 받으세요.</p>
      <p><b id="offStat">확인 중…</b></p>
      <div class="bar off-bar hidden" id="offBar"><i style="width:0%"></i></div>
      <button class="btn primary" data-act="offline">오프라인용으로 모두 받기</button>`;
  if (sub === 'library') body = `<ul class="ex-list">${Object.values(EXERCISES).map((ex) => `<li>${thumb(ex.id)}<div><b>${ex.name}</b><span class="sub">${ex.tips.join(' · ')}</span></div><span></span></li>`).join('')}</ul>`;
  if (sub === 'about') body = `
      <ul class="credits">
        <li><b>AI 코치 영상</b><span class="muted small">운동 영상 속 인물은 실제 사람이 아니라 생성형 AI(Google Gemini·Veo)로 만든 가상 코치예요.</span></li>
        <li><b>음성 안내</b><span class="muted small">Microsoft 신경망 음성(SunHi)으로 합성했어요.</span></li>
        <li><b>배경음악</b><span class="muted small">앱이 직접 연주하는 신스 음악이에요.</span></li>
        <li><b>글꼴</b><span class="muted small">Pretendard (SIL Open Font License 1.1), Apple SD Gothic Neo</span></li>
        <li><b>안전 안내</b><span class="muted small">이 앱은 의료 조언을 대신하지 않아요. 지병·부상·임신 중이거나 운동 중 통증·어지러움이 있으면 멈추고 전문가와 상담하세요.</span></li>
      </ul>`;
  app.innerHTML = `
  <section class="page settings-page">
    <header class="sub-head"><button class="icon-btn" data-act="back" aria-label="설정으로 돌아가기">${icon('prev')}</button><h1>${TITLES[sub]}</h1></header>
    <div class="block sub-body">${body}</div>
  </section>`;
  drawThumbs();
  const on = (act, fn) => app.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
  on('back', () => go('settings'));

  if (sub === 'push') {
    const pushStatus = app.querySelector('#pushStatus');
    const showSub = (json) => {
      app.querySelector('#pushSub').classList.toggle('hidden', !json);
      app.querySelector('#pushJson').textContent = json || '';
    };
    const refreshPush = async () => {
      if (!pushSupported()) { pushStatus.textContent = '이 브라우저는 푸시 알림을 지원하지 않아요. 홈 화면에 설치한 앱으로 열어 주세요.'; return; }
      const s = await currentSubscription().catch(() => null);
      if (Notification.permission === 'denied') pushStatus.textContent = '알림이 차단돼 있어요. 폰 설정에서 오늘홈트 알림을 허용해 주세요.';
      else if (s) pushStatus.textContent = '켜져 있어요. 매일 저녁 8시쯤, 운동 전이면 독려를, 운동 후면 오늘의 성과를 알려 줘요.';
      else pushStatus.textContent = '꺼져 있어요. 켜면 운동 전에는 독려, 운동 후에는 오늘의 성과를 알려 줘요.';
      showSub(s ? JSON.stringify(s.toJSON()) : '');
    };
    refreshPush();
    on('push-on', async () => {
      try { await enablePush(); await refreshPush(); app.querySelector('#pushSub').open = true; }
      catch (err) { notify(err.message === 'denied' ? '알림 권한을 허용해야 푸시를 받을 수 있어요.' : '이 브라우저에서는 푸시 알림을 켤 수 없어요.'); }
    });
    on('push-test', async () => { if (!(await webShowNow(db()))) notify('먼저 "푸시 알림 켜기"로 알림 권한을 허용해 주세요.'); });
    on('push-copy', async () => {
      const t = app.querySelector('#pushJson').textContent;
      try { await navigator.clipboard.writeText(t); toast('구독 정보를 복사했어요'); }
      catch { const r = document.createRange(); r.selectNodeContents(app.querySelector('#pushJson')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('길게 눌러 복사하세요'); }
    });
    on('push-off', async () => {
      if (!await ask('푸시 알림 끄기', '이 폰의 푸시 구독을 해제할까요? 다시 켜면 새 구독 정보를 등록해야 해요.', '끄기', { danger: true })) return;
      await disablePush(); refreshPush();
    });
  }
  if (sub === 'calendar') on('ics', () => download(`ohometeu-${c.start}.ics`, icsFile(c), 'text/calendar'));
  if (sub === 'adapt') {
    app.querySelector('#autoAdapt').addEventListener('change', (e) => { p.autoAdapt = e.target.checked; save(); });
    on('adapt-reset', () => { c.adapt = 1; c.adaptNote = null; save(); settings('adapt'); });
  }
  if (sub === 'backup') {
    on('export', async () => { if (await backupNow()) { toast('백업했어요'); settings('backup'); } });
    app.querySelector('#imp').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (!d.logs || !('challenge' in d)) throw new Error();
        if (await ask('백업 불러오기', '지금 기록을 백업 파일 내용으로 바꿀까요? 몸 사진도 함께 돌아와요.', '바꾸기')) { await restoreFrom(d); applyTheme(); go('home'); }
      } catch { notify('백업 파일을 읽지 못했어요.'); }
    });
  }
  if (sub === 'offline') {
    const offStat = app.querySelector('#offStat');
    const showOff = ({ have, total }) => { offStat.textContent = have >= total ? '모두 받았어요' : `${have} / ${total}개 받음`; };
    offlineStatus().then(showOff);
    on('offline', async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = '받는 중…';
      const bar = app.querySelector('#offBar'); bar.classList.remove('hidden');
      const failed = await downloadAll((n, total) => { bar.firstElementChild.style.width = `${(n / total) * 100}%`; offStat.textContent = `${n} / ${total}개 받음`; });
      btn.disabled = false; btn.textContent = failed ? '다시 시도' : '다시 받기';
      showOff(await offlineStatus());
      toast(failed ? `${failed}개를 받지 못했어요. 인터넷 연결을 확인해 주세요.` : '오프라인 준비 완료');
    });
  }
  if (sub === 'music') {
    const m = p.music;
    let previewing = false;
    const previewBtn = app.querySelector('[data-act="preview"]');
    const preview = async (force) => {
      if (previewing && !force) { music.stop(); stopPlaybackMode(); previewing = false; previewBtn.textContent = '미리 듣기'; return; }
      startPlaybackMode();
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
    const info = app.querySelector('#mFileInfo');
    loadBlob('myMusic').then((b) => { if (b) info.textContent = `내 음악: ${b.name || '저장된 파일'} (${(b.size / 1048576).toFixed(1)}MB)`; }).catch(() => {});
    app.querySelector('#mFile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        await saveBlob('myMusic', f);
        m.style = 'mine'; save();
        notify(`"${f.name}"을(를) 운동 음악으로 정했어요.`);
        settings('music');
      } catch { notify('음악 파일을 저장하지 못했어요. 파일이 너무 크면 더 작은 파일로 시도해 주세요.'); }
    });
  }
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
  if (isNative()) { nativeShareFile(name, text, name).catch(() => toast('파일을 저장하지 못했어요')); return; }
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
  setThemeBars(dark ? '#111213' : '#ecedea', dark);
}
darkQuery.addEventListener('change', applyTheme);
applyTheme();

if (!isNative() && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
if (isNative()) {
  let t = 0;
  const resched = () => { clearTimeout(t); t = setTimeout(() => nativeReschedule(db()).catch(() => {}), 800); };
  onSave(resched); onResume(resched); resched();
  onBackButton(() => {
    const modal = document.querySelector('.modal');
    if (modal) { modal.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }
    if (currentView === 'player') { app.querySelector(app.querySelector('#pPause')?.classList.contains('hidden') ? '[data-act="pause"]' : '[data-act="exit"]')?.click(); return true; }
    if (currentView === 'health') { go('welcome'); return true; }
    if (currentView === 'settings' && app.querySelector('.sub-head')) { go('settings'); return true; }
    if (currentView !== 'home' && db().challenge) { go('home'); return true; }
    return false;
  });
}
navigator.storage?.persist?.();
go(db().challenge ? 'home' : 'setup');
hideSplash();

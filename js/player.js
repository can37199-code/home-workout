// 운동 플레이어: 아바타가 내 속도에 맞춰 움직이고, 횟수·세트·휴식을 진행한다.
import { EXERCISES } from './exercises.js';
import { Avatar } from './avatar.js';
import { VideoStage } from './media.js';
import { db, save, latestWeight } from './store.js';
import { kcalFor } from './plan.js';
import { getAudioCtx } from './audio.js';
import { music, STYLES } from './music.js';
import { ask } from './ui.js';
import { loadBlob } from './idb.js';
import { icon } from './icons.js';

const hasMyMusic = () => loadBlob('myMusic').then(Boolean).catch(() => false);

const NATIVE = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const TENS = ['', '열', '스물', '서른', '마흔', '쉰'];
const korCount = (n) => (n < 60 ? TENS[Math.floor(n / 10)] + NATIVE[n % 10] : String(n));

let voiceOn = true;
function speak(text, rate = 1.15) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = rate;
  u.onstart = () => music.duck(true);
  u.onend = u.onerror = () => music.duck(false);
  speechSynthesis.speak(u);
}

function beep(freq = 880, ms = 120) {
  try {
    const audioCtx = getAudioCtx();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.25, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
    o.start(); o.stop(audioCtx.currentTime + ms / 1000);
  } catch { /* 소리 없이 진행 */ }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const secText = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// open: 최고 기록 도전 모드 (목표 없이 할 수 있는 만큼), bonus: "완주하면 +N" 안내 문구
export function runWorkout(root, { plan, onFinish, onExit, open = false, best = 0, bonus = '' }) {
  const prefs = db().prefs;
  voiceOn = prefs.voice;

  // 단계 목록 만들기
  const steps = [];
  plan.items.forEach((it, i) => {
    steps.push({ kind: 'intro', item: it });
    for (let s = 1; s <= it.sets; s++) {
      steps.push({ kind: 'work', item: it, set: s });
      const last = i === plan.items.length - 1 && s === it.sets;
      if (!last) steps.push({ kind: 'rest', next: s < it.sets ? it : plan.items[i + 1], nextSet: s < it.sets ? s + 1 : 1 });
    }
  });
  const workTotal = steps.filter((s) => s.kind === 'work').length;
  const startedAt = Date.now();
  let skipped = 0, resisted = false;

  root.innerHTML = `
  <div class="player">
    <header class="p-top">
      <button class="icon-btn" data-act="pause" aria-label="멈추고 메뉴 열기">${icon('close')}</button>
      <div class="p-title"><b id="pName"></b><span id="pSet"></span></div>
      <button class="icon-btn" data-act="music" id="pMusic" aria-label="음악 바꾸기">${icon('music')}</button>
    </header>
    <div class="p-bar" id="pBar"></div>
    ${bonus ? `<div class="p-reward">${bonus}</div>` : ''}
    <div class="p-stage"><canvas id="pCanvas"></canvas><video id="pVideo" class="hidden"></video><div class="p-badge" id="pBadge"></div></div>
    <div class="p-count"><span id="pBig">0</span><small id="pSmall"></small></div>
    <div class="p-sub" id="pSub"></div>
    <div class="p-mode" id="pMode">
      <div class="seg">
        <button data-mode="tap">내 속도 맞춤</button><button data-mode="auto">자동 재생</button>
      </div>
      <label class="range" id="pTempo">속도 <input type="range" min="0.5" max="1.6" step="0.05" id="pTempoIn"><output id="pTempoOut"></output></label>
    </div>
    <div class="p-actions" id="pActions"></div>
    <div class="p-pause hidden" id="pPause">
      <div class="p-pause-box">
        <h2>Paused</h2>
        <button class="btn primary big" data-act="resume">계속하기</button>
        <div class="music-pick" id="pMusicPick"></div>
        <button class="btn ghost" data-act="skipStep">이 세트 건너뛰기</button>
        <button class="btn ghost danger" data-act="exit">운동 끝내기</button>
      </div>
    </div>
  </div>`;

  const $ = (id) => root.querySelector('#' + id);
  const avatar = new Avatar($('pCanvas'));
  const video = new VideoStage($('pVideo'));
  let useVideo = false;

  let idx = -1, step = null, ex = null;
  let phase = 0, dur = 2, count = 0, timeLeft = 0;
  let waiting = false, catchUp = 0, lastTap = 0, intervals = [];
  let paused = false, elapsed = 0, raf = 0, prevT = 0, lastSpoken = -1;
  const reps = {}, workSec = {};
  let restSec = 0;

  // 화면 꺼짐 방지
  let wakeLock = null;
  const lock = async () => { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* 지원 안 함 */ } };
  const onVis = () => { if (document.visibilityState === 'visible') lock(); };
  lock(); document.addEventListener('visibilitychange', onVis);

  const tempoOf = (id) => prefs.tempo[id] || 1;

  // ---- 배경음악 ----
  const mp = prefs.music;
  function syncMusic() {
    if (!mp.sync || step?.kind !== 'work' || ex.type !== 'reps') return music.resetTempo();
    music.syncTo(prefs.mode === 'tap' ? dur : ex.base / tempoOf(ex.id));
  }
  function renderMusicPick() {
    $('pMusicPick').innerHTML = `
      <div class="chips">${Object.entries(STYLES).map(([k, v]) =>
        `<button type="button" data-music="${k}" class="${mp.style === k ? 'on' : ''}">${v.label}</button>`).join('')}</div>
      <label class="range">볼륨 <input type="range" min="0.1" max="1" step="0.05" value="${mp.vol}" id="pVol"></label>
      <label class="switch"><span>박자를 내 운동 속도에 맞추기</span><input type="checkbox" id="pSync" ${mp.sync ? 'checked' : ''}></label>`;
  }

  function setMode(m) {
    prefs.mode = m; save();
    root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('pTempo').classList.toggle('hidden', m !== 'auto');
    if (step?.kind === 'work') { waiting = false; renderActions(); }
  }

  // 지금 단계를 끝까지 하지 않고 넘어가면 건너뛴 세트로 센다
  function leaving() {
    if (open || step?.kind !== 'work') return;
    if (ex.type === 'reps' ? count < step.item.target : timeLeft > 2) skipped++;
  }

  function enter(i) {
    idx = i; step = steps[i];
    if (!step) return finish();
    ex = EXERCISES[step.kind === 'rest' ? step.next.id : step.item.id];
    avatar.setExercise(ex);
    useVideo = video.setExercise(ex.id);
    $('pVideo').classList.toggle('hidden', !useVideo);
    $('pCanvas').classList.toggle('hidden', useVideo);
    phase = 0; count = 0; waiting = false; catchUp = 0; intervals = []; lastTap = 0; lastSpoken = -1;
    dur = ex.base / tempoOf(ex.id);
    const doneWork = steps.slice(0, i).filter((s) => s.kind === 'work').length;
    $('pBar').innerHTML = Array.from({ length: workTotal }, (_, k) => `<i class="${k < doneWork ? 'on' : k === doneWork && step.kind === 'work' ? 'cur' : ''}"></i>`).join('');
    $('pName').textContent = ex.name;
    $('pTempoIn').value = tempoOf(ex.id); $('pTempoOut').textContent = `${tempoOf(ex.id).toFixed(2)}x`;
    root.querySelector('.player').dataset.kind = step.kind;
    music.setSoft(step.kind !== 'work');
    syncMusic();

    if (step.kind === 'intro') {
      timeLeft = 6;
      $('pSet').textContent = open ? `최고 기록 도전 · 지금 최고 ${best}${ex.type === 'hold' ? '초' : '회'}`
        : `${step.item.sets}세트 · ${ex.type === 'hold' ? step.item.target + '초' : step.item.target + (ex.unit ? `회 (${ex.unit})` : '회')}`;
      $('pBadge').textContent = '다음 동작 미리보기';
      $('pSub').innerHTML = `<ul class="tips">${ex.tips.map((t) => `<li>${t}</li>`).join('')}</ul>`;
      speak(`${ex.name}. 준비하세요`);
    } else if (step.kind === 'work') {
      $('pSet').textContent = open ? '할 수 있는 만큼 끝까지' : `세트 ${step.set} / ${step.item.sets}`;
      $('pBadge').textContent = '';
      timeLeft = open ? 0 : ex.type === 'hold' ? step.item.target : 0;
      $('pSub').textContent = '';
      if (step.set > 1 || ex.type === 'hold') speak(ex.type === 'hold' ? '시작' : `${step.set}세트 시작`);
      else speak('시작');
    } else {
      timeLeft = plan.rest;
      $('pSet').textContent = `다음: 세트 ${step.nextSet} / ${step.next.sets}`;
      $('pBadge').textContent = '휴식 · 다음 동작';
      $('pSub').textContent = '숨 고르고 물 한 모금 마셔요';
      speak(`휴식. 다음은 ${ex.name}`);
    }
    $('pMode').classList.toggle('hidden', !(step.kind === 'work' && ex.type === 'reps'));
    renderActions(); renderCount();
  }

  function renderActions() {
    const a = $('pActions');
    if (step.kind === 'intro') {
      a.innerHTML = `<button class="btn primary big" data-act="next">바로 시작</button>`;
    } else if (step.kind === 'rest') {
      a.innerHTML = `<div class="row"><button class="btn ghost" data-act="plus">+10초</button><button class="btn primary" data-act="next">휴식 건너뛰기</button></div>`;
    } else if (ex.type === 'hold') {
      a.innerHTML = `<button class="btn ghost big" data-act="next">${open ? '기록 끝내기' : '세트 완료'}</button>`;
    } else if (open && prefs.mode === 'tap') {
      a.innerHTML = `<div class="row"><button class="btn ghost small" data-act="next">끝</button>
        <button class="btn tap" data-act="tap">1회 완료<span>Tap</span></button></div>`;
    } else if (open) {
      a.innerHTML = `<div class="row"><button class="btn ghost small" data-act="undo">−1</button>
        <button class="btn ghost" data-act="next">기록 끝내기</button></div>`;
    } else if (prefs.mode === 'tap') {
      a.innerHTML = `<div class="row"><button class="btn ghost small" data-act="undo">−1</button>
        <button class="btn tap" data-act="tap">1회 완료<span>Tap</span></button></div>`;
    } else {
      a.innerHTML = `<div class="row"><button class="btn ghost small" data-act="undo">−1</button>
        <button class="btn ghost" data-act="next">세트 완료</button></div>`;
    }
  }

  function renderCount() {
    if (step.kind === 'work' && ex.type === 'reps') {
      $('pBig').textContent = count;
      $('pSmall').textContent = open ? `최고 ${best}회` : `/ ${step.item.target}회`;
      if (prefs.mode === 'tap') {
        $('pSub').textContent = waiting ? '기다리는 중 · 1회 하고 나서 탭!' : `내 페이스 ${dur.toFixed(1)}초/회`;
      }
    } else {
      $('pBig').textContent = secText(timeLeft);
      $('pSmall').textContent = step.kind === 'work' ? (open ? `최고 ${best}초` : '남음') : step.kind === 'rest' ? '휴식' : '준비';
    }
  }

  function addRep() {
    count++;
    reps[ex.id] = (reps[ex.id] || 0) + 1;
    speak(korCount(count), 1.3);
    if (count >= step.item.target) {
      if (prefs.mode === 'tap') { prefs.tempo[ex.id] = clamp(ex.base / dur, 0.4, 2); save(); }
      beep(1046, 180);
      setTimeout(() => step?.kind === 'work' && enter(idx + 1), 350);
    }
  }

  function tap() {
    if (step.kind !== 'work' || count >= step.item.target) return;
    const now = performance.now();
    // 첫 탭은 준비 시간이 섞여 있으니 두 번째 탭부터 간격을 잰다
    const iv = lastTap ? (now - lastTap) / 1000 : 0;
    lastTap = now;
    if (iv > 0.25 && iv < ex.base * 4) {
      intervals.push(iv); if (intervals.length > 3) intervals.shift();
      dur = clamp(median(intervals), ex.base * 0.45, ex.base * 3);
      syncMusic();
    }
    if (waiting) { waiting = false; phase = 0; }
    else if (phase > 0.02) catchUp = (1 - phase) / 0.22; // 사용자가 더 빠르면 남은 동작을 빨리 마무리
    addRep(); renderCount();
  }

  function tick(t) {
    const dt = Math.min(0.1, prevT ? (t - prevT) / 1000 : 0);
    prevT = t;
    let vel = 0;
    if (paused && useVideo) video.stop();
    if (!paused && step) {
      elapsed += dt;
      if (step.kind === 'work') workSec[ex.id] = (workSec[ex.id] || 0) + dt;
      else restSec += dt;

      if (step.kind === 'work' && ex.type === 'reps') {
        if (prefs.mode === 'auto') {
          vel = tempoOf(ex.id) / ex.base;
          phase += dt * vel;
          if (phase >= 1) { phase -= 1; addRep(); renderCount(); }
        } else if (!waiting) {
          vel = catchUp || 1 / dur;
          phase += dt * vel;
          if (phase >= 1) {
            if (catchUp) { catchUp = 0; phase = 0; }
            else { phase = 0; waiting = true; renderCount(); }
          }
        }
      } else {
        const speed = step.kind === 'work' ? 1 : 0.6;
        vel = speed / ex.base;
        phase += dt * vel;
        if (open && step.kind === 'work') { timeLeft += dt; renderCount(); }
        else timeLeft -= dt;
        const sec = Math.ceil(timeLeft);
        if (!(open && step.kind === 'work') && sec !== lastSpoken && sec <= 3 && sec >= 1) { lastSpoken = sec; beep(660, 90); }
        if (step.kind === 'work' && sec !== lastSpoken && sec > 3 && sec % 10 === 0) { lastSpoken = sec; speak(`${sec}초`); }
        renderCount();
        if (!(open && step.kind === 'work') && timeLeft <= 0) {
          if (step.kind === 'work') { reps[ex.id] = (reps[ex.id] || 0) + step.item.target; beep(1046, 180); }
          enter(idx + 1);
        }
      }
      // 기다리는 동안은 숨쉬는 정도로만 살짝 움직임
      if (useVideo) video.draw(phase, vel, waiting);
      else avatar.draw(waiting ? 0.03 * Math.sin(t / 400) ** 2 : phase);
    }
    raf = requestAnimationFrame(tick);
  }

  function result() {
    const kg = latestWeight();
    let kcal = kcalFor(1.5, kg, restSec);
    for (const [id, s] of Object.entries(workSec)) kcal += kcalFor(EXERCISES[id].met, kg, s);
    const doneWork = steps.slice(0, Math.max(0, idx)).filter((s) => s.kind === 'work').length;
    const ratio = idx >= steps.length ? 1 : doneWork / workTotal;
    const record = open ? (ex.type === 'hold' ? Math.floor(timeLeft) : count) : 0;
    return { sec: Math.round(elapsed), kcal: Math.round(kcal), reps, full: ratio >= 1 && skipped === 0, ratio, skipped, resisted, startedAt, record };
  }

  function cleanup() {
    cancelAnimationFrame(raf);
    avatar.destroy();
    video.stop();
    document.removeEventListener('visibilitychange', onVis);
    wakeLock?.release?.().catch(() => {});
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    music.stop();
  }

  function finish() {
    $('pBar').querySelectorAll('i').forEach((i) => { i.className = 'on'; });
    speak('오늘 운동 완료! 수고했어요');
    cleanup();
    onFinish(result());
  }

  root.querySelector('.player').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act],[data-mode],[data-music]');
    if (!b) return;
    if (b.dataset.mode) return setMode(b.dataset.mode);
    if (b.dataset.music) {
      mp.style = b.dataset.music; save();
      renderMusicPick();
      if (mp.style === 'mine' && !(await hasMyMusic())) {
        await ask('내 음악 파일', '설정 → 배경음악에서 폰에 있는 음악 파일을 먼저 골라 주세요.', '알겠어요', { cancel: '닫기' });
      }
      await music.start(mp.style, mp.vol); music.setSoft(true); syncMusic();
      return;
    }
    switch (b.dataset.act) {
      case 'tap': tap(); break;
      case 'undo':
        if (count > 0) { count--; reps[ex.id]--; renderCount(); }
        break;
      case 'next':
        if (step.kind === 'work' && ex.type === 'hold') reps[ex.id] = (reps[ex.id] || 0) + Math.round(open ? timeLeft : step.item.target - Math.max(0, timeLeft));
        leaving(); enter(idx + 1); break;
      case 'plus': timeLeft += 10; renderCount(); break;
      case 'pause': case 'music':
        paused = true; renderMusicPick(); $('pPause').classList.remove('hidden');
        speechSynthesis?.cancel(); music.setSoft(true); break;
      case 'resume': paused = false; $('pPause').classList.add('hidden'); music.setSoft(step.kind !== 'work'); break;
      case 'skipStep': paused = false; $('pPause').classList.add('hidden'); leaving(); enter(idx + 1); break;
      case 'exit': {
        const left = steps.slice(idx).filter((x) => x.kind === 'work').length;
        const msg = open ? '지금까지 한 만큼으로 기록할까요?'
          : `남은 세트는 ${left}개예요. 지금 끝내면 완주 보너스와 연속 기록 보너스를 받지 못하고, 한 만큼만 부분 완료로 기록돼요.${left <= 2 ? ' 거의 다 왔어요!' : ''}`;
        if (await ask(open ? '도전 끝내기' : '정말 그만할까요?', msg, '끝내기', { cancel: open ? '계속하기' : '1세트만 더 할게요', danger: true })) {
          cleanup(); onExit(result());
        } else resisted = true;
        break;
      }
    }
  });
  root.querySelector('.player').addEventListener('input', (e) => {
    if (e.target.id === 'pVol') { mp.vol = Number(e.target.value); save(); music.vol = mp.vol; music.setSoft(true); }
  });
  root.querySelector('.player').addEventListener('change', (e) => {
    if (e.target.id === 'pSync') { mp.sync = e.target.checked; save(); syncMusic(); }
  });
  $('pTempoIn').addEventListener('input', (e) => {
    prefs.tempo[ex.id] = Number(e.target.value); save(); syncMusic();
    $('pTempoOut').textContent = `${Number(e.target.value).toFixed(2)}x`;
  });

  setMode(prefs.mode);
  music.start(mp.style, mp.vol);
  enter(0);
  raf = requestAnimationFrame(tick);
}

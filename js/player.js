// 운동 플레이어: 실사 영상(없으면 아바타)을 1배속으로 반복 재생하며 횟수·세트·휴식을 진행한다.
// 횟수는 영상이 한 바퀴 돌 때마다 센다. 음성 안내는 미리 만든 음성 파일, 배경음악은 정속도.
import { EXERCISES } from './exercises.js';
import { Avatar } from './avatar.js';
import { VideoStage, repSec } from './media.js';
import { db, save, latestWeight } from './store.js';
import { kcalFor } from './plan.js';
import { getAudioCtx, startPlaybackMode, stopPlaybackMode } from './audio.js';
import { music, STYLES } from './music.js';
import { ask } from './ui.js';
import { loadBlob } from './idb.js';
import { icon } from './icons.js';
import { say, preloadVoice, voiceLength, stopVoice, setVoiceEnabled } from './voice.js';
import { MAX_COUNT } from './voice-lines.js';
import { MEDIA } from './media.js';
import { keepAwake, overrideBars, restoreBars } from './native.js';

const hasMyMusic = () => loadBlob('myMusic').then(Boolean).catch(() => false);

function beep(freq = 880, ms = 120) {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    o.start(); o.stop(ctx.currentTime + ms / 1000);
  } catch { /* 소리 없이 진행 */ }
}

const secText = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const amountText = (ex, it) => (ex.type === 'hold' ? `${it.target}초` : `${it.target}회${ex.unit ? ` · ${ex.unit}` : ''}`);

// open: 최고 기록 도전 모드 (목표 없이 할 수 있는 만큼), bonus: "끝까지 하면 +N" 안내
export function runWorkout(root, { plan, onFinish, onExit, open = false, best = 0, bonus = '' }) {
  const prefs = db().prefs;
  setVoiceEnabled(prefs.voice);
  startPlaybackMode(); // 무음 스위치를 켜도 소리가 나게 (시작 버튼을 누른 순간에 실행돼야 함)

  // 단계: 동작 소개 → 세트 → 휴식 → …
  const steps = [];
  plan.items.forEach((it, i) => {
    steps.push({ kind: 'intro', item: it });
    for (let s = 1; s <= it.sets; s++) {
      steps.push({ kind: 'work', item: it, set: s });
      const last = i === plan.items.length - 1 && s === it.sets;
      if (!last) steps.push({ kind: 'rest', next: s < it.sets ? it : plan.items[i + 1], nextSet: s < it.sets ? s + 1 : 1, same: s < it.sets });
    }
  });
  const workTotal = steps.filter((s) => s.kind === 'work').length;
  const startedAt = Date.now();
  let skipped = 0, resisted = false;

  // 이번 운동에 쓸 음성을 미리 받아 둔다
  const ids = [...new Set(plan.items.map((it) => it.id))];
  preloadVoice(['start', 'set-2', 'set-3', 'set-last', 'rest-same', 'half', 'last-3', 'done', 'switch-legs', 'switch-side',
    ...ids.flatMap((id) => [`intro-${id}`, `next-${id}`]),
    ...Array.from({ length: Math.min(MAX_COUNT, Math.max(...plan.items.map((it) => (Number.isFinite(it.target) ? it.target : 30)))) }, (_, k) => `count-${k + 1}`)]);
  // 이번 운동 영상도 미리 받아 둔다 (서비스 워커가 저장해서 다음부터는 오프라인으로도 재생)
  ids.forEach((id) => { if (MEDIA[id]) fetch(MEDIA[id].src).catch(() => {}); });

  root.innerHTML = `
  <div class="player">
    <header class="p-top">
      <button class="icon-btn" data-act="pause" aria-label="멈추고 메뉴 열기">${icon('close')}</button>
      <div class="p-title"><b id="pName"></b><span id="pSet"></span></div>
      <button class="icon-btn" data-act="music" aria-label="음악 바꾸기">${icon('music')}</button>
    </header>
    <div class="p-bar" id="pBar"></div>
    ${bonus ? `<div class="p-reward">${icon('coin')}${bonus}</div>` : ''}
    <div class="p-stage"><canvas id="pCanvas"></canvas><div class="p-frame"><video id="pVideo" class="hidden"></video><div class="p-badge" id="pBadge"></div><span class="p-ai">AI 생성 영상</span></div></div>
    <div class="p-info" id="pInfo"></div>
    <div class="p-actions" id="pActions"></div>
    <div class="p-pause hidden" id="pPause">
      <div class="p-pause-box">
        <h2>일시정지</h2>
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
  let phase = 0, count = 0, timeLeft = 0, introTotal = 7;
  let paused = false, elapsed = 0, raf = 0, prevT = 0, lastSpoken = -1;
  const reps = {}, workSec = {};
  let restSec = 0, switched = false;

  // 화면 꺼짐 방지
  let wakeLock = null;
  const lock = async () => { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* 지원 안 함 */ } };
  const onVis = () => { if (document.visibilityState === 'visible') lock(); };
  lock(); keepAwake(true); overrideBars('#0e0f10', true); document.addEventListener('visibilitychange', onVis);

  // ---- 배경음악 (정속도) ----
  const mp = prefs.music;
  function renderMusicPick() {
    $('pMusicPick').innerHTML = `
      <div class="chips">${Object.entries(STYLES).map(([k, v]) =>
        `<button type="button" data-music="${k}" class="${mp.style === k ? 'on' : ''}">${v.label}</button>`).join('')}</div>
      <label class="range">볼륨 <input type="range" min="0.1" max="1" step="0.05" value="${mp.vol}" id="pVol"></label>`;
  }

  // ---- 화면 아래 정보 영역 ----
  function renderInfo() {
    const box = $('pInfo');
    if (step.kind === 'intro') {
      box.innerHTML = `
        <div class="p-guide">
          <div class="g-head"><span class="g-kicker">${icon('sparkle')}자세 포인트</span><span class="g-target">${open ? `지금 최고 ${best}${ex.type === 'hold' ? '초' : '회'}` : `${step.item.sets}세트 × ${amountText(ex, step.item)}`}</span></div>
          <ol class="g-tips">${ex.tips.map((t, k) => `<li style="--i:${k}"><span class="g-n">${k + 1}</span><span>${t}</span></li>`).join('')}</ol>
          <div class="g-bar"><i id="gBar"></i></div>
          <p class="g-foot" id="gFoot"></p>
        </div>`;
    } else if (step.kind === 'rest') {
      const nx = EXERCISES[step.next.id];
      box.innerHTML = `
        <div class="p-rest">
          <div class="r-time"><span id="pBig"></span><small>휴식</small></div>
          <div class="r-next"><span class="g-kicker">다음</span><b>${nx.name}</b><span>${step.same ? `${step.nextSet}세트째` : `${step.next.sets}세트 × ${amountText(nx, step.next)}`}</span></div>
        </div>`;
    } else {
      box.innerHTML = `
        <div class="p-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="54"/><circle class="prg" id="pRing" cx="60" cy="60" r="54" pathLength="100"/></svg>
          <div class="p-count"><span id="pBig">0</span><small id="pSmall"></small></div></div>
        <p class="p-sub">${ex.sides && !open ? `${switchAt(step.item.target)}회 하고 다리를 바꿔요` : ex.tips[0]}</p>`;
    }
  }

  function enter(i) {
    idx = i; step = steps[i];
    if (!step) return finish();
    ex = EXERCISES[step.kind === 'rest' ? step.next.id : step.item.id];
    if (ex.frames) avatar.setExercise(ex); // 실사 영상만 있는 동작은 아바타를 쓰지 않는다
    switched = false;
    useVideo = video.setExercise(ex.id);
    $('pVideo').classList.toggle('hidden', !useVideo);
    $('pCanvas').classList.toggle('hidden', useVideo);
    phase = 0; count = 0; lastSpoken = -1;
    setMirror(false);
    const doneWork = steps.slice(0, i).filter((s) => s.kind === 'work').length;
    $('pBar').innerHTML = Array.from({ length: workTotal }, (_, k) => `<i class="${k < doneWork ? 'on' : k === doneWork && step.kind === 'work' ? 'cur' : ''}"></i>`).join('');
    $('pName').textContent = ex.name;
    root.querySelector('.player').dataset.kind = step.kind;
    music.setSoft(step.kind !== 'work');

    if (step.kind === 'intro') {
      $('pSet').textContent = open ? '최고 기록 도전' : '동작 미리보기';
      $('pBadge').textContent = '';
      introTotal = 7; timeLeft = introTotal;
      // 소개 음성이 끝날 때까지 기다렸다가 시작한다
      const cur = step;
      voiceLength(`intro-${ex.id}`).then((d) => { if (step === cur && d + 1.2 > introTotal) { timeLeft += d + 1.2 - introTotal; introTotal = d + 1.2; } });
      say(`intro-${ex.id}`);
    } else if (step.kind === 'work') {
      $('pSet').textContent = open ? '할 수 있는 만큼 끝까지' : `세트 ${step.set} / ${step.item.sets}`;
      $('pBadge').textContent = '';
      timeLeft = open ? 0 : ex.type === 'hold' ? step.item.target : 0;
      video.restart();
      setMirror(false);
      say(step.set === 1 || open ? 'start' : step.set === step.item.sets ? 'set-last' : `set-${step.set}`);
    } else {
      timeLeft = plan.rest;
      $('pSet').textContent = '잠깐 쉬어요';
      $('pBadge').textContent = '다음 동작';
      say(step.same ? 'rest-same' : `next-${step.next.id}`);
    }
    renderInfo(); renderActions(); renderCount();
  }

  function renderActions() {
    const a = $('pActions');
    if (step.kind === 'intro') {
      a.innerHTML = `<button class="btn primary big" data-act="next"><span>바로 시작</span>${icon('arrow')}</button>`;
    } else if (step.kind === 'rest') {
      a.innerHTML = `<div class="row"><button class="btn ghost p-undo" data-act="plus">+10초</button><button class="btn primary p-main" data-act="next"><span>휴식 건너뛰기</span>${icon('arrow')}</button></div>`;
    } else if (ex.type === 'hold') {
      a.innerHTML = `<button class="btn ghost big" data-act="next"><span>${open ? '기록 끝내기' : '세트 완료'}</span>${icon('check')}</button>`;
    } else {
      a.innerHTML = `<div class="row"><button class="btn ghost p-undo" data-act="undo" aria-label="한 번 빼기">−1</button>
        <button class="btn ghost p-main" data-act="next"><span>${open ? '기록 끝내기' : '세트 완료'}</span>${icon('check')}</button></div>`;
    }
  }

  function renderCount() {
    if (step.kind === 'intro') {
      const bar = $('gBar'); if (bar) bar.style.transform = `scaleX(${1 - Math.max(0, timeLeft) / introTotal})`;
      const foot = $('gFoot'); if (foot) foot.textContent = `${Math.ceil(Math.max(0, timeLeft))}초 후 시작해요`;
      return;
    }
    const big = $('pBig'), small = $('pSmall'), ring = $('pRing');
    if (ring) {
      const t = step.item.target;
      const p = open || !Number.isFinite(t) ? 0 : ex.type === 'reps' ? count / t : 1 - Math.max(0, timeLeft) / t;
      ring.style.strokeDashoffset = String(100 - Math.min(1, Math.max(0, p)) * 100);
    }
    if (step.kind === 'work' && ex.type === 'reps') {
      big.textContent = count;
      small.textContent = open ? `최고 ${best}회` : `/ ${step.item.target}회`;
    } else {
      big.textContent = secText(timeLeft);
      if (small) small.textContent = step.kind === 'work' ? (open ? `최고 ${best}초` : '남음') : '';
    }
  }

  // 한쪽 다리로 하는 동작(sides): 세트 절반에서 영상을 좌우 반전해 반대쪽 다리로 이어 간다
  function setMirror(on) { root.querySelector('.p-stage').classList.toggle('mirror', on); }
  const switchAt = (t) => Math.ceil(t / 2);

  function leaving() {
    if (open || step?.kind !== 'work') return;
    if (ex.type === 'reps' ? count < step.item.target : timeLeft > 2) skipped++;
  }

  function addRep() {
    count++;
    reps[ex.id] = (reps[ex.id] || 0) + 1;
    const t = step.item.target;
    if (ex.sides && !open && count === switchAt(t) && count < t) { setMirror(true); say(ex.switchVoice || 'switch-legs'); }
    else if (!open && t >= 8 && count === t - 3) say('last-3');
    else if (!open && t >= 10 && !ex.sides && count === Math.ceil(t / 2)) say('half');
    else say(`count-${Math.min(count, MAX_COUNT)}`);
    renderCount();
    if (count >= t) {
      beep(1046, 160);
      setTimeout(() => step?.kind === 'work' && enter(idx + 1), 450);
    }
  }

  function tick(t) {
    const dt = Math.min(0.1, prevT ? (t - prevT) / 1000 : 0);
    prevT = t;
    if (paused) { video.pause(); raf = requestAnimationFrame(tick); return; }
    if (step) {
      elapsed += dt;
      if (step.kind === 'work') workSec[ex.id] = (workSec[ex.id] || 0) + dt;
      else restSec += dt;

      if (step.kind === 'work' && ex.type === 'reps') {
        // 영상이 있으면 영상 위치가 기준(1배속), 없으면 시간 기준
        if (useVideo) video.play();
        const vp = useVideo ? video.phase() : null;
        if (vp != null) {
          if (vp < phase - 0.5) addRep();
          phase = vp;
        } else if (!useVideo) {
          phase += dt / repSec(ex);
          if (phase >= 1) { phase -= 1; addRep(); }
        }
      } else {
        if (useVideo) video.play(); else phase += dt / repSec(ex);
        if (open && step.kind === 'work') timeLeft += dt; else timeLeft -= dt;
        // 좌우가 있는 버티기 동작(사이드 플랭크): 절반이 지나면 영상을 반전하고 반대쪽으로
        if (step.kind === 'work' && ex.sides && !open && !switched && timeLeft <= step.item.target / 2) { switched = true; setMirror(true); say(ex.switchVoice || 'switch-legs'); }
        const sec = Math.ceil(timeLeft);
        if (!(open && step.kind === 'work') && step.kind !== 'intro' && sec !== lastSpoken && sec <= 3 && sec >= 1) { lastSpoken = sec; beep(660, 90); }
        if (step.kind === 'work' && !open && sec !== lastSpoken && sec >= 10 && sec % 10 === 0 && sec < step.item.target) { lastSpoken = sec; say(`left-${sec}`, { interrupt: false }); }
        renderCount();
        if (!(open && step.kind === 'work') && timeLeft <= 0) {
          if (step.kind === 'work') { reps[ex.id] = (reps[ex.id] || 0) + step.item.target; beep(1046, 160); }
          enter(idx + 1);
        }
      }
      if (!useVideo) avatar.draw(phase);
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
    video.pause();
    document.removeEventListener('visibilitychange', onVis);
    wakeLock?.release?.().catch(() => {}); keepAwake(false); restoreBars();
    music.stop();
    stopPlaybackMode();
  }

  function finish() {
    $('pBar').querySelectorAll('i').forEach((i) => { i.className = 'on'; });
    say('done');
    cleanup();
    onFinish(result());
  }

  root.querySelector('.player').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act],[data-music]');
    if (!b) return;
    if (b.dataset.music) {
      mp.style = b.dataset.music; save();
      renderMusicPick();
      if (mp.style === 'mine' && !(await hasMyMusic())) {
        await ask('내 음악 파일', '설정 → 배경음악에서 폰에 있는 음악 파일을 먼저 골라 주세요.', '알겠어요', { cancel: '닫기' });
      }
      await music.start(mp.style, mp.vol); music.setSoft(true);
      return;
    }
    switch (b.dataset.act) {
      case 'undo':
        if (count > 0) { count--; reps[ex.id]--; renderCount(); }
        break;
      case 'next':
        if (step.kind === 'work' && ex.type === 'hold') reps[ex.id] = (reps[ex.id] || 0) + Math.round(open ? timeLeft : step.item.target - Math.max(0, timeLeft));
        leaving(); enter(idx + 1); break;
      case 'plus': timeLeft += 10; renderCount(); break;
      case 'pause': case 'music':
        paused = true; renderMusicPick(); $('pPause').classList.remove('hidden');
        stopVoice(); music.setSoft(true); break;
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

  music.start(mp.style, mp.vol);
  enter(0);
  raf = requestAnimationFrame(tick);
}

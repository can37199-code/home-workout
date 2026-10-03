// 실사 영상: 동작 id → 1회 동작이 끊김 없이 반복되는 클립 (원본은 videos/, 다듬은 결과는 media/)
// reps: 클립 안에 들어 있는 동작 횟수. 영상이 없는 동작은 아바타가 대신 보여 준다.
export const MEDIA = {
  squat: { src: 'media/squat.mp4', poster: 'media/squat.jpg', reps: 1 },
  lunge: { src: 'media/lunge.mp4', poster: 'media/lunge.jpg', reps: 1 },
  pushup: { src: 'media/pushup.mp4', poster: 'media/pushup.jpg', reps: 1 },
  plank: { src: 'media/plank.mp4', poster: 'media/plank.jpg', reps: 1 },
  jumpingJack: { src: 'media/jumpingJack.mp4', poster: 'media/jumpingJack.jpg', reps: 1 },
};

// 영상 재생을 아바타와 같은 방식(phase 0~1, 속도)으로 맞춘다
export class VideoStage {
  constructor(video) {
    this.v = video;
    this.v.muted = true; this.v.playsInline = true; this.v.loop = true; this.v.preload = 'auto';
    this.m = null; this.ready = false;
    this.v.addEventListener('loadedmetadata', () => { this.ready = true; });
  }
  setExercise(id) {
    this.m = MEDIA[id] || null;
    this.ready = false;
    if (!this.m) { this.v.pause(); this.v.removeAttribute('src'); this.v.load(); return false; }
    this.v.poster = this.m.poster || '';
    this.v.src = this.m.src;
    return true;
  }
  // phase: 0~1 (1회 동작 안의 위치), vel: 초당 phase 변화량, hold: 정지 화면
  draw(phase, vel, hold) {
    const v = this.v;
    if (!this.m || !this.ready || !v.duration) return;
    const L = v.duration / this.m.reps;
    if (hold || vel <= 0) {
      if (!v.paused) v.pause();
      // 시작 자세에서 기다린다 (클립 끝 프레임은 시작 프레임과 거의 같아서 그대로 둬도 된다)
      if (v.currentTime > 0.05 && v.currentTime < L - 0.15) v.currentTime = 0;
      return;
    }
    const target = ((phase % 1) + 1) % 1 * L;
    let diff = v.currentTime - target;
    if (diff > L / 2) diff -= L; else if (diff < -L / 2) diff += L;
    // 위치를 강제로 옮기면(seek) 화면이 멈칫하므로, 많이 어긋났을 때만 옮기고
    // 평소에는 재생 속도를 살짝 빠르게/느리게 해서 따라잡는다
    if (Math.abs(diff) > L * 0.3) { v.currentTime = target; diff = 0; }
    const correction = Math.max(-0.35, Math.min(0.35, -diff / L * 1.5));
    const rate = Math.max(0.25, Math.min(4, L * vel * (1 + correction)));
    if (Math.abs(v.playbackRate - rate) > 0.01) v.playbackRate = rate;
    if (v.paused) v.play().catch(() => {});
  }
  stop() { this.v.pause(); }
}

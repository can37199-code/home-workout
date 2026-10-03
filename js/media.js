// 실사 영상: 동작 id → 1회 동작이 끊김 없이 반복되는 클립 (원본은 videos/, 다듬은 결과는 media/)
// reps: 클립 안에 들어 있는 동작 횟수. 영상이 없는 동작은 아바타가 대신 보여 준다.
export const MEDIA = {
  squat: { src: 'media/squat.mp4', poster: 'media/squat.jpg', reps: 1 },
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
      if (Math.abs(v.currentTime) > 0.05) v.currentTime = 0;
      return;
    }
    const rate = Math.max(0.25, Math.min(4, L * vel));
    if (Math.abs(v.playbackRate - rate) > 0.02) v.playbackRate = rate;
    const target = ((phase % 1) + 1) % 1 * L;
    let diff = v.currentTime - target;
    if (diff > L / 2) diff -= L; else if (diff < -L / 2) diff += L;
    if (Math.abs(diff) > 0.15 * Math.max(1, rate)) v.currentTime = target;
    if (v.paused) v.play().catch(() => {});
  }
  stop() { this.v.pause(); }
}

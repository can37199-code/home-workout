// 실사 영상: 동작 id → 1회 동작이 끊김 없이 반복되는 클립 (원본은 videos/, 다듬은 결과는 media/)
// dur: 클립 길이(초), reps: 클립 안의 동작 횟수. 영상은 항상 1배속으로 재생하고, 클립이 한 바퀴 돌 때 횟수를 센다.
export const MEDIA = {
  squat: { dur: 3.667, reps: 1 },
  lunge: { dur: 3.708, reps: 1 },
  pushup: { dur: 3.083, reps: 1 },
  kneePushup: { dur: 4.000, reps: 1 },
  plank: { dur: 5.000, reps: 1 },
  jumpingJack: { dur: 1.583, reps: 1 },
  gluteBridge: { dur: 3.25, reps: 1 },
  mountainClimber: { dur: 1.458, reps: 1 },
  highKnees: { dur: 0.792, reps: 1 },
  crunch: { dur: 3.083, reps: 1 },
  legRaise: { dur: 2.583, reps: 1 },
  burpee: { dur: 9.25, reps: 2 },
  // 2차 확장 (21일 하체 라인 · 14일 복부 집중 · 회복)
  sumoSquat: { dur: 3.417, reps: 1 },
  sideLunge: { dur: 2.417, reps: 1 },
  curtsyLunge: { dur: 2.25, reps: 1 },
  donkeyKick: { dur: 3.583, reps: 1 },
  calfRaise: { dur: 2.417, reps: 1 },
  bicycleCrunch: { dur: 3.708, reps: 2 },
  russianTwist: { dur: 4.417, reps: 2 },
  flutterKick: { dur: 1.667, reps: 1 },
  deadBug: { dur: 3.333, reps: 1 },
  sidePlank: { dur: 4.5, reps: 1 },
  shoulderTap: { dur: 1.375, reps: 1 },
  catCow: { dur: 7.708, reps: 1 },
  sideLegRaise: { dur: 2.750, reps: 1 },
  birdDog: { dur: 4.167, reps: 1 },
};
for (const [id, m] of Object.entries(MEDIA)) { m.src = `media/${id}.mp4`; m.poster = `media/${id}.jpg`; }

// 1회 동작 시간: 영상이 있으면 영상 그대로(1배속), 없으면 아바타 기본값
export const repSec = (ex) => (MEDIA[ex.id] ? MEDIA[ex.id].dur / MEDIA[ex.id].reps : ex.base);

// 영상은 1배속으로 반복 재생만 하고, 지금 몇 번째 동작의 어디쯤인지(phase)를 알려 준다
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
    this.v.poster = this.m.poster;
    this.v.src = this.m.src;
    this.v.playbackRate = 1;
    return true;
  }
  // 동작 안의 위치 0~1 (영상이 아직 준비 안 됐으면 null)
  phase() {
    if (!this.m || !this.ready || !this.v.duration) return null;
    const L = this.v.duration / this.m.reps;
    return (this.v.currentTime % L) / L;
  }
  play() { if (this.m && this.v.paused) this.v.play().catch(() => {}); }
  pause() { if (!this.v.paused) this.v.pause(); }
  restart() { if (this.m) { this.v.currentTime = 0; } }
}

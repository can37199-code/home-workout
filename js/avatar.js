// 관절 애니메이션 아바타: 포즈(관절 각도·IK 목표)를 보간해서 캔버스에 그린다.
// 좌표계: 월드 단위, x는 앞(오른쪽), y는 위(바닥 = 0).
// 각도: 0 = 아래, 90 = 앞(오른쪽), 180 = 위, -90 = 뒤(왼쪽).

export const DIM = { torso: 52, neck: 6, headR: 11, ua: 29, fa: 27, th: 43, sh: 42, foot: 13 };

const RAD = Math.PI / 180;
const dir = (a) => [Math.sin(a * RAD), -Math.cos(a * RAD)];
const add = (p, v, l) => [p[0] + v[0] * l, p[1] + v[1] * l];
const angOf = (v) => Math.atan2(v[0], -v[1]) / RAD;

function ik(root, target, l1, l2, bend) {
  const dx = target[0] - root[0], dy = target[1] - root[1];
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
  const joint = add(root, dir(angOf([dx, dy]) + bend * a), l1);
  const end = add(joint, dir(angOf([target[0] - joint[0], target[1] - joint[1]])), l2);
  return [joint, end];
}

// spec: [각도1, 각도2] 또는 { t: [x, y], bend: ±1 }
function limb(root, spec, l1, l2) {
  if (Array.isArray(spec)) {
    const j = add(root, dir(spec[0]), l1);
    return { pts: [root, j, add(j, dir(spec[1]), l2)], end: spec[1] };
  }
  const [j, e] = ik(root, spec.t, l1, l2, spec.bend ?? 1);
  return { pts: [root, j, e], end: angOf([e[0] - j[0], e[1] - j[1]]) };
}

const mirror = (spec) =>
  Array.isArray(spec) ? spec.map((a) => -a) : { t: [-spec.t[0], spec.t[1]], bend: -(spec.bend ?? 1) };

export function solve(pose, view = 'side') {
  const D = DIM;
  const hip = pose.hip;
  const tA = pose.torso ?? 180;
  const sh = add(hip, dir(tA), D.torso);
  const headA = pose.headA ?? tA + (pose.head || 0);
  const neckTop = add(sh, dir(headA), D.neck);
  const head = add(sh, dir(headA), D.neck + D.headR);
  const out = { view, hip, sh, neckTop, head, headA, tA };

  if (view === 'side') {
    for (const k of ['N', 'F']) {
      const arm = limb(sh, pose['arm' + k], D.ua, D.fa);
      const leg = limb(hip, pose['leg' + k], D.th, D.sh);
      const footA = pose['foot' + k] ?? (Array.isArray(pose['leg' + k]) ? leg.end + 90 : 90);
      out['arm' + k] = arm.pts;
      out['leg' + k] = [...leg.pts, add(leg.pts[2], dir(footA), D.foot)];
    }
  } else {
    const right = dir(tA - 90);
    const sides = { R: 1, L: -1 };
    const shLow = add(sh, dir(tA), -5);
    for (const k of ['R', 'L']) {
      const s = sides[k];
      const shK = add(shLow, right, 14 * s);
      const hipK = add(hip, right, 9.5 * s);
      const armSpec = pose['arm' + k] ?? (k === 'R' ? pose.arm : mirror(pose.arm));
      const legSpec = pose['leg' + k] ?? (k === 'R' ? pose.leg : mirror(pose.leg));
      const arm = limb(shK, armSpec, D.ua, D.fa);
      const leg = limb(hipK, legSpec, D.th, D.sh);
      out['arm' + k] = arm.pts;
      out['leg' + k] = [...leg.pts, add(leg.pts[2], [s * 0.85, -0.5], 8)];
    }
    out.shL = add(shLow, right, -14); out.shR = add(shLow, right, 14);
    out.hipL = add(hip, right, -9); out.hipR = add(hip, right, 9);
  }
  return out;
}

// ---- 포즈 보간 ----
function lerpVal(a, b, t) {
  if (typeof a === 'number') return typeof b === 'number' ? a + (b - a) * t : a;
  if (Array.isArray(a)) return a.map((v, i) => lerpVal(v, b?.[i], t));
  if (a && typeof a === 'object') {
    const o = {};
    for (const k of Object.keys(a)) o[k] = b && k in b ? lerpVal(a[k], b[k], t) : a[k];
    return o;
  }
  return a;
}

export function poseAt(ex, phase) {
  const fr = ex.frames;
  let p = ((phase % 1) + 1) % 1;
  for (let i = 0; i < fr.length; i++) {
    const [t0, p0] = fr[i];
    const [t1, p1] = i + 1 < fr.length ? fr[i + 1] : [1, fr[0][1]];
    if (p >= t0 && p < t1) {
      const u = (p - t0) / (t1 - t0);
      return lerpVal(p0, p1, u * u * (3 - 2 * u));
    }
  }
  return fr[0][1];
}

// ---- 렌더링 (여성 피트니스 모델 스타일) ----
const C = {
  skin: '#f6cdb3', skinF: '#dfae92', skinShade: '#e9b89c',
  hair: '#3b2420', hairHi: '#6b4234', tie: '#ff4f86',
  top: '#ff4f86', topF: '#cf3a69', topHi: '#ff86ab',
  leg: '#2c2850', legF: '#1f1c3b', legHi: '#4a4480',
  shoe: '#ffffff', shoeF: '#c9cdd8', sole: '#ff4f86',
  eye: '#2b1d1a', lip: '#d8566d', blush: 'rgba(255,120,140,.35)',
};

// 몸통 실루엣: [척추 위치 비율, 앞쪽 폭, 뒤쪽 폭]
const SIDE_BODY = [[-0.16, 7, 9], [0, 12, 14.5], [0.18, 11.5, 13], [0.42, 9.5, 9.5], [0.62, 11.5, 9.5], [0.78, 13.5, 10], [0.92, 10, 10], [1.05, 6, 7]];
const FRONT_BODY = [[-0.14, 10], [0, 15.5], [0.2, 14], [0.42, 10.5], [0.62, 12], [0.8, 14.5], [0.95, 15.5], [1.04, 12]];

function bounds(ex) {
  let x0 = Infinity, x1 = -Infinity, y1 = 0;
  for (let i = 0; i < 32; i++) {
    const s = solve(poseAt(ex, i / 32), ex.view);
    const pts = [s.hip, s.sh, s.head, ...s[ex.view === 'side' ? 'armN' : 'armR'], ...s[ex.view === 'side' ? 'armF' : 'armL'],
      ...s[ex.view === 'side' ? 'legN' : 'legR'], ...s[ex.view === 'side' ? 'legF' : 'legL']];
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  }
  return { x0: x0 - 22, x1: x1 + 22, y1: y1 + 18 };
}

export class Avatar {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ex = null;
    this.tail = null;
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(canvas);
  }
  destroy() { this.ro.disconnect(); }
  setExercise(ex) { this.ex = ex; this.b = bounds(ex); this.tail = null; this.fit(); }
  fit() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
    if (this.last != null) this.draw(this.last);
  }
  draw(phase) {
    this.last = phase;
    const { ctx, ex, b } = this;
    if (!ex || !this.w) return;
    const w = this.w, h = this.h;
    const ground = h * 0.88;
    const s = Math.min((w * 0.9) / (b.x1 - b.x0), (ground - h * 0.04) / b.y1);
    const ox = w / 2 - ((b.x0 + b.x1) / 2) * s;
    const P = (p) => [ox + p[0] * s, ground - p[1] * s];

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const k = solve(poseAt(ex, phase), ex.view);
    // 요가 매트
    const matW = Math.min(w * 0.92, (b.x1 - b.x0) * s);
    ctx.fillStyle = 'rgba(140,120,220,.22)';
    ctx.fillRect(w / 2 - matW / 2, ground, matW, 4);
    // 그림자
    const lift = Math.max(0, Math.min(k.hip[1], k.sh[1]) - 60);
    ctx.fillStyle = `rgba(0,0,0,${0.32 - Math.min(lift, 40) * 0.004})`;
    ctx.beginPath(); ctx.ellipse(P(k.hip)[0], ground + 1, 36 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();

    const dot = (p, r, col) => { const q = P(p); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(0.1, r * s), 0, Math.PI * 2); ctx.fill(); };
    const mid = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
    const seg = (a, c, wd, col) => {
      const p = P(a), q = P(c);
      ctx.strokeStyle = col; ctx.lineWidth = wd * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    };
    // 위가 굵고 아래로 가늘어지는 팔다리
    const taper = (a, c, w1, w2, col) => {
      const v = [c[0] - a[0], c[1] - a[1]], L = Math.hypot(v[0], v[1]) || 1, n = [-v[1] / L, v[0] / L];
      const pts = [add(a, n, w1 / 2), add(c, n, w2 / 2), add(c, n, -w2 / 2), add(a, n, -w1 / 2)].map(P);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.fill();
      dot(a, w1 / 2, col); dot(c, w2 / 2, col);
    };
    const smooth = (pts) => {
      const q = pts.map(P), n = q.length;
      ctx.beginPath();
      ctx.moveTo((q[n - 1][0] + q[0][0]) / 2, (q[n - 1][1] + q[0][1]) / 2);
      for (let i = 0; i < n; i++) {
        const a = q[i], c = q[(i + 1) % n];
        ctx.quadraticCurveTo(a[0], a[1], (a[0] + c[0]) / 2, (a[1] + c[1]) / 2);
      }
      ctx.closePath();
    };

    const arm = (pts, far) => {
      const [sh, el, hd] = pts;
      const sk = far ? C.skinF : C.skin;
      taper(el, hd, 7.5, 5.5, sk);
      taper(sh, el, 9.5, 7.5, sk);
      dot(hd, 4.3, sk);
    };
    const leg = (pts, far) => {
      const [hp, kn, an, toe] = pts;
      const lg = far ? C.legF : C.leg;
      seg(an, toe, 8.5, far ? C.shoeF : C.shoe);
      const v = dir(angOf([toe[0] - an[0], toe[1] - an[1]]) - 90);
      seg(add(an, v, -3.4), add(toe, v, -3.4), 2.4, C.sole);
      taper(mid(kn, an, 0.8), an, 7, 6, far ? C.skinF : C.skin); // 7부 레깅스 아래 발목
      taper(kn, mid(kn, an, 0.84), 10.5, 7.5, lg);
      taper(hp, kn, 16, 10.5, lg);
      if (!far) { seg(mid(hp, kn, 0.2), mid(hp, kn, 0.85), 1.3, C.legHi); seg(mid(kn, an, 0.12), mid(kn, an, 0.7), 1.1, C.legHi); }
    };

    const torsoPath = () => {
      const u = (t) => mid(k.hip, k.sh, t);
      if (k.view === 'side') {
        const fN = dir(k.tA - 90), bN = dir(k.tA + 90);
        const front = SIDE_BODY.map(([t, f]) => add(u(t), fN, f));
        const back = SIDE_BODY.map(([t, , bk]) => add(u(t), bN, bk)).reverse();
        return [...front, ...back];
      }
      const r = dir(k.tA - 90);
      return [...FRONT_BODY.map(([t, wd]) => add(u(t), r, wd)), ...FRONT_BODY.map(([t, wd]) => add(u(t), r, -wd)).reverse()];
    };
    const band = (t0, t1, col) => {
      const p = P(mid(k.hip, k.sh, t0)), q = P(mid(k.hip, k.sh, t1));
      ctx.strokeStyle = col; ctx.lineWidth = 44 * s; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    };
    const torso = () => {
      ctx.save();
      smooth(torsoPath()); ctx.fillStyle = C.skin; ctx.fill(); ctx.clip();
      band(-0.3, 0.36, C.leg);   // 하이웨이스트 레깅스
      band(0.33, 0.37, C.legHi); // 허리 밴드
      band(0.56, 0.9, C.top);    // 스포츠 브라
      band(0.56, 0.6, C.topHi);
      ctx.restore();
      if (k.view === 'front') {
        const r = dir(k.tA - 90);
        for (const sg of [1, -1]) seg(add(mid(k.hip, k.sh, 0.88), r, 9 * sg), add(k.sh, r, 7 * sg), 3, C.top);
        dot(mid(k.hip, k.sh, 0.46), 0.9, C.skinShade);
      } else {
        seg(add(mid(k.hip, k.sh, 0.88), dir(k.tA + 90), 7), add(k.sh, dir(k.tA + 90), 3), 3.2, C.top);
      }
    };

    const head = () => {
      const axis = dir(k.headA);
      taper(k.sh, k.neckTop, 7.5, 7, C.skinShade);
      if (k.view === 'side') {
        const face = dir(k.headA - 90);
        // 포니테일: 머리 뒤에서 늘어지고, 몸 움직임을 살짝 늦게 따라온다
        const base = add(add(k.head, axis, 6), face, -9);
        const target = add(add(base, [0, -1], 15), face, -5);
        this.tail = this.tail ? mid(this.tail, target, 0.2) : target;
        const tv = [this.tail[0] - base[0], this.tail[1] - base[1]], tl = Math.hypot(tv[0], tv[1]) || 1;
        const end = add(base, [tv[0] / tl, tv[1] / tl], 17);
        end[1] = Math.max(end[1], 2.5); // 바닥 아래로 내려가지 않게
        taper(base, mid(base, end, 0.5), 8, 7, C.hair);
        taper(mid(base, end, 0.5), end, 7, 2.5, C.hair);
        dot(k.head, 12.2, C.hair);
        dot(base, 3, C.tie);
        dot(add(add(k.head, face, 2.8), axis, -1.6), 9.7, C.skin);
        dot(add(add(k.head, face, 1.5), axis, -9), 3.6, C.skin); // 턱선
        dot(add(add(k.head, axis, 6.5), face, 4.2), 5.2, C.hair); // 앞머리
        dot(add(add(k.head, axis, 7.8), face, -1), 5.6, C.hair);
        dot(add(add(k.head, axis, 3), face, -6), 3.6, C.hairHi);
        const eye = add(add(k.head, face, 7.6), axis, 0.5);
        dot(eye, 1.5, C.eye);
        seg(add(eye, axis, 1.2), add(add(eye, axis, 2.2), face, 1.6), 0.8, C.eye); // 속눈썹
        dot(add(add(k.head, face, 6), axis, -3.2), 2.3, C.blush);
        dot(add(add(k.head, face, 10.2), axis, -4.8), 1.05, C.lip);
        dot(add(k.head, face, -1.5), 1.6, C.skinShade); // 귀
      } else {
        const r = dir(k.headA - 90);
        for (const sg of [1, -1]) taper(add(add(k.head, r, 9.5 * sg), axis, 2), add(add(k.head, r, 10 * sg), axis, -13), 7, 4, C.hair);
        dot(k.head, 12.4, C.hair);
        dot(add(k.head, axis, -2.6), 9.8, C.skin);
        dot(add(add(k.head, axis, 7.5), r, 4.5), 5.6, C.hair);
        dot(add(add(k.head, axis, 7.5), r, -4.5), 5.6, C.hair);
        dot(add(k.head, axis, 13.5), 4.2, C.hair); // 올림머리
        dot(add(k.head, axis, 11), 1.6, C.tie);
        for (const sg of [1, -1]) {
          const eye = add(add(k.head, r, 3.8 * sg), axis, -1.8);
          dot(eye, 1.45, C.eye);
          seg(add(eye, axis, 1.3), add(add(eye, axis, 2), r, 1.6 * sg), 0.7, C.eye);
          dot(add(add(k.head, r, 6 * sg), axis, -5), 2.2, C.blush);
        }
        const m = P(add(k.head, axis, -7.4));
        ctx.strokeStyle = C.lip; ctx.lineWidth = 1.3 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(m[0], m[1] - 1.6 * s, 2.4 * s, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      }
    };

    if (k.view === 'side') {
      arm(k.armF, true); leg(k.legF, true); torso(); leg(k.legN, false); head(); arm(k.armN, false);
    } else {
      leg(k.legL, false); leg(k.legR, false); torso(); arm(k.armL, false); arm(k.armR, false); head();
    }
  }
}

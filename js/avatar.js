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
      const shK = add(shLow, right, 17 * s);
      const hipK = add(hip, right, 9 * s);
      const armSpec = pose['arm' + k] ?? (k === 'R' ? pose.arm : mirror(pose.arm));
      const legSpec = pose['leg' + k] ?? (k === 'R' ? pose.leg : mirror(pose.leg));
      const arm = limb(shK, armSpec, D.ua, D.fa);
      const leg = limb(hipK, legSpec, D.th, D.sh);
      out['arm' + k] = arm.pts;
      out['leg' + k] = [...leg.pts, add(leg.pts[2], [s * 0.85, -0.5], 8)];
    }
    out.shL = add(shLow, right, -17); out.shR = add(shLow, right, 17);
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

// ---- 렌더링 ----
const C = {
  skin: '#f5c7a1', skinF: '#d9a984', hair: '#2b2235',
  shirt: '#ff6b4a', shirtF: '#c9482c', pants: '#3b4c80', pantsF: '#28365e',
  shoe: '#f4f6fb', shoeF: '#b9c0cf', eye: '#2b2235',
};

function bounds(ex) {
  let x0 = Infinity, x1 = -Infinity, y1 = 0;
  for (let i = 0; i < 32; i++) {
    const s = solve(poseAt(ex, i / 32), ex.view);
    const pts = [s.hip, s.sh, s.head, ...s[ex.view === 'side' ? 'armN' : 'armR'], ...s[ex.view === 'side' ? 'armF' : 'armL'],
      ...s[ex.view === 'side' ? 'legN' : 'legR'], ...s[ex.view === 'side' ? 'legF' : 'legL']];
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  }
  return { x0: x0 - 16, x1: x1 + 16, y1: y1 + 16 };
}

export class Avatar {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ex = null;
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(canvas);
  }
  destroy() { this.ro.disconnect(); }
  setExercise(ex) { this.ex = ex; this.b = bounds(ex); this.fit(); }
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

    // 바닥
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.05, ground + 1); ctx.lineTo(w * 0.95, ground + 1); ctx.stroke();

    const k = solve(poseAt(ex, phase), ex.view);
    // 그림자
    const lift = Math.max(0, Math.min(...[k.hip, k.sh].map((p) => p[1])) - 60);
    ctx.fillStyle = `rgba(0,0,0,${0.35 - Math.min(lift, 40) * 0.004})`;
    ctx.beginPath();
    ctx.ellipse(P(k.hip)[0], ground + 2, 34 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();

    const seg = (a, c, wd, col) => {
      const p = P(a), q = P(c);
      ctx.strokeStyle = col; ctx.lineWidth = wd * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    };
    const dot = (p, r, col) => { const q = P(p); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q[0], q[1], r * s, 0, Math.PI * 2); ctx.fill(); };
    const mid = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];

    const arm = (pts, far) => {
      const [sh, el, hd] = pts;
      seg(el, hd, 8.5, far ? C.skinF : C.skin);
      seg(sh, el, 10.5, far ? C.skinF : C.skin);
      seg(sh, mid(sh, el, 0.5), 13, far ? C.shirtF : C.shirt);
      dot(hd, 5, far ? C.skinF : C.skin);
    };
    const leg = (pts, far) => {
      const [hp, kn, an, toe] = pts;
      seg(an, toe, 8, far ? C.shoeF : C.shoe);
      seg(kn, an, 12, far ? C.pantsF : C.pants);
      seg(hp, kn, 15, far ? C.pantsF : C.pants);
    };
    const torso = () => {
      if (k.view === 'side') {
        seg(k.hip, k.sh, 25, C.shirt);
        seg(k.hip, mid(k.hip, k.sh, 0.22), 26, C.pants);
      } else {
        seg(k.hipL, k.shL, 14, C.shirt); seg(k.hipR, k.shR, 14, C.shirt);
        seg(k.hip, mid(k.hip, k.sh, 0.85), 30, C.shirt); seg(k.shL, k.shR, 14, C.shirt);
        seg(k.hipL, k.hipR, 16, C.pants);
        seg(k.hip, mid(k.hip, k.sh, 0.18), 30, C.pants);
      }
    };
    const head = () => {
      seg(k.sh, k.neckTop, 9, C.skin);
      const axis = dir(k.headA);
      if (k.view === 'side') {
        const face = dir(k.headA - 90);
        dot(k.head, 12, C.hair);
        const fc = add(add(k.head, face, 2.6), axis, -1.5);
        dot(fc, 9.6, C.skin);
        dot(add(add(k.head, face, 7.5), axis, 1), 1.5, C.eye);
        dot(add(add(k.head, axis, 9), face, -5), 4.5, C.hair); // 묶은 머리
      } else {
        dot(k.head, 12.2, C.hair);
        const fc = add(k.head, axis, -2.4);
        dot(fc, 9.8, C.skin);
        const right = dir(k.headA - 90);
        dot(add(add(k.head, right, 3.8), axis, -1.5), 1.5, C.eye);
        dot(add(add(k.head, right, -3.8), axis, -1.5), 1.5, C.eye);
        const m = P(add(k.head, axis, -6));
        ctx.strokeStyle = '#c7735a'; ctx.lineWidth = 1.2 * s;
        ctx.beginPath(); ctx.arc(m[0], m[1] - 1.6 * s, 2.6 * s, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      }
    };

    if (k.view === 'side') {
      arm(k.armF, true); leg(k.legF, true); torso(); leg(k.legN, false); head(); arm(k.armN, false);
    } else {
      leg(k.legL, false); leg(k.legR, false); torso(); arm(k.armL, false); arm(k.armR, false); head();
    }
  }
}

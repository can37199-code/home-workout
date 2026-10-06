// 운동 완료 공유 카드: 오늘 기록을 세로 이미지(1080×1350, 인스타 피드 비율)로 그려서 공유한다
import { isNative, nativeShareImage } from './native.js';

const C = { bg: '#111213', panel: '#1b1d1f', ink: '#ecedea', muted: '#8b9093', coral: '#f06a55', line: '#2a2d30' };
const FONT = '"Pretendard Variable", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

// info: { day, days, done: [bool...], min, kcal, total, streak, title, dateLabel }
export async function drawShareCard(info) {
  try { await document.fonts.load(`800 40px ${FONT}`); } catch { /* 글꼴이 없으면 기본 글꼴 */ }
  const W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const f = (w, px) => { g.font = `${w} ${px}px ${FONT}`; };

  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  // 오른쪽 위 은은한 빛
  const glow = g.createRadialGradient(W - 120, 160, 10, W - 120, 160, 620);
  glow.addColorStop(0, 'rgba(240,106,85,.42)'); glow.addColorStop(1, 'rgba(240,106,85,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  // 글자 로고
  g.fillStyle = C.ink; g.textBaseline = 'alphabetic';
  f(500, 54); g.fillText('오늘', 90, 150);
  const w1 = g.measureText('오늘').width;
  f(850, 54); g.fillText('홈트', 90 + w1 + 2, 150);
  const w2 = g.measureText('홈트').width;
  g.fillStyle = C.coral; g.beginPath(); g.arc(90 + w1 + w2 + 16, 142, 8, 0, Math.PI * 2); g.fill();

  // 날짜, Day
  g.fillStyle = C.muted; f(600, 36); g.fillText(info.dateLabel, 90, 300);
  g.fillStyle = C.ink; f(850, 230); g.fillText(`Day ${String(info.day).padStart(2, '0')}`, 80, 520);
  g.fillStyle = C.coral; f(800, 96); g.fillText('완료', 92, 640);
  const doneW = g.measureText('완료').width;
  g.fillStyle = C.muted; f(600, 40); g.fillText(`${info.days}일 챌린지 · ${info.title}`, 92 + doneW + 28, 632);

  // 진행 막대 (챌린지 기간)
  const n = info.days, x0 = 90, x1 = W - 90, gap = n > 40 ? 4 : 7, bw = (x1 - x0 - gap * (n - 1)) / n;
  info.done.forEach((d, k) => {
    g.fillStyle = d ? C.coral : k < info.day ? '#3a2a27' : C.line;
    const bh = k === info.day - 1 ? 64 : 44;
    roundRect(g, x0 + k * (bw + gap), 720 + (64 - bh), bw, bh, Math.min(6, bw / 2)); g.fill();
  });

  // 숫자 3칸
  const stats = [[`${info.min}`, '분', '운동 시간'], [`${info.kcal}`, 'kcal', '소모 칼로리'], [`${info.streak}`, '일', '연속 기록']];
  const cw = (W - 180 - 40) / 3;
  stats.forEach(([v, u, label], k) => {
    const x = 90 + k * (cw + 20), y = 880;
    g.fillStyle = C.panel; roundRect(g, x, y, cw, 260, 36); g.fill();
    g.fillStyle = C.ink; f(850, 92); g.fillText(v, x + 36, y + 140);
    const vw = g.measureText(v).width;
    g.fillStyle = C.muted; f(700, 36); g.fillText(u, x + 44 + vw, y + 140);
    f(600, 32); g.fillText(label, x + 36, y + 210);
  });

  g.fillStyle = C.muted; f(500, 30);
  g.fillText(`총 ${info.total.toLocaleString()}회 · 집에서 매일 조금씩`, 90, 1250);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// 공유: 앱은 안드로이드 공유 화면, 웹은 공유 시트(안 되면 이미지 내려받기). 사용자가 닫으면 false
export async function shareCard(blob, name) {
  if (isNative()) {
    const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
    return nativeShareImage(name, b64);
  }
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

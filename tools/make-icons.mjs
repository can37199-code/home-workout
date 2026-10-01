// 아바타 스쿼트 자세로 앱 아이콘 PNG를 만든다 (PowerShell System.Drawing 사용)
import { solve, poseAt } from '../js/avatar.js';
import { EXERCISES } from '../js/exercises.js';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const k = solve(poseAt(EXERCISES.squat, 0.5), 'side');
const pts = [k.hip, k.sh, k.head, ...k.armN, ...k.legN];
const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;

function script(size, inner, file) {
  const s = (size * inner) / 120; // inner: 아이콘 폭 대비 그림 비율
  const P = (p) => `${(size / 2 + (p[0] - cx) * s).toFixed(1)},${(size / 2 - (p[1] - cy) * s).toFixed(1)}`;
  const line = (a, b, w) => `$g.DrawLine((New-Pen ${(w * s).toFixed(1)}), ${P(a)}, ${P(b)})`;
  const [hx, hy] = P(k.head).split(',').map(Number);
  const r = 13 * s;
  return `
$bmp = New-Object System.Drawing.Bitmap ${size},${size}
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$rect = New-Object System.Drawing.Rectangle 0,0,${size},${size}
$br = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255,255,107,74)), ([System.Drawing.Color]::FromArgb(255,255,160,74)), 45
$g.FillRectangle($br, $rect)
${line(k.legN[0], k.legN[1], 16)}
${line(k.legN[1], k.legN[2], 14)}
${line(k.legN[2], k.legN[3], 10)}
${line(k.hip, k.sh, 24)}
${line(k.armN[0], k.armN[1], 11)}
${line(k.armN[1], k.armN[2], 10)}
$g.FillEllipse([System.Drawing.Brushes]::White, ${(hx - r).toFixed(1)}, ${(hy - r).toFixed(1)}, ${(2 * r).toFixed(1)}, ${(2 * r).toFixed(1)})
$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()`;
}
const head = `Add-Type -AssemblyName System.Drawing
function New-Pen($w) { $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), $w; $p.StartCap='Round'; $p.EndCap='Round'; return $p }`;
const dir = process.cwd().replace(/^\/c\//, 'C:/');
const ps = [head,
  script(192, 0.68, `${dir}/icons/icon-192.png`),
  script(512, 0.68, `${dir}/icons/icon-512.png`),
  script(512, 0.5, `${dir}/icons/icon-maskable-512.png`)].join('\n');
writeFileSync('tools/.icons.ps1', ps);
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/.icons.ps1'], { stdio: 'inherit' });

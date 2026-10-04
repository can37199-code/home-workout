// js/voice-lines.js의 문장으로 음성 파일(media/voice/<key>.mp3)을 만든다.
// 준비: npm install (devDependencies의 msedge-tts) → 실행: node tools/make-voice.mjs [--force]
// Edge 신경망 음성(ko-KR-SunHiNeural)을 쓰며, 이미 있는 파일은 건너뛴다(--force면 다시 만든다).
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES, RATE } from '../js/voice-lines.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'media', 'voice');
fs.mkdirSync(out, { recursive: true });
const force = process.argv.includes('--force');

async function synth(text, rate) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata('ko-KR-SunHiNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, { rate });
  const chunks = [];
  await new Promise((res, rej) => { audioStream.on('data', (c) => chunks.push(c)); audioStream.on('close', res); audioStream.on('error', rej); });
  tts.close?.();
  return Buffer.concat(chunks);
}

// 앞뒤 무음을 잘라서 박자에 바로 맞게 한다 (ffmpeg 필요)
import { spawnSync } from 'node:child_process';
function trim(file) {
  const tmp = file + '.tmp.mp3';
  const af = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse';
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-af', af, '-ac', '1', '-b:a', '48k', tmp]);
  if (r.status === 0) fs.renameSync(tmp, file); else fs.rmSync(tmp, { force: true });
}
if (process.argv.includes('--trim-only')) {
  for (const key of Object.keys(LINES)) { const f = path.join(out, `${key}.mp3`); if (fs.existsSync(f)) trim(f); }
  console.log('무음 정리 완료');
  process.exit();
}

let made = 0;
for (const [key, text] of Object.entries(LINES)) {
  const file = path.join(out, `${key}.mp3`);
  if (!force && fs.existsSync(file)) continue;
  for (let tryN = 1; tryN <= 3; tryN++) {
    try {
      const buf = await synth(text, RATE(key));
      if (buf.length < 1000) throw new Error('too small');
      fs.writeFileSync(file, buf); trim(file); made++;
      break;
    } catch (e) {
      if (tryN === 3) { console.error('실패', key, e.message); process.exitCode = 1; }
    }
  }
}
console.log(`만든 파일 ${made}개, 전체 ${Object.keys(LINES).length}개`);
process.exit();

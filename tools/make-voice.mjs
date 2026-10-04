// js/voice-lines.js의 문장으로 음성 파일(media/voice/<key>.mp3)을 만든다.
// Microsoft Azure Speech 공식 API(ko-KR-SunHiNeural)를 쓴다. 상업적 이용은 Azure 약관을 따른다.
// 준비: Azure 포털에서 "Speech" 리소스(무료 F0)를 만들고 키와 지역을 환경변수로 넣는다.
//   AZURE_SPEECH_KEY=<키> AZURE_SPEECH_REGION=koreacentral node tools/make-voice.mjs [--force]
// 이미 있는 파일은 건너뛴다(--force면 모두 다시 만든다). --trim-only는 앞뒤 무음만 다시 자른다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LINES, RATE } from '../js/voice-lines.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'media', 'voice');
fs.mkdirSync(out, { recursive: true });
const force = process.argv.includes('--force');
const VOICE = 'ko-KR-SunHiNeural';

// 앞뒤 무음을 잘라서 박자에 바로 맞게 한다 (ffmpeg 필요)
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

const KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION || 'koreacentral';
if (!KEY) { console.error('AZURE_SPEECH_KEY 환경변수가 필요해요. 파일 맨 위 설명을 보세요.'); process.exit(1); }

const esc = (t) => t.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
async function synth(text, rate) {
  const ssml = `<speak version="1.0" xml:lang="ko-KR"><voice name="${VOICE}"><prosody rate="${rate}">${esc(text)}</prosody></voice></speak>`;
  const r = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'home-workout-voice',
    },
    body: ssml,
  });
  if (r.status === 429) { const e = new Error('429'); e.wait = 5000; throw e; }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let made = 0, chars = 0;
for (const [key, text] of Object.entries(LINES)) {
  const file = path.join(out, `${key}.mp3`);
  if (!force && fs.existsSync(file)) continue;
  for (let tryN = 1; tryN <= 4; tryN++) {
    try {
      const buf = await synth(text, RATE(key));
      if (buf.length < 1000) throw new Error('too small');
      fs.writeFileSync(file, buf); trim(file); made++; chars += text.length;
      break;
    } catch (e) {
      if (tryN === 4 || /^40[13]/.test(e.message)) { console.error('실패', key, e.message); process.exitCode = 1; if (/^40[13]/.test(e.message)) process.exit(1); break; }
      await sleep(e.wait || 1500 * tryN);
    }
  }
  await sleep(3100); // 무료(F0) 요금제 한도: 60초에 20건 → 124개면 약 7분
}
console.log(`만든 파일 ${made}개 (${chars}자), 전체 ${Object.keys(LINES).length}개`);

// 안드로이드 앱용 웹 파일을 www/에 모은다 → npx cap sync android
// --release: 출시용(테스트 메뉴 없음). 없으면 테스트용(테스트 메뉴 있음)
// 웹(GitHub Pages)과 같은 코드를 쓰고, 앱용 index.html에만 capacitor.js를 넣는다. 영상·음성은 앱 안에 들어가 오프라인에서도 바로 재생된다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true });
for (const p of ['css', 'js', 'media', 'icons', 'fonts', 'manifest.webmanifest']) fs.cpSync(path.join(root, p), path.join(www, p), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(www, 'js/capacitor.js'));
const release = process.argv.includes('--release');
fs.writeFileSync(path.join(www, 'js/flags.js'), `// tools/build-native.mjs가 만든 파일 (${release ? '출시용' : '테스트용'})
export const FLAGS = { ownerUnlocked: false, testMenu: ${!release} };
`);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tag = '<script src="js/push-messages.js"></script>';
if (!html.includes(tag)) throw new Error('index.html에서 push-messages.js 줄을 찾지 못했어요');
fs.writeFileSync(path.join(www, 'index.html'), html.replace(tag, `<script src="js/capacitor.js"></script>\n  ${tag}`));
console.log(`www/ 준비 완료 (${release ? '출시용' : '테스트용'})`);

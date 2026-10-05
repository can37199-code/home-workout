// 안드로이드 앱(Capacitor)에서만 쓰는 기능: 폰이 직접 울리는 예약 알림, 뒤로 가기 버튼
// 웹(GitHub Pages)에서는 모두 아무것도 하지 않는다. capacitor.js는 tools/build-native.mjs가 앱용 index.html에만 넣는다.
const C = window.Capacitor;
export const isNative = () => !!C?.isNativePlatform?.();
const reg = window.capacitorExports?.registerPlugin || C?.registerPlugin;
const LN = isNative() ? reg('LocalNotifications') : null;
const App = isNative() ? reg('App') : null;
const Awake = isNative() ? reg('KeepAwake') : null; // MainActivity.java 안의 작은 플러그인

// 운동 중 화면 꺼짐 방지 (앱에서만. 웹은 player.js가 Wake Lock API를 쓴다)
export const keepAwake = (on) => { Awake?.[on ? 'keepAwake' : 'allowSleep']().catch(() => {}); };

const DAYS = 14; // 앞으로 14일치 저녁 알림을 미리 걸어 둔다 (앱을 열거나 기록이 바뀔 때마다 다시 건다)
const BASE_ID = 1000; // 1000~1013: 매일 알림, 1100: 지금 바로 보내는 알림
const CHANNEL = 'daily';

let channelReady = false;
async function ensureChannel() {
  if (channelReady) return;
  await LN.createChannel({ id: CHANNEL, name: '매일 운동 알림', description: '저녁 운동 독려와 오늘의 성과', importance: 4, visibility: 1 }).catch(() => {});
  channelReady = true;
}

// 'granted' | 'denied' | 'prompt' (웹이면 null)
export async function nativeNotifyPermission() {
  if (!LN) return null;
  return (await LN.checkPermissions()).display;
}
export async function nativeNotifyEnable() {
  const p = await LN.requestPermissions();
  return p.display === 'granted';
}

const note = (id, m, at) => ({
  id, title: m.title, body: m.body, largeBody: m.body, channelId: CHANNEL, smallIcon: 'ic_stat_notify', iconColor: '#E8613C',
  ...(at ? { schedule: { at, allowWhileIdle: true } } : {}),
});

// 저장된 기록으로 앞으로 14일의 저녁 알림 문구를 만들어 다시 건다.
// 오늘 운동을 이미 했으면 오늘 알림은 성과 정리, 아직이면 독려. 미래 날짜는 "그날까지 운동 안 함"을 기준으로 만든다
// → 앱을 다시 열지 않고 지나간 날이 있으면 그 상황(연속 기록 위기 등)에 맞는 문구가 그대로 맞다.
export async function nativeReschedule(data, hour) {
  if (!LN) return;
  const ids = Array.from({ length: DAYS }, (_, i) => ({ id: BASE_ID + i }));
  await LN.cancel({ notifications: ids }).catch(() => {});
  if (data.prefs?.notify !== true || (await nativeNotifyPermission()) !== 'granted') return;
  await ensureChannel();
  const now = new Date();
  const list = [];
  for (let i = 0; i < DAYS; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, 0, 0);
    if (at <= now) continue;
    list.push(note(BASE_ID + i, self.buildPushMessage(data, at), at));
  }
  if (list.length) await LN.schedule({ notifications: list });
}

// 지금 상태의 문구를 바로 띄운다 (미리보기, 8시 이후 운동을 마쳤을 때)
export async function nativeShowNow(data) {
  if (!LN || (await nativeNotifyPermission()) !== 'granted') return false;
  await ensureChannel();
  await LN.schedule({ notifications: [note(BASE_ID + 100, self.buildPushMessage(data), new Date(Date.now() + 1000))] });
  return true;
}

// 안드로이드 뒤로 가기: handler가 true를 돌려주면 처리한 것, 아니면 앱을 백그라운드로 보낸다
export function onBackButton(handler) {
  App?.addListener('backButton', () => { if (!handler()) App.minimizeApp(); });
}
// 앱이 다시 앞으로 나올 때 (알림을 다시 걸 기회)
export function onResume(fn) {
  App?.addListener('resume', fn);
}

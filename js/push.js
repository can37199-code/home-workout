// 푸시 알림: 구독(이 폰이 알림을 받을 주소 만들기)과 앱 안에서 바로 띄우는 성과 알림
// 매일 저녁 8시 발송은 GitHub Actions(.github/workflows/push.yml)가 하고, 문구는 받는 순간 서비스 워커가 만든다.
export const VAPID_PUBLIC_KEY = 'BK4WMUJgLaKt_V5NP80f7JgWwmXaNI296juqxeTJ93xOkr7isIdZm_JPw3TvmCgT1j564kI3OtB7kMexj7knVxo';
export const PUSH_HOUR = 20;

const b64 = (s) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// 알림 권한을 받고 구독을 만든다. 성공하면 GitHub Secret에 넣을 JSON 문자열을 돌려준다.
export async function enablePush() {
  if (!pushSupported()) throw new Error('unsupported');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC_KEY) }));
  return JSON.stringify(sub.toJSON());
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) await sub.unsubscribe();
}

// 지금 상태로 만든 문구를 바로 띄운다 (미리보기, 8시 이후에 운동을 마쳤을 때)
export async function showNow(data) {
  if (!pushSupported() || Notification.permission !== 'granted' || !self.buildPushMessage) return false;
  const reg = await navigator.serviceWorker.ready;
  const m = self.buildPushMessage(data);
  await reg.showNotification(m.title, { body: m.body, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'daily', renotify: true, data: { url: './' } });
  return true;
}

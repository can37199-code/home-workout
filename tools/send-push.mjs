// GitHub Actions에서 실행: 등록된 폰(들)으로 웹 푸시를 보낸다.
// PUSH_SUBSCRIPTION: 앱 설정에서 복사한 구독 정보 JSON (여러 대면 JSON 배열)
import webpush from 'web-push';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION } = process.env;
if (!PUSH_SUBSCRIPTION) {
  console.log('PUSH_SUBSCRIPTION이 아직 등록되지 않아 건너뜀');
  process.exit(0);
}

webpush.setVapidDetails('https://can37199-code.github.io/home-workout/', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const parsed = JSON.parse(PUSH_SUBSCRIPTION);
const subs = Array.isArray(parsed) ? parsed : [parsed];

for (const sub of subs) {
  try {
    // 내용은 비워 두고(type만), 문구는 폰이 오늘 기록을 보고 만든다. 4시간 안에 못 받으면 버린다.
    const res = await webpush.sendNotification(sub, JSON.stringify({ type: 'daily', sentAt: Date.now() }), { TTL: 4 * 3600, urgency: 'high' });
    console.log('보냄', res.statusCode);
  } catch (e) {
    // 404/410이면 구독이 만료된 것: 앱에서 알림을 다시 켜고 새 구독 정보를 등록해야 한다
    console.error('실패', e.statusCode, e.body);
    process.exitCode = 1;
  }
}

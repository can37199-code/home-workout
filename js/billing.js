// 유료 구조: 챌린지를 만든 날부터 7일 무료 체험 → 평생 이용권(한 번 결제, 구독 아님)
// 실제 Google Play 결제(RevenueCat)는 개발자 계정이 생긴 뒤 provider만 바꿔 끼운다.
// 지금은 테스트 결제(provider = testProvider)로 화면과 흐름을 모두 시험할 수 있다. 실제 돈은 나가지 않는다.
import { db, save, today, addDays, diffDays } from './store.js';
import { FLAGS } from './flags.js';

export const PRODUCT = { id: 'homet_premium_lifetime', name: '오늘홈트 평생 이용권', priceLabel: '9,900원' };
export const TRIAL_DAYS = 7;

// db().billing = { trialStart, premium, purchasedAt, pending, test: { storeOwned, salesPreview } }
const B = () => (db().billing ||= {});

// 체험 시작: 첫 챌린지를 만들 때 한 번만
export function ensureTrial() {
  if (!B().trialStart) { B().trialStart = today(); save(); }
}

// status: owner(개발자용 웹, 모두 열림) | premium(구매함) | trial(체험 중) | expired(체험 끝)
export function access() {
  const b = B();
  if (FLAGS.ownerUnlocked && !b.test?.salesPreview) return { status: 'owner' };
  if (b.premium) return { status: 'premium', since: b.purchasedAt };
  const start = b.trialStart || today();
  const left = TRIAL_DAYS - diffDays(start, today());
  if (left > 0) return { status: 'trial', daysLeft: left, endsOn: addDays(start, TRIAL_DAYS - 1), pending: !!b.pending };
  return { status: 'expired', pending: !!b.pending };
}
export const canWorkout = () => access().status !== 'expired';

function grant() {
  const b = B();
  b.premium = true; b.purchasedAt = today(); b.pending = false;
  if (b.test) b.test.storeOwned = true;
  save();
}

// ---------- 결제 제공자 ----------
// purchase(): 'success' | 'cancel' | 'error' | 'pending'
// 테스트 제공자: 실제 결제 화면 대신 app.js가 띄우는 "테스트 결제" 시트에서 결과를 고른다
let askTestResult = async () => 'cancel';
export const setTestSheet = (fn) => { askTestResult = fn; };

const testProvider = {
  async purchase() { return askTestResult(); },
  // 같은 계정으로 예전에 산 적이 있는지 (테스트: storeOwned)
  async restore() { return !!B().test?.storeOwned; },
};
const provider = testProvider; // TODO(결제 연동): 앱에서는 RevenueCat 제공자로 바꾼다

export const isTestPayment = () => provider === testProvider;

export async function purchase() {
  const r = await provider.purchase();
  if (r === 'success') grant();
  if (r === 'pending') { B().pending = true; save(); }
  return r;
}
export async function restore() {
  const ok = await provider.restore();
  if (ok) grant();
  return ok;
}

// ---------- 테스트 메뉴용 ----------
const T = () => (B().test ||= {});
export const testTools = {
  trialFresh() { B().trialStart = today(); save(); },
  trialLastDay() { B().trialStart = addDays(today(), -(TRIAL_DAYS - 1)); save(); },
  trialExpire() { B().trialStart = addDays(today(), -TRIAL_DAYS); save(); },
  // 보류 중이던 결제가 승인됨 (편의점 결제 등)
  approvePending() { if (B().pending) grant(); },
  // 환불·구매 취소: 계정에서도 구매 기록이 사라진다
  refund() { const b = B(); b.premium = false; b.purchasedAt = null; b.pending = false; T().storeOwned = false; save(); },
  // 앱을 지우고 다시 설치: 이 폰의 구매 표시만 사라지고 계정 구매 기록은 남는다 → "구매 복원"으로 되살린다
  reinstall() { const b = B(); b.premium = false; b.purchasedAt = null; save(); },
  toggleSalesPreview() { T().salesPreview = !T().salesPreview; save(); return T().salesPreview; },
  resetAll() { db().billing = { trialStart: today() }; save(); },
};

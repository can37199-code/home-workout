// 앱 전체가 함께 쓰는 AudioContext (사용자가 버튼을 누를 때 처음 만들어야 소리가 난다)
let ctx = null;
export function getAudioCtx() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

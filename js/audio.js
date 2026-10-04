// 앱 전체가 함께 쓰는 AudioContext (사용자가 버튼을 누를 때 처음 만들어야 소리가 난다)
let ctx = null;
export function getAudioCtx() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 아이폰 무음 스위치: 웹 소리는 기본으로 무음 스위치를 따른다.
// 운동하는 동안에는 "재생" 모드로 바꿔서 무음 스위치를 켜 둬도 음성·음악이 나오게 한다.
//  - iOS 17 이상: navigator.audioSession.type = 'playback'
//  - 그 아래: 소리 없는 오디오를 반복 재생하면 미디어 재생으로 취급되어 Web Audio도 함께 들린다
let silent = null;
export function startPlaybackMode() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* 지원 안 함 */ }
  try {
    if (!silent) {
      silent = new Audio('media/silence.mp3');
      silent.loop = true;
      silent.setAttribute('playsinline', '');
    }
    silent.play().catch(() => {});
  } catch { /* 지원 안 함 */ }
  getAudioCtx();
}

export function stopPlaybackMode() {
  try { silent?.pause(); } catch { /* 이미 멈춤 */ }
  // 운동이 끝나면 다른 앱의 음악을 방해하지 않도록 기본 모드로 돌려 놓는다
  try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch { /* 지원 안 함 */ }
}

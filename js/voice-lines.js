// 음성 안내 문장 목록. tools/make-voice.mjs가 이 목록으로 media/voice/<key>.mp3를 만든다 (Edge 신경망 음성 ko-KR-SunHiNeural).
// 문장을 바꾸면 make-voice를 다시 돌리고 sw.js의 MEDIA_CACHE를 올린다.
const NATIVE = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든'];
export const MAX_COUNT = 80;
export const korCount = (n) => TENS[Math.floor(n / 10)] + NATIVE[n % 10];

// 동작 소개 (화면의 자세 포인트와 같은 내용을 말로 풀어서)
export const INTRO = {
  squat: '스쿼트입니다. 발은 어깨너비로 벌리고, 의자에 앉듯 엉덩이를 뒤로 빼면서 내려가세요. 무릎은 발끝과 같은 방향이에요.',
  lunge: '제자리 런지입니다. 다리를 앞뒤로 벌리고 상체는 곧게 세우세요. 뒷무릎이 바닥에 닿기 직전까지 천천히 내려갑니다. 절반을 하면 다리를 바꿔요.',
  pushup: '푸시업입니다. 손은 어깨 바로 아래에 두고, 머리부터 발끝까지 일직선을 유지하세요. 몸 전체를 바닥 가까이까지 내렸다가 밀어 올립니다.',
  kneePushup: '무릎 푸시업입니다. 무릎을 바닥에 대고, 무릎부터 머리까지 일직선을 만드세요. 팔꿈치는 몸 쪽으로 비스듬히 굽혀요.',
  plank: '플랭크입니다. 팔꿈치는 어깨 바로 아래에 두고, 배에 힘을 꽉 주세요. 숨은 참지 말고 천천히 쉬세요.',
  jumpingJack: '점핑잭입니다. 가볍게 뛰면서 다리를 벌리고, 팔은 머리 위로 올려 주세요. 착지할 때는 무릎을 살짝 굽혀요.',
  highKnees: '하이니입니다. 제자리에서 무릎을 골반 높이까지 번갈아 올리세요. 팔도 크게 앞뒤로 흔들어 주세요.',
  mountainClimber: '마운틴 클라이머입니다. 팔을 펴고 엎드린 자세에서, 무릎을 몸 쪽으로 번갈아 당기세요. 허리가 들리지 않게 해요.',
  gluteBridge: '글루트 브릿지입니다. 누워서 무릎을 세우고, 힘을 주면서 골반을 들어 올리세요. 위에서 1초 멈췄다가 천천히 내려옵니다.',
  crunch: '크런치입니다. 허리는 바닥에 붙인 채, 배꼽을 보면서 어깨만 들어 올리세요. 목에는 힘을 빼세요.',
  legRaise: '레그 레이즈입니다. 누워서 다리를 붙이고 쭉 펴세요. 허리가 뜨지 않게, 다리를 천천히 올렸다 내립니다.',
  burpee: '버피입니다. 쪼그려 앉아 손을 짚고, 다리를 뒤로 보내 엎드린 다음, 다시 모아서 위로 점프하세요.',
};

const NAMES = {
  squat: '스쿼트', lunge: '제자리 런지', pushup: '푸시업', kneePushup: '무릎 푸시업', plank: '플랭크', jumpingJack: '점핑잭',
  highKnees: '하이니', mountainClimber: '마운틴 클라이머', gluteBridge: '글루트 브릿지', crunch: '크런치', legRaise: '레그 레이즈', burpee: '버피',
};

export const LINES = {};
for (let n = 1; n <= MAX_COUNT; n++) LINES[`count-${n}`] = korCount(n);
for (const [id, t] of Object.entries(INTRO)) LINES[`intro-${id}`] = t;
for (const [id, name] of Object.entries(NAMES)) LINES[`next-${id}`] = `좋아요. 잠깐 쉬어요. 다음은 ${name}입니다.`;
LINES['rest-same'] = '좋아요. 잠깐 숨 고르고, 다음 세트 갑니다.';
LINES.start = '시작!';
for (let s = 2; s <= 5; s++) LINES[`set-${s}`] = `${s}세트, 시작!`;
LINES['set-last'] = '마지막 세트예요. 시작!';
for (let s = 10; s <= 90; s += 10) LINES[`left-${s}`] = `${s}초 남았어요.`;
LINES.half = '절반 왔어요. 좋아요!';
LINES['switch-legs'] = '좋아요. 다리를 바꿔서 계속해요!';
LINES['last-3'] = '마지막 세 번!';
LINES.done = '오늘 운동 완료! 정말 수고 많았어요.';

// 숫자처럼 짧은 문장은 조금 빠르게
export const RATE = (key) => (key.startsWith('count-') ? '+15%' : key.startsWith('intro-') ? '+5%' : '+0%');

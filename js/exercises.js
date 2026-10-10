// 동작 정의: frames = [[구간 시작 비율(0~1), 포즈], ...], 마지막 포즈 뒤에는 첫 포즈로 돌아온다.
// base = 1회 동작 기본 시간(초), met = 칼로리 계산용 운동 강도.

const standLegs = { legN: { t: [3, 6], bend: 1 }, legF: { t: [-3, 6], bend: 1 } };
const flatArms = { armN: { t: [14, 4], bend: 1 }, armF: { t: [12, 4], bend: 1 } };

export const EXERCISES = {
  squat: {
    name: '스쿼트', view: 'side', type: 'reps', base: 2.6, met: 5,
    tips: ['발은 어깨너비로 벌려요', '엉덩이를 뒤로 빼며 의자에 앉듯이', '무릎이 발끝 방향을 향하게'],
    frames: [
      [0, { hip: [0, 90], torso: 180, armN: [8, 12], armF: [2, 8], ...standLegs }],
      [0.5, { hip: [-28, 50], torso: 145, armN: [82, 86], armF: [76, 80], legN: { t: [8, 6], bend: 1 }, legF: { t: [2, 6], bend: 1 } }],
    ],
  },
  lunge: {
    name: '제자리 런지', view: 'side', type: 'reps', base: 2.8, met: 5, sides: true, unit: '절반에서 다리 바꾸기',
    tips: ['다리를 앞뒤로 벌리고 상체는 곧게', '뒷무릎이 바닥에 닿기 직전까지', '절반을 하면 앞뒤 다리를 바꿔요'],
    frames: [
      [0, { hip: [-2, 84], torso: 180, armN: { t: [4, 88], bend: -1 }, armF: { t: [0, 88], bend: -1 },
        legN: { t: [28, 6], bend: 1 }, legF: { t: [-32, 10], bend: 1 }, footF: 53 }],
      [0.5, { hip: [-4, 50], torso: 178, armN: { t: [2, 54], bend: -1 }, armF: { t: [-2, 54], bend: -1 },
        legN: { t: [28, 6], bend: 1 }, legF: { t: [-32, 10], bend: 1 }, footF: 53 }],
    ],
  },
  pushup: {
    name: '푸시업', view: 'side', type: 'reps', base: 2.4, met: 4,
    tips: ['손은 어깨 바로 아래', '머리부터 발끝까지 일직선', '가슴이 바닥 가까이 갈 때까지'],
    frames: [
      [0, { hip: [-9.5, 40], torso: 107.8, armN: { t: [40, 4], bend: -1 }, armF: { t: [38, 4], bend: -1 },
        legN: { t: [-90, 14], bend: 1 }, legF: { t: [-92, 14], bend: 1 }, footN: 20, footF: 20 }],
      [0.5, { hip: [-5, 19.5], torso: 93.3, armN: { t: [40, 4], bend: -1 }, armF: { t: [38, 4], bend: -1 },
        legN: { t: [-90, 14], bend: 1 }, legF: { t: [-92, 14], bend: 1 }, footN: 20, footF: 20 }],
    ],
  },
  kneePushup: {
    name: '무릎 푸시업', view: 'side', type: 'reps', base: 2.4, met: 3.5,
    tips: ['무릎을 바닥에 대고 시작해요', '무릎부터 머리까지 일직선', '팔꿈치는 몸쪽으로 45도'],
    frames: [
      [0, { hip: [-4.2, 28.6], torso: 121.8, armN: { t: [40, 4], bend: -1 }, armF: { t: [38, 4], bend: -1 },
        legN: { t: [-77, 27], bend: 1 }, legF: { t: [-79, 27], bend: 1 }, footN: -100, footF: -100 }],
      [0.5, { hip: [1.5, 13.2], torso: 99.7, armN: { t: [40, 4], bend: -1 }, armF: { t: [38, 4], bend: -1 },
        legN: { t: [-77, 27], bend: 1 }, legF: { t: [-79, 27], bend: 1 }, footN: -100, footF: -100 }],
    ],
  },
  plank: {
    name: '플랭크', view: 'side', type: 'hold', base: 3.2, met: 4,
    tips: ['팔꿈치는 어깨 바로 아래', '배와 엉덩이에 힘을 꽉', '숨은 참지 말고 천천히'],
    frames: [
      [0, { hip: [-16.4, 27], torso: 98.8, armN: { t: [62, 4], bend: -1 }, armF: { t: [60, 4], bend: -1 },
        legN: { t: [-100, 14], bend: 1 }, legF: { t: [-102, 14], bend: 1 }, footN: 20, footF: 20 }],
      [0.5, { hip: [-16.4, 29], torso: 98, armN: { t: [62, 4], bend: -1 }, armF: { t: [60, 4], bend: -1 },
        legN: { t: [-100, 14], bend: 1 }, legF: { t: [-102, 14], bend: 1 }, footN: 20, footF: 20 }],
    ],
  },
  jumpingJack: {
    name: '점핑잭', view: 'front', type: 'reps', base: 1.3, met: 8,
    tips: ['가볍게 뒤꿈치를 들고 뛰어요', '팔은 머리 위에서 박수', '착지는 무릎을 살짝 굽혀서'],
    frames: [
      [0, { hip: [0, 89], torso: 180, arm: [14, 8], leg: { t: [11, 6], bend: 1 } }],
      [0.25, { hip: [0, 97], torso: 180, arm: [95, 110], leg: { t: [22, 14], bend: 1 } }],
      [0.5, { hip: [0, 86], torso: 180, arm: [158, 172], leg: { t: [30, 6], bend: 1 } }],
      [0.75, { hip: [0, 97], torso: 180, arm: [95, 110], leg: { t: [22, 14], bend: 1 } }],
    ],
  },
  highKnees: {
    name: '하이니', view: 'side', type: 'reps', base: 0.9, met: 8, unit: '좌우 1회',
    tips: ['무릎을 골반 높이까지', '팔을 크게 앞뒤로 흔들어요', '발 앞꿈치로 가볍게'],
    frames: [
      [0, { hip: [0, 92], torso: 182, armN: [-30, 30], armF: [45, 150],
        legN: { t: [43, 50], bend: 1 }, legF: { t: [0, 8], bend: 1 }, footN: 40, footF: 60 }],
      [0.25, { hip: [0, 88], torso: 180, armN: [10, 70], armF: [10, 70],
        legN: { t: [6, 8], bend: 1 }, legF: { t: [-4, 8], bend: 1 }, footN: 60, footF: 60 }],
      [0.5, { hip: [0, 92], torso: 182, armN: [45, 150], armF: [-30, 30],
        legN: { t: [0, 8], bend: 1 }, legF: { t: [43, 50], bend: 1 }, footN: 60, footF: 40 }],
      [0.75, { hip: [0, 88], torso: 180, armN: [10, 70], armF: [10, 70],
        legN: { t: [-4, 8], bend: 1 }, legF: { t: [6, 8], bend: 1 }, footN: 60, footF: 60 }],
    ],
  },
  mountainClimber: {
    name: '마운틴 클라이머', view: 'side', type: 'reps', base: 1.1, met: 8, unit: '좌우 1회',
    tips: ['팔을 펴고 엎드린 자세에서', '무릎을 가슴 쪽으로 번갈아', '엉덩이가 들리지 않게'],
    frames: [
      [0, { hip: [-9.5, 42], torso: 106, armN: { t: [40, 4], bend: -1 }, armF: { t: [38, 4], bend: -1 },
        legN: { t: [0, 12], bend: 1 }, legF: { t: [-90, 14], bend: 1 }, footN: 60, footF: 20 }],
      [0.5, { hip: [-9.5, 42], torso: 106, armN: { t: [40, 4], bend: -1 }, armF: { t: [38, 4], bend: -1 },
        legN: { t: [-90, 14], bend: 1 }, legF: { t: [0, 12], bend: 1 }, footN: 20, footF: 60 }],
    ],
  },
  gluteBridge: {
    name: '글루트 브릿지', view: 'side', type: 'reps', base: 3, met: 3.5,
    tips: ['누워서 무릎을 세워요', '엉덩이를 조이며 들어 올리기', '위에서 1초 멈췄다 내려와요'],
    frames: [
      [0, { hip: [12, 13], torso: -90, headA: -90, ...flatArms, legN: { t: [55, 6], bend: 1 }, legF: { t: [52, 6], bend: 1 } }],
      [0.4, { hip: [3, 42], torso: -56.9, headA: -90, ...flatArms, legN: { t: [55, 6], bend: 1 }, legF: { t: [52, 6], bend: 1 } }],
      [0.6, { hip: [3, 43], torso: -56.5, headA: -90, ...flatArms, legN: { t: [55, 6], bend: 1 }, legF: { t: [52, 6], bend: 1 } }],
    ],
  },
  crunch: {
    name: '크런치', view: 'side', type: 'reps', base: 2.4, met: 3.8,
    tips: ['허리는 바닥에 붙인 채로', '배꼽을 보며 어깨만 들어요', '목에 힘을 빼요'],
    frames: [
      [0, { hip: [10, 13], torso: -90, head: 0, armN: [90, 90], armF: [90, 90], legN: { t: [52, 6], bend: 1 }, legF: { t: [49, 6], bend: 1 } }],
      [0.5, { hip: [10, 13], torso: -123, head: -15, armN: [100, 100], armF: [100, 100], legN: { t: [52, 6], bend: 1 }, legF: { t: [49, 6], bend: 1 } }],
    ],
  },
  legRaise: {
    name: '레그 레이즈', view: 'side', type: 'reps', base: 3, met: 3.5,
    tips: ['누워서 다리를 붙이고 쭉 펴요', '허리가 뜨지 않게 천천히', '내릴 때 바닥에 닿기 직전 멈춤'],
    frames: [
      [0, { hip: [10, 13], torso: -90, headA: -90, ...flatArms, legN: [97, 97], legF: [97, 97] }],
      [0.5, { hip: [10, 13], torso: -90, headA: -90, ...flatArms, legN: [172, 172], legF: [172, 172] }],
    ],
  },
  burpee: {
    name: '버피', view: 'side', type: 'reps', base: 4.5, met: 8,
    tips: ['쪼그려 앉아 손을 바닥에', '두 발을 뒤로 뛰어 엎드리기', '다시 모으고 위로 점프!'],
    frames: [
      [0, { hip: [0, 90], torso: 180, armN: { t: [4, 50], bend: -1 }, armF: { t: [0, 50], bend: -1 }, ...standLegs, footN: 90, footF: 90 }],
      [0.18, { hip: [-15, 42], torso: 105, armN: { t: [35, 4], bend: -1 }, armF: { t: [33, 4], bend: -1 },
        legN: { t: [5, 6], bend: 1 }, legF: { t: [0, 6], bend: 1 }, footN: 90, footF: 90 }],
      [0.38, { hip: [-14.5, 40], torso: 107.8, armN: { t: [35, 4], bend: -1 }, armF: { t: [33, 4], bend: -1 },
        legN: { t: [-95, 14], bend: 1 }, legF: { t: [-97, 14], bend: 1 }, footN: 20, footF: 20 }],
      [0.55, { hip: [-15, 42], torso: 105, armN: { t: [35, 4], bend: -1 }, armF: { t: [33, 4], bend: -1 },
        legN: { t: [5, 6], bend: 1 }, legF: { t: [0, 6], bend: 1 }, footN: 90, footF: 90 }],
      [0.75, { hip: [4, 106], torso: 180, armN: { t: [14, 230], bend: -1 }, armF: { t: [10, 230], bend: -1 },
        legN: { t: [6, 22], bend: 1 }, legF: { t: [1, 22], bend: 1 }, footN: 40, footF: 40 }],
    ],
  },
};

// 2차 확장 동작: 실사 영상으로만 보여 준다 (아바타 frames 없음). switchVoice는 절반에서 바꿀 때 쓰는 음성
Object.assign(EXERCISES, {
  sumoSquat: { name: '와이드 스쿼트', view: 'front', type: 'reps', base: 3.4, met: 5,
    tips: ['발을 어깨너비보다 넓게, 발끝은 바깥으로', '허벅지가 바닥과 나란할 때까지 앉아요', '무릎은 발끝 방향으로 벌려요'] },
  sideLunge: { name: '사이드 런지', view: 'front', type: 'reps', base: 2.1, met: 5, sides: true, unit: '절반에서 반대쪽',
    tips: ['다리를 넓게 벌리고 서요', '한쪽 무릎만 굽히고 반대 다리는 쭉', '엉덩이는 뒤로, 가슴은 펴요'] },
  curtsyLunge: { name: '커트시 런지', view: 'front', type: 'reps', base: 2.3, met: 5, sides: true, unit: '절반에서 다리 바꾸기',
    tips: ['한 다리를 대각선 뒤로 보내요', '앞 허벅지가 바닥과 나란할 때까지', '상체는 곧게, 앞 무릎은 안으로 모이지 않게'] },
  donkeyKick: { name: '동키 킥', view: 'side', type: 'reps', base: 3.6, met: 4, sides: true, unit: '절반에서 다리 바꾸기',
    tips: ['네 발 자세에서 허리는 평평하게', '무릎은 90도로 굽힌 채 발바닥을 천장으로', '엉덩이에 힘을 주고 천천히 내려요'] },
  calfRaise: { name: '카프 레이즈', view: 'side', type: 'reps', base: 2.4, met: 3,
    tips: ['손은 허리에, 몸은 곧게', '발뒤꿈치를 최대한 높이 들어요', '천천히 내려와요'] },
  bicycleCrunch: { name: '바이시클 크런치', view: 'side', type: 'reps', base: 1.9, met: 5, unit: '좌우 각각 1회',
    tips: ['손은 머리 뒤에 가볍게', '팔꿈치와 반대쪽 무릎을 가까이', '허리는 바닥에 붙인 채로'] },
  russianTwist: { name: '러시안 트위스트', view: 'front', type: 'reps', base: 2.2, met: 4, unit: '좌우 각각 1회',
    tips: ['상체를 뒤로 45도 기울여요', '등은 곧게 펴고 좌우로 돌려요', '손끝이 엉덩이 옆 바닥을 스치게'] },
  flutterKick: { name: '플러터 킥', view: 'side', type: 'hold', base: 1.7, met: 5,
    tips: ['손은 엉덩이 아래, 허리는 바닥에', '다리를 펴고 바닥에서 살짝 띄워요', '작게 위아래로 번갈아 차요'] },
  deadBug: { name: '데드버그', view: 'side', type: 'reps', base: 3, met: 3.5, sides: true, unit: '절반에서 반대쪽', switchVoice: 'switch-side',
    tips: ['누워서 무릎 90도, 팔은 천장으로', '팔과 반대쪽 다리를 천천히 뻗어요', '허리가 뜨지 않게 배에 힘'] },
  sidePlank: { name: '사이드 플랭크', view: 'front', type: 'hold', base: 4.5, met: 4, sides: true, switchVoice: 'switch-side',
    tips: ['팔꿈치는 어깨 바로 아래', '머리부터 발끝까지 일직선', '골반이 처지지 않게 들어 올려요'] },
  shoulderTap: { name: '플랭크 숄더 탭', view: 'side', type: 'reps', base: 1.4, met: 5, sides: true, unit: '절반에서 반대 손', switchVoice: 'switch-side',
    tips: ['손은 어깨 아래, 몸은 일직선', '한 손으로 반대쪽 어깨를 톡', '골반이 흔들리지 않게'] },
  birdDog: { name: '버드독', view: 'side', type: 'reps', base: 4.2, met: 3, sides: true, unit: '절반에서 반대쪽', switchVoice: 'switch-side',
    tips: ['네 발 자세, 허리는 평평하게', '팔과 반대쪽 다리를 몸과 일직선으로', '골반이 돌아가지 않게 천천히'] },
  catCow: { name: '캣카우', view: 'side', type: 'hold', base: 7.7, met: 2.5,
    tips: ['네 발 자세에서 시작해요', '숨을 내쉬며 등을 둥글게 말아요', '숨을 들이쉬며 가슴을 열어요'] },
});

for (const [id, ex] of Object.entries(EXERCISES)) ex.id = id;

# 실사 운동 영상 만들기 (Kling 웹, 무료 크레딧)

무료 크레딧은 **한 달에 66**이고 Kling 웹사이트에서만 쓸 수 있다. 그래서 아래 순서대로 조금씩 만든다.
생성 버튼에 표시되는 크레딧을 꼭 확인하고, 이달 크레딧 안에서 우선순위 순서로 진행한다.

## 공통 원칙 (크레딧 아끼기)
- **사진(이미지)은 싸고 영상은 비싸다.** 먼저 모델 사진 1장을 확정한 다음, 그 사진을 참조해서 자세 사진을 만든다.
- 영상은 **이미지→영상**, **5초**, **표준(720p)**, **소리 끄기**, 가장 저렴한 모델(예: 2.5 Turbo 계열)로 만든다.
- **첫 프레임과 마지막 프레임에 같은 자세 사진**을 넣는다. 그래야 끊김 없이 반복 재생된다.
- 결과가 마음에 안 들어도 바로 다시 뽑지 말고, 프롬프트를 고칠 점을 먼저 정한다.
- 영상은 워터마크가 있는 무료 버전 그대로 받아도 된다.

## 1단계: 모델 사진 (텍스트→이미지, 비율 4:3)
영어 프롬프트가 결과가 더 좋다. 그대로 복사해서 쓴다.

```
Photorealistic full-body fitness magazine photo of a stunning, glamorous Korean woman in her mid-20s, professional fitness model with a toned athletic hourglass figure, defined abs, long dark brown hair in a high ponytail, natural glowy makeup, confident smile. She wears a fitted hot-pink sports bra, high-waisted black leggings and white sneakers. Standing upright in side profile facing right, arms relaxed at her sides, feet hip-width apart. Bright minimal photo studio with a seamless light-gray backdrop and floor, soft even lighting, camera at hip height, whole body in frame with empty space around her, sharp focus.
```

4장을 뽑을 수 있으면 4장 중에서 마음에 드는 1장을 고른다. 이 사진이 **기준 모델**이다 → `videos/model.jpg`로 저장한다.

## 2단계: 자세 사진 (기준 모델을 참조 이미지로 넣고 이미지→이미지)
모든 프롬프트 앞에 공통으로 이 문장을 붙인다:
```
Same woman, same face, same outfit, same studio background and lighting, same camera angle and distance, whole body in frame.
```

| 파일 이름 | 쓰는 동작 | 자세 프롬프트 (공통 문장 뒤에 붙이기) |
|---|---|---|
| (기준 모델 그대로) | 스쿼트, 하이니, 버피 | — 만들 필요 없음 |
| `pose-front.jpg` | 점핑잭 | `Facing the camera directly, standing upright, feet together, arms at her sides.` |
| `pose-split.jpg` | 제자리 런지 | `Side profile facing right, split stance: right foot forward, left foot back on the ball of the foot, torso upright, hands on hips.` |
| `pose-highplank.jpg` | 푸시업, 마운틴 클라이머 | `Side profile facing right, high plank on the floor: arms straight under the shoulders, body in one straight line from head to heels, on her toes.` |
| `pose-forearm.jpg` | 플랭크 | `Side profile facing right, forearm plank on the floor: elbows under the shoulders, body straight from head to heels.` |
| `pose-kneeplank.jpg` | 무릎 푸시업 | `Side profile facing right, kneeling plank: hands under the shoulders, arms straight, knees on the floor, body straight from knees to head.` |
| `pose-lying-bent.jpg` | 글루트 브릿지, 크런치 | `Lying on her back on the floor, side view, head on the left, knees bent, feet flat on the floor, arms along her sides.` |
| `pose-lying-straight.jpg` | 레그 레이즈 | `Lying on her back on the floor, side view, head on the left, legs straight together, arms along her sides.` |

## 3단계: 동작 영상 (이미지→영상, 5초, 소리 끔, 첫 프레임 = 마지막 프레임)
모든 프롬프트 뒤에 공통으로 이 문장을 붙인다:
```
Fixed camera, no camera movement, no zoom, no cuts, plain studio background. Smooth, realistic, athletic motion with perfect form. She ends in exactly the same pose as the first frame.
```

| 우선순위 | 저장할 파일 | 첫·마지막 프레임 | 동작 프롬프트 |
|---|---|---|---|
| 1 | `squat.mp4` | 기준 모델 | `She performs exactly one slow, controlled bodyweight squat: hips back and down until thighs are parallel to the floor, arms extended forward, then stands back up.` |
| 2 | `jumpingJack.mp4` | pose-front | `She performs exactly three energetic jumping jacks: jumping feet wide while clapping hands overhead, then jumping back together.` |
| 3 | `pushup.mp4` | pose-highplank | `She performs exactly one controlled push-up: lowering her chest close to the floor with elbows at 45 degrees, body straight, then pushing back up.` |
| 4 | `plank.mp4` | pose-forearm | `She holds a steady forearm plank, breathing calmly, only subtle natural movement.` |
| 5 | `lunge.mp4` | pose-split | `She performs exactly one slow split squat: lowering straight down until the back knee almost touches the floor, then rising back up.` |
| 6 | `gluteBridge.mp4` | pose-lying-bent | `She performs exactly one glute bridge: lifting her hips up until her body forms a straight line from knees to shoulders, holds one second, then lowers.` |
| 7 | `mountainClimber.mp4` | pose-highplank | `She performs exactly four quick mountain climbers, driving her knees alternately toward her chest.` |
| 8 | `highKnees.mp4` | 기준 모델 | `She runs in place with high knees for exactly four steps, knees up to hip height, arms pumping.` |
| 9 | `crunch.mp4` | pose-lying-bent | `She performs exactly one slow crunch: curling her shoulders off the floor toward her knees, then lowering back down.` |
| 10 | `burpee.mp4` | 기준 모델 | `She performs exactly one burpee: squats, places hands on the floor, jumps feet back into a plank, jumps feet forward, and jumps up with arms overhead.` |
| 11 | `legRaise.mp4` | pose-lying-straight | `She performs exactly one slow leg raise: lifting both straight legs up to vertical, then lowering them slowly until just above the floor.` |
| 12 | `kneePushup.mp4` | pose-kneeplank | `She performs exactly one knee push-up: lowering her chest toward the floor, then pushing back up.` |

## 받은 영상 넣는 곳
`C:\Users\GreenIT\home-workout\videos\` 폴더에 위 표의 파일 이름으로 저장한다. 하나라도 넣으면 앱에 연결하고,
아직 없는 동작은 지금의 아바타가 대신 보여 준다.

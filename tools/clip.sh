#!/usr/bin/env bash
# Kling 원본(videos/<id>.mp4)에서 1회 동작 반복 클립을 만든다 → media/<id>.mp4, media/<id>.jpg
#
# 사용법:
#   tools/clip.sh <id> pingpong <시작초> <끝초>
#       시작 자세 → 끝 자세(예: 스쿼트 맨 아래) 구간을 정방향 + 역방향으로 붙인다.
#       이음새가 모두 같은 프레임이라 반복할 때 끊기지 않는다. 대칭 동작(스쿼트, 푸시업, 브릿지 등)에 쓴다.
#   tools/clip.sh <id> cut <시작초> <끝초>
#       한 구간을 그대로 쓴다. 시작과 끝 자세가 같은 비대칭 동작(버피, 점핑잭 여러 번 등)에 쓴다.
#
# 환경변수 CROP(기본 860:720:200:0, 너비:높이:x:y)으로 잘라낼 영역을 바꿀 수 있다.
set -euo pipefail
cd "$(dirname "$0")/.."
id=$1; mode=$2; t0=$3; t1=$4
crop=${CROP:-860:720:200:0}
tmp=$(mktemp -d)
mkdir -p media

# 1) 구간을 무손실에 가깝게 잘라 둔다
ffmpeg -v error -y -i "videos/$id.mp4" -ss "$t0" -to "$t1" \
  -vf "crop=$crop,format=yuv420p" -an -c:v libx264 -crf 8 -preset fast "$tmp/seg.mp4"
n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$tmp/seg.mp4")

# 2) 반복 클립 만들기 (화질 우선: 원본 해상도 유지, crf 18, 짧은 키프레임 간격)
enc=(-an -c:v libx264 -crf 18 -preset slow -g 12 -pix_fmt yuv420p -movflags +faststart)
if [ "$mode" = pingpong ]; then
  # 정방향 f0..f(n-1) + 역방향 f(n-2)..f1 → 다음 반복의 f0으로 자연스럽게 이어진다
  ffmpeg -v error -y -i "$tmp/seg.mp4" -filter_complex \
    "[0:v]split[a][b];[b]reverse,trim=start_frame=1:end_frame=$((n - 1)),setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1[v]" \
    -map "[v]" "${enc[@]}" "media/$id.mp4"
else
  ffmpeg -v error -y -i "$tmp/seg.mp4" "${enc[@]}" "media/$id.mp4"
fi
ffmpeg -v error -y -i "media/$id.mp4" -vf "select=eq(n\,0),scale=240:-2" -frames:v 1 -q:v 3 "media/$id.jpg"
rm -rf "$tmp"
echo "media/$id.mp4 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "media/$id.mp4")초, $(($(stat -c %s "media/$id.mp4") / 1024))KB)"

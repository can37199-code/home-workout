#!/usr/bin/env bash
# Kling 원본(videos/<id>.mp4)에서 1회 동작 반복 클립을 만든다 → media/<id>.mp4, media/<id>.jpg
# 사용법: tools/clip.sh <id> <시작초> <끝초> [<두번째 시작초> <두번째 끝초>]
#   두 구간을 주면 이어 붙인다 (예: 내려가기 구간 + 올라오기 구간, 가운데 정지 구간 잘라내기)
# 환경변수 CROP (기본 860:720:200:0) 으로 잘라낼 영역을 바꿀 수 있다.
set -euo pipefail
cd "$(dirname "$0")/.."
id=$1; crop=${CROP:-860:720:200:0}
if [ $# -ge 5 ]; then
  fc="[0:v]trim=$2:$3,setpts=PTS-STARTPTS[a];[0:v]trim=$4:$5,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1,crop=$crop,scale=-2:540,format=yuv420p[v]"
else
  fc="[0:v]trim=$2:$3,setpts=PTS-STARTPTS,crop=$crop,scale=-2:540,format=yuv420p[v]"
fi
mkdir -p media
ffmpeg -v error -y -i "videos/$id.mp4" -filter_complex "$fc" -map "[v]" -an -c:v libx264 -crf 25 -preset slow -movflags +faststart "media/$id.mp4"
ffmpeg -v error -y -i "media/$id.mp4" -vf "select=eq(n\,0),scale=240:-2" -frames:v 1 -q:v 4 "media/$id.jpg"
echo "media/$id.mp4 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "media/$id.mp4")초) → js/media.js의 MEDIA에 등록하세요"

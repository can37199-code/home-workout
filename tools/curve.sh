#!/usr/bin/env bash
# 영상의 각 프레임이 기준 시점 프레임과 얼마나 닮았는지(SSIM) 출력한다. 반복 구간의 시작·끝을 찾을 때 쓴다.
# 사용법: tools/curve.sh <id> <기준초> [<범위 시작초> <범위 끝초>]
set -euo pipefail
cd "$(dirname "$0")/.."
id=$1; ref=$2; from=${3:-0}; to=${4:-10}
crop=${CROP:-860:720:200:0}
tmp=.tmp-curve; mkdir -p "$tmp"  # 필터 안의 경로는 상대 경로여야 해서 프로젝트 안에 만든다
ffmpeg -v error -y -ss "$ref" -i "videos/$id.mp4" -frames:v 1 "$tmp/ref.png"
ffmpeg -v error -i "videos/$id.mp4" -loop 1 -i "$tmp/ref.png" -filter_complex \
  "[0:v]trim=$from:$to,setpts=PTS-STARTPTS,crop=$crop,scale=320:-2,format=gray[a];[1:v]crop=$crop,scale=320:-2,format=gray[b];[a][b]ssim=stats_file=$tmp/s.txt:shortest=1" \
  -f null - 2>/dev/null
awk -v f="$from" '{
  split($1, a, ":")
  match($0, /All:[0-9.]+/)
  printf "%.2f %.3f\n", f + (a[2] - 1) / 24, substr($0, RSTART + 4, RLENGTH - 4)
}' "$tmp/s.txt"
rm -rf "$tmp"

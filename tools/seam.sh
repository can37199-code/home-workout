#!/usr/bin/env bash
# 반복 클립의 이음새(시작·끝 프레임)를 찾는다: 두 범위의 프레임 쌍 중 가장 닮은(SSIM) 쌍을 출력한다.
# 좌우 번갈아 하는 동작(cut 모드)에서 한 주기의 시작과 끝을 고를 때 쓴다.
# 사용법: tools/seam.sh <id> <시작범위 시작> <시작범위 끝> <끝범위 시작> <끝범위 끝>
set -euo pipefail
cd "$(dirname "$0")/.."
id=$1; a0=$2; a1=$3; b0=$4; b1=$5
crop=${CROP:-860:720:200:0}
tmp=.tmp-seam; rm -rf "$tmp"; mkdir -p "$tmp/a" "$tmp/b"
ffmpeg -v error -i "videos/$id.mp4" -vf "trim=$a0:$a1,setpts=PTS-STARTPTS,crop=$crop,scale=240:-2,format=gray" "$tmp/a/%03d.png"
ffmpeg -v error -i "videos/$id.mp4" -vf "trim=$b0:$b1,setpts=PTS-STARTPTS,crop=$crop,scale=240:-2,format=gray" "$tmp/b/%03d.png"
for fa in "$tmp"/a/*.png; do
  for fb in "$tmp"/b/*.png; do
    s=$(ffmpeg -i "$fa" -i "$fb" -lavfi ssim -f null - 2>&1 | grep -o 'All:[0-9.]*' | cut -d: -f2)
    na=$(basename "$fa" .png); nb=$(basename "$fb" .png)
    awk -v a="$a0" -v b="$b0" -v na="$na" -v nb="$nb" -v s="$s" 'BEGIN { printf "%.3f %.3f %s\n", a + (na - 1) / 24, b + (nb - 1) / 24, s }'
  done
done | sort -k3 -nr | head -5
rm -rf "$tmp"

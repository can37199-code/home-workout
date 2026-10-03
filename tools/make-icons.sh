#!/usr/bin/env bash
# 앱 아이콘: 실사 스쿼트 영상(videos/squat.mp4, 3.9초)의 한 장면으로 만든다
#  - icon-192/512: 인물이 꽉 차게
#  - icon-maskable-512: 안드로이드가 원·둥근 사각형으로 잘라도 인물이 안전 영역(가운데 80%)에 들도록 여백을 늘림
set -euo pipefail
cd "$(dirname "$0")/.."
src=videos/squat.mp4; t=3.9
ffmpeg -v error -y -ss $t -i $src -frames:v 1 -vf "crop=600:600:269:110,scale=512:512:flags=lanczos,unsharp=5:5:0.6" icons/icon-512.png
ffmpeg -v error -y -ss $t -i $src -frames:v 1 -vf "crop=600:600:269:110,scale=192:192:flags=lanczos,unsharp=3:3:0.5" icons/icon-192.png
ffmpeg -v error -y -ss $t -i $src -frames:v 1 -vf "crop=720:720:209:0,pad=840:840:60:20:color=black,fillborders=left=60:right=60:top=20:bottom=100:mode=smear,scale=512:512:flags=lanczos,unsharp=5:5:0.6" icons/icon-maskable-512.png
echo "icons/ 갱신 완료"

#!/bin/bash
# Combat-juice showcase: clips golden fight tapes (slow motion + offline audio) and concatenates them
# into clips/showcase/combat-juice.mp4. Usage: tools/showcase.sh [scale=0.75]
set -e
cd "$(dirname "$0")/.."
SCALE=${1:-0.75}
mkdir -p clips/showcase
seg() { # name tape skip frames
  npm run -s clip -- --tape "tests/replays/$2.json" --skip "$3" --frames "$4" --name "sc-$1" \
    --scale "$SCALE" --slowmo --audio --no-label --keep-frames > "clips/showcase/sc-$1.log" 2>&1
}
seg 1-pit the-pit.signature.s2 20 125 &
seg 1b-pit the-pit.signature.s2 278 115 &
seg 2-catch ring-barker.signature.s1 225 75 &
seg 3-grinder ring-grinder.signature.s1 150 115 &
wait
seg 4-clerk ring-clerk.signature.s1 200 95 &
seg 5-gull ring-gull.signature.s1 195 150 &
seg 6-sold auction.signature.s1 565 75 &
wait
seg 7-phase auction.signature.s1 705 190
list=clips/showcase/list.txt
: > "$list"
for f in 1-pit 1b-pit 2-catch 3-grinder 4-clerk 5-gull 6-sold 7-phase; do echo "file '../sc-$f.mp4'" >> "$list"; done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -b:a 192k \
  -movflags +faststart clips/showcase/combat-juice.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 clips/showcase/combat-juice.mp4

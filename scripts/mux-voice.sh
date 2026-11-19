#!/usr/bin/env bash
# Lays your own voice recording over the silent demo footage and writes the final video.
#
#   scripts/mux-voice.sh <your-recording> [footage.mp4] [output.mp4]
#
# <your-recording>  any audio or video file ffmpeg can read (m4a, mp3, wav, ogg, a phone video)
# footage.mp4       default: submission/video/agent-passport-footage.mp4 (made by scripts/record-demo.mjs)
# output.mp4        default: submission/video/agent-passport-final.mp4
#
# The voice is levelled to a steady loudness (EBU R128, -16 LUFS) and kept as is otherwise:
# nothing is generated, so the narration stays yours, as the hackathon rules require.
# The result is as long as the footage. If your recording is longer, it is cut at the end of
# the footage and the script says so; if the result would reach 2:00, it refuses.
set -euo pipefail

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
}

if [[ $# -lt 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit $([[ $# -lt 1 ]] && echo 1 || echo 0)
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
voice="$1"
footage="${2:-$root/submission/video/agent-passport-footage.mp4}"
output="${3:-$root/submission/video/agent-passport-final.mp4}"

for f in "$voice" "$footage"; do
  if [[ ! -f "$f" ]]; then
    echo "Not found: $f" >&2
    exit 1
  fi
done
command -v ffmpeg >/dev/null || { echo "ffmpeg is not installed." >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe is not installed." >&2; exit 1; }

duration() { ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"; }
video_s="$(duration "$footage")"
voice_s="$(duration "$voice")"

if awk -v v="$video_s" 'BEGIN { exit !(v >= 120) }'; then
  echo "The footage is ${video_s} s; the rules need the video under 2:00. Re-record the footage." >&2
  exit 1
fi
if awk -v a="$voice_s" -v v="$video_s" 'BEGIN { exit !(a > v + 0.5) }'; then
  echo "Note: your recording is ${voice_s} s and the footage ${video_s} s; the end of the recording will be cut." >&2
fi

mkdir -p "$(dirname "$output")"
ffmpeg -y -loglevel error \
  -i "$footage" -i "$voice" \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11,apad" \
  -c:a aac -b:a 160k -ar 48000 \
  -t "$video_s" \
  -movflags +faststart \
  "$output"

echo "Wrote $output ($(duration "$output") s). Watch it once before uploading."

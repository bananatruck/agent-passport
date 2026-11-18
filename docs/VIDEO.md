# Recording the demo video

The submission video is silent browser footage of the live site plus the author's own spoken narration.
The hackathon rules ask for a video under two minutes that shows the project running in a browser and has the entrant explaining it, and the overview page says the explanation must not be AI generated, so no voice is synthesized here.

## Footage

`node scripts/record-demo.mjs` drives the live site in Playwright's bundled Chromium at 1920 by 1080 through the seven shots of the video script and writes `submission/video/agent-passport-footage.mp4` (H.264, no audio) and `submission/video/scenes.json` (each scene's start time).
Set `SITE_URL=http://127.0.0.1:4173/` to record a local `pnpm demo` instead of the live site.
Each scene lasts as long as its narration takes to read at about 150 words per minute; the lengths are in `SCENES` at the top of the script.
The AI model settings panel stays closed, because it lists provider names, and the footage has no captions or music.
`submission/` is gitignored, so the video files are never committed.

## Voice

Play the footage, read the narration from the video script aloud into any recorder, then run `scripts/mux-voice.sh <your-recording>`.
It levels the loudness, lays the recording over the footage, cuts anything past the end of the footage, refuses a result of two minutes or more, and writes `submission/video/agent-passport-final.mp4`.
It changes nothing else about the voice.

## Checking a recording

Extract one frame per scene and look at it before uploading, for example `ffmpeg -ss 20 -i submission/video/agent-passport-footage.mp4 -frames:v 1 frame.png`.
Check that no settings panel, provider name or personal data is on screen.

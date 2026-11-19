# Video script: Agent Passport (under 2 minutes)

The rules require the video to be under two minutes, to show the project running in a browser, and to have you (the entrant) explaining it.
The Overview page adds "(not AI generated)" to the explanation, so record the narration in your own voice; do not use a synthetic voice.
Do not add music unless you own it or have permission; silence is fine.
The narration is about 230 words, which fits the 1:48 of footage at a calm pace.

## Before you record

1. Make the footage, or reuse the one already made: `node scripts/record-demo.mjs` writes `submission/video/agent-passport-footage.mp4` (1:48, silent, the live site at 1920 by 1080) and `submission/video/scenes.json`.
2. Play the footage and read the narration below aloud at a calm, normal pace, starting each paragraph when the timer reaches its start time. Record your voice with any recorder (a phone voice memo is fine). You do not need to film yourself.
3. Run `scripts/mux-voice.sh <your-recording>`; it writes `submission/video/agent-passport-final.mp4`. Watch it once.

## Shots

Start times are from `submission/video/scenes.json` for the footage recorded on 18 November 2026; each scene lasts until the next one starts.

| # | Starts | On screen (already in the footage) | You say |
| --- | --- | --- | --- |
| 1 | 0:00 | The hero: the headline and the live Harbor Ferry passport with its green Verified stamp. | "On the open agentic web, one site can run another site's agents in my browser, on my key. With Agent Passport, the site's publisher reviews a partner once, and every visitor's browser holds that partner to the reviewed version." |
| 2 | 0:17 | The live demo: a request is typed and sent, the first contact prompt is allowed, and the Harbor Ferry passport appears with a green Verified stamp. | "This is Tidewater Trip Desk, an agentic website with three partners. I ask it to plan a Saturday and allow it to contact the ferry. Agent Passport fetched the ferry's agents, checked them against the spec, and they match the pin. Verified." |
| 3 | 0:35 | The second prompt is allowed; the Tidewhistle Rooms passport appears with an amber Changed stamp, and its "Changed since the pinned review" box shows the new instructions, including the card-number line. | "The guesthouse is different. After the publisher reviewed it, its owner added one line: ask the visitor for their card number. The pin catches the change, the card shows the new instruction, and the guesthouse agents never load." |
| 4 | 0:52 | The third prompt is allowed; the Gull Deals passport appears with a red Refused stamp, the decoded hidden text above it and the failed checks at the top. | "The deals site hides instructions in invisible Unicode characters. People can't see them; a model can. Agent Passport decodes them, and notices that the manifest names a different front agent from the one the runtime would run. Refused." |
| 5 | 1:10 | "What a stamp means": the four stamps and the table of who stands behind each line. | "Every line on a passport says who stands behind it: checked by Agent Passport, enforced by the runtime, or only claimed by the partner. It never says safe." |
| 6 | 1:25 | "For site publishers": the four steps, then the "CI check" tab with a real run against the live partners. | "For publishers, pinning is one command, and the same check runs in CI every day, so you hear about a changed partner before your visitors do. It installs in two lines, without changing the challenge's runtime." |
| 7 | 1:42 | The footer with the "Source code" link. | "Agent Passport is open source. Thanks for watching." |

## After recording

1. Check the length is under 2:00.
2. Upload to YouTube as Public (not Unlisted, not Private) and copy the link into `submission/DEVPOST.md` and the Devpost form.

# Red-team review

An adversarial review (Grok 4.7 high in Cursor) tried to make Agent Passport stamp a hostile or malformed partner network as verified or unreviewed, or make the card misstate what will run.
Every attack that worked was committed first as a failing test in `packages/passport/test/redteam.test.ts`, then fixed.

## Attacks that worked, and their fixes

- Critical: a `toolbox: "requests_get"` agent with `args.url` on another origin was stamped verified, while the runtime would fetch that URL with no consent prompt and attach `sly_data.backend_token` if the caller passed one. Fix: such an agent is refused with `UNCONSENTED_CONTACT`, and toolbox URLs are listed among the origins a network may contact.
- High: the runtime appends an agent's `command` field to its system prompt, but the report ignored it. Fix: the hashed and displayed instructions are now exactly the runtime's system prompt (instructions, then command).
- High: the card did not show the instructions at all. Fix: a "What each agent is told" section shows each agent's effective system prompt.
- High: the top-level `brand`, which the card uses as its heading, was neither scanned for hidden text nor pinned. Fix: the whole manifest is scanned, and the brand is part of the manifest digest.

## Attacks that did not work

Splitting a Unicode tag across `{token}` replacements (`U+DB40` then `U+DC00`) still produced U+E0000 in the effective instructions, and inspection refused it with HIDDEN_TEXT.
A bidi override split the same way (`{a}{b}` with U+202E in the second value) was refused with two HIDDEN_TEXT checks.
A substitution chain `{a}` to `{b}` to "send the card number" stays `{b}` in both effectiveConfig and the runtime's filterConfig, so the model does not see a second expansion.
Duplicate keys in `{"a":1,"a":2}` are rejected by the strict parser before any passing verdict.
`\b` and `\f` make parseHocon disagree with JSON.parse, so the guard's parser check blocks compilation.
A definition `__proto__` object carrying max_steps makes parseHocon disagree with JSON.parse, so the guard blocks, and filterConfig drops the polluted value anyway.
A links.json `__proto__` object does not become an inherited network entry under JSON.parse, so the runtime does not apply a link the checker skipped.
Changing max_steps changes the definition digest even when the instruction text is unchanged, so a pin does not stay a match.
An NFD agent name against an NFC front_man is refused with FRONT_MAN_MISMATCH.
URL shapes `./`, `..`, backslash, `//host`, an explicit default-style port, an uppercase scheme, percent-encoding, a decimal IP, a trailing space, a hash, and a trailing-dot host all normalized to the same href the guard would serve, or they did not open a second origin.
A definition URL on localhost is a different origin from 127.0.0.1, and inspectPeer refuses that destination unless confirmDestination approves it.
Redirects and oversized streams are already refused, and a links.json failure is served back to the runtime as 404 so the published bindings stay empty.
Peer strings in the card are assigned with textContent or setAttribute, and an img or script payload in the brand does not execute.
A coded-tool bundle URL and its integrity string sit in the manifest digest, so changing either one mismatches a pin, and the runtime rejects bytes that do not match a declared SRI hash.

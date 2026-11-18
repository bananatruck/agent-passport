# Attacks that did not bypass Agent Passport

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

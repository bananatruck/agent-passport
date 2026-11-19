# UI component credits

This document records every external UI component copied into `apps/site/src/components/ui/` and adapted to the Agent Passport design system.
Each component uses only the pre-installed workspace dependencies (`react`, `react-dom`, `motion`, `clsx`, `tailwind-merge`, and `lucide-react`) and respects `prefers-reduced-motion`.
Every license listed below was checked directly on the library's own site or repository.

## Components

| Component | Local path | Library | Source URL | License | Usage in Tidewater Trip Desk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AnimatedBeam` | `apps/site/src/components/ui/animated-beam.tsx` | Magic UI | `https://magicui.design/r/animated-beam.json` (`https://magicui.design/docs/components/animated-beam`) | MIT License (`https://github.com/magicuidesign/magicui/blob/main/LICENSE.md`) | Connects the Tidewater Trip Desk caller node to the three partner network nodes (`harbor_ferry`, `tidewhistle_rooms`, `gull_deals`) in the hero topology diagram. |
| `BorderBeam` | `apps/site/src/components/ui/border-beam.tsx` | Magic UI | `https://magicui.design/r/border-beam.json` (`https://magicui.design/docs/components/border-beam`) | MIT License (`https://github.com/magicuidesign/magicui/blob/main/LICENSE.md`) | Highlights the active passport page and inspection result container using the verdict stamp color. |
| `ShineBorder` | `apps/site/src/components/ui/shine-border.tsx` | Magic UI | `https://magicui.design/r/shine-border.json` (`https://magicui.design/docs/components/shine-border`) | MIT License (`https://github.com/magicuidesign/magicui/blob/main/LICENSE.md`) | Frames the verified hero passport page with a subtle security-paper border sheen. |
| `DotPattern` | `apps/site/src/components/ui/dot-pattern.tsx` | Magic UI | `https://magicui.design/r/dot-pattern.json` (`https://magicui.design/docs/components/dot-pattern`) | MIT License (`https://github.com/magicuidesign/magicui/blob/main/LICENSE.md`) | Provides a quiet, low-contrast engraved dot matrix background behind the hero passport specimen. |
| `Terminal`, `TypingAnimation`, `AnimatedSpan` | `apps/site/src/components/ui/terminal.tsx` | Magic UI | `https://magicui.design/r/terminal.json` (`https://magicui.design/docs/components/terminal`) | MIT License (`https://github.com/magicuidesign/magicui/blob/main/LICENSE.md`) | Displays the interactive code block and CLI output in the "For site publishers" section. |
| `DecryptedText` | `apps/site/src/components/ui/decrypted-text.tsx` | React Bits | `https://reactbits.dev/r/DecryptedText-TS-TW.json` (`https://reactbits.dev/text-animations/decrypted-text`) | MIT + Commons Clause License Condition v1.0 (`https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md`) | Reveals text a partner hid in Unicode tag characters (`U+E0000` to `U+E007F`), decoded by Agent Passport, above the refused passport in the demo and the Inspector. |
| `SpotlightCard` | `apps/site/src/components/ui/spotlight-card.tsx` | React Bits | `https://reactbits.dev/r/SpotlightCard-TS-TW.json` (`https://reactbits.dev/components/spotlight-card`) | MIT + Commons Clause License Condition v1.0 (`https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md`) | Wraps the four verdict definitions in the "What a stamp means" section with a restrained paper-toned spotlight surface. |
| `Tabs` | `apps/site/src/components/ui/tabs.tsx` | Aceternity UI | `https://ui.aceternity.com/registry/tabs.json` (`https://ui.aceternity.com/components/tabs`) | Aceternity License - free for personal and commercial end products, no redistribution as a component library or template (`https://ui.aceternity.com/licence`, `https://ui.aceternity.com/pricing`) | Switches between the two-line guard installation snippet, the `passports.json` pin file, and the CI check workflow in the "For site publishers" section. |
| `HoverBorderGradient` | `apps/site/src/components/ui/hover-border-gradient.tsx` | Aceternity UI | `https://ui.aceternity.com/registry/hover-border-gradient.json` (`https://ui.aceternity.com/components/hover-border-gradient`) | Aceternity License - free for personal and commercial end products, no redistribution as a component library or template (`https://ui.aceternity.com/licence`, `https://ui.aceternity.com/pricing`) | Styles the preset partner selector buttons in the "Inspect a partner" section. |
| `HeroPill` | `apps/site/src/components/ui/hero-pill.tsx` | 21st.dev | `https://raw.githubusercontent.com/serafimcloud/21st/main/apps/web/components/ui/hero-pill.tsx` (`https://github.com/serafimcloud/21st/blob/main/apps/web/components/ui/hero-pill.tsx`) | MIT License (`https://github.com/serafimcloud/21st/blob/main/LICENSE`) | Renders the "Agent Passport guard active" status pill in the site header and hero. |

## Fonts and icons

- `Big Shoulders Display`, `Public Sans`, and `JetBrains Mono` are loaded from Google Fonts (`https://fonts.google.com`) under the SIL Open Font License 1.1.
- Icons are provided by `lucide-react` (`https://lucide.dev`) under the ISC License.

## License scope

The full license texts of the Magic UI, React Bits and 21st.dev files, including their copyright and permission notices, ship with the site as `apps/site/public/third-party-notices.txt` (served as `third-party-notices.txt` and linked from the footer).
The repository's MIT license covers its own code.
It does not relicense the third-party files listed above: each stays under the license shown in its row.
The two Aceternity UI files (`tabs.tsx`, `hover-border-gradient.tsx`) are under the Aceternity License, which allows their use in an end product such as this site but not redistributing them as components or templates; take them from ui.aceternity.com rather than from this repository.
The two React Bits files (`decrypted-text.tsx`, `spotlight-card.tsx`) are under MIT with the Commons Clause, which forbids selling them.
The vendored runtime in `apps/site/public/runtime/` is under the Apache License 2.0 (its `LICENSE.txt`).

// The hero passport's animated frame (Magic UI DotPattern and ShineBorder), loaded after first paint.
import { DotPattern } from "../components/ui/dot-pattern";
import { ShineBorder } from "../components/ui/shine-border";

export default function HeroDecor() {
  return (
    <>
      <DotPattern width={20} height={20} cr={0.9} />
      <ShineBorder borderWidth={1.5} duration={16} shineColor="var(--ap-verified)" />
    </>
  );
}

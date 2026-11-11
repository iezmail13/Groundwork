import Image from "next/image";
import mascot from "@/components/brand/mascot.png";
import mascotDark from "@/components/brand/mascot-dark.png";
import wordmark from "@/components/brand/wordmark.png";
import wordmarkWhite from "@/components/brand/wordmark-white.png";
import iconLight from "@/components/brand/icon-light.png";
import iconDark from "@/components/brand/icon-dark.png";

// The Groundwork logo (D86, D114): the groundhog mascot peeking from its
// burrow and the "groundwork" wordmark, from the owner's brand files. The logo
// keeps its own colours. The empty-state illustrations (D99) below are drawn
// separately as SVG.

const NAVY = "#15223D";
const YELLOW = "#F6B533";
const WHITE = "#FFFFFF";

/** The figure's body (torso, shirt, tie, head), shared by the mark and the illustrations. */
function Figure({ dark }: { dark: boolean }) {
  const outline = dark ? { stroke: WHITE, strokeWidth: 1.4 } : {};
  return (
    <>
      <path d="M20 60C20 46 26 38 37 38C47 38 52 46 52 60Z" fill={NAVY} {...outline} />
      <path d="M34.4 38.8H40.6L37.5 47.5Z" fill={WHITE} />
      <path d="M36.7 39.4H38.3L38.9 45.6L37.5 48.4L36.1 45.6Z" fill={NAVY} />
      <path d="M33 38.8L37.5 49.5L42 38.8" fill="none" stroke={WHITE} strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="38" cy="26.5" r="9.5" fill={NAVY} {...outline} />
    </>
  );
}

function Helmet() {
  return (
    <g className="logo-helmet">
      <path
        d="M27 24C27 14 33 8.5 39.5 8.5C46.5 8.5 51.5 14 51.5 22.5L54 23.3C54.9 23.6 54.7 25 53.6 25H28C27.4 25 27 24.6 27 24Z"
        fill={YELLOW}
      />
      <path d="M36 12.6C40 11.3 44.5 12.4 47 15.6" fill="none" stroke={NAVY} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
}

function Briefcase() {
  return (
    <g className="logo-briefcase">
      <g transform="rotate(-8 19 51)">
        <path d="M14.5 43.6V41.2C14.5 39.9 15.4 39 16.7 39H21.3C22.6 39 23.5 39.9 23.5 41.2V43.6" fill="none" stroke={WHITE} strokeWidth="4.2" />
        <path d="M14.5 43.6V41.2C14.5 39.9 15.4 39 16.7 39H21.3C22.6 39 23.5 39.9 23.5 41.2V43.6" fill="none" stroke={NAVY} strokeWidth="2" />
        <rect x="7" y="43" width="24" height="16" rx="3.2" fill={NAVY} stroke={WHITE} strokeWidth="1.6" />
        <rect x="16.5" y="48.5" width="5" height="5" rx="0.8" fill="none" stroke={WHITE} strokeWidth="1.5" />
      </g>
    </g>
  );
}

/** The mascot on its own, sized by width. `dark` gives the white-ringed version for navy backgrounds. */
export function Logo({ size = 32, dark = false, className }: { size?: number; dark?: boolean; className?: string }) {
  const src = dark ? mascotDark : mascot;
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={Math.round((size * src.height) / src.width)}
      className={`shrink-0 ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

/** The app icon: the mascot on a rounded square, white (default) or navy. */
export function LogoBadge({ size = 36, dark = false }: { size?: number; dark?: boolean }) {
  const src = dark ? iconDark : iconLight;
  return <Image src={src} alt="" width={size} height={Math.round((size * src.height) / src.width)} className="shrink-0" aria-hidden="true" />;
}

/** The wordmark: "ground" in navy and "work" in blue, or all white on navy. Sized by height. */
export function Wordmark({ dark = false, height = 22, className = "" }: { dark?: boolean; height?: number; className?: string }) {
  const src = dark ? wordmarkWhite : wordmark;
  return (
    <Image
      src={src}
      alt="groundwork"
      height={height}
      width={Math.round((height * src.width) / src.height)}
      className={`min-w-0 shrink object-contain object-left ${className}`}
    />
  );
}

export type IllustrationKind = "projects" | "tasks" | "schedule" | "documents" | "team" | "settings";

function Prop({ kind }: { kind: IllustrationKind }) {
  switch (kind) {
    case "projects":
      return null;
    case "tasks":
      return (
        <g transform="rotate(8 70 44)">
          <rect x="57" y="27" width="26" height="33" rx="3" fill={WHITE} stroke={NAVY} strokeWidth="2.6" />
          <rect x="64" y="23.5" width="12" height="6.5" rx="2" fill={NAVY} />
          <path d="M62.5 38L66 41.5L72.5 35" fill="none" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M62.5 49L66 52.5L72.5 46" fill="none" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "schedule":
      return (
        <g>
          <rect x="56" y="30" width="30" height="29" rx="3.5" fill={WHITE} stroke={NAVY} strokeWidth="2.6" />
          <path d="M56 37H86" stroke={NAVY} strokeWidth="5" />
          <rect x="56" y="30" width="30" height="7" rx="3" fill={YELLOW} />
          <path d="M63 26.5V32.5M79 26.5V32.5" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" />
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={61 + c * 8} y={42 + r * 5.5} width="5" height="3.6" rx="0.6" fill={NAVY} />),
          )}
        </g>
      );
    case "documents":
      return (
        <g>
          <path d="M55 34C55 32.3 56.3 31 58 31H66L69.5 34.5H84C85.7 34.5 87 35.8 87 37.5V56C87 57.7 85.7 59 84 59H58C56.3 59 55 57.7 55 56Z" fill="#E09F1F" />
          <path d="M57 39.5C57 38.1 58.1 37 59.5 37H87.5C88.9 37 89.6 38.4 89 39.6L85.2 57.3C84.9 58.3 84 59 83 59H57Z" fill={YELLOW} />
        </g>
      );
    case "team":
      return (
        <g fill={NAVY}>
          <circle cx="66" cy="35.5" r="6.5" />
          <path d="M53 60C53 50 58.5 44.5 66 44.5C73.5 44.5 79 50 79 60Z" />
          <circle cx="81.5" cy="40" r="5" />
          <path d="M73 60C73.6 52 77 48.3 81.5 48.3C86.5 48.3 90 52.5 90 60Z" />
        </g>
      );
    case "settings": {
      const teeth = Array.from({ length: 8 }, (_, i) => i * 45);
      return (
        <g transform="translate(72 42)">
          {teeth.map((a) => (
            <rect key={a} x="-3.4" y="-17" width="6.8" height="8" rx="1.4" fill={NAVY} transform={`rotate(${a})`} />
          ))}
          <circle r="12" fill={NAVY} />
          <circle r="5.6" fill={YELLOW} />
        </g>
      );
    }
  }
}

/**
 * A section illustration: the figure with the object for that section. Used as
 * default artwork on empty states; organizations can turn it off (D99).
 */
export function Illustration({ kind, size = 96, className }: { kind: IllustrationKind; size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" width={size} height={Math.round((size * 64) / 96)} className={className} aria-hidden="true" focusable="false">
      <ellipse cx="44" cy="60.8" rx="38" ry="2.2" fill={NAVY} opacity="0.1" />
      <Figure dark={false} />
      <Helmet />
      {kind === "projects" ? <Briefcase /> : <Prop kind={kind} />}
    </svg>
  );
}

/**
 * The mascot and wordmark for the canvas, drawn for whichever mode is in force:
 * navy on light, white on dark.
 */
export function Brand({ size = 36 }: { size?: number }) {
  const mark = Math.round(size * 1.4);
  const word = Math.round(size * 0.6);
  return (
    <>
      <span className="only-light">
        <span className="flex items-center gap-2">
          <Logo size={mark} />
          <Wordmark height={word} />
        </span>
      </span>
      <span className="only-dark">
        <span className="flex items-center gap-2">
          <Logo size={mark} dark />
          <Wordmark dark height={word} />
        </span>
      </span>
    </>
  );
}

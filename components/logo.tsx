// assets/logo.svg, inlined so the helmet and briefcase can animate.
// The helmet group tips up on hover of the surrounding .logo-link; the
// briefcase group swings every few seconds. Both stop under reduced motion
// (see app/globals.css). The logo keeps its own colours by design.

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* ground shadow */}
      <ellipse cx="32" cy="59.600" rx="11" ry="1" fill="#1F2D4D" opacity=".14" />

      {/* single visible leg, no foot */}
      <path
        d="M31 49.500H37C36.400 53 35.200 55.800 34.200 57.200C33.400 58.600 31.200 58.800 29.800 58C28.600 57.200 28.800 56 29.200 55C30 53 30.600 51 31 49.500Z"
        fill="#1F2D4D"
      />

      {/* head and torso in profile */}
      <circle cx="32" cy="14.500" r="5.400" fill="#1F2D4D" />
      <path
        d="M28.500 22.800C25.500 24 25.200 31 26.400 38C26.800 40.500 27.500 41.400 29 41.400H35.200C37 41.400 37.400 39.500 37.200 37C37.600 31 38 25 35 22.800C33.400 21.600 30.400 21.600 28.500 22.800Z"
        fill="#1F2D4D"
      />
      {/* arm outline */}
      <path
        d="M31 23.800C28.600 24.400 28.600 30 29.600 36.500C29.900 38.600 30.500 40 31.800 40.600C33.200 41 34 39.600 33.800 37.500C34.200 33 34.200 27 33.200 24.800C32.600 23.600 31.800 23.500 31 23.800Z"
        fill="none"
        stroke="#8A97B5"
        strokeWidth=".7"
        strokeLinejoin="round"
      />

      {/* briefcase */}
      <g className="logo-briefcase">
        <path d="M29.800 41.800V40.600H34.200V41.800" fill="none" stroke="#3B4D79" strokeWidth=".9" strokeLinecap="round" />
        <rect x="25" y="41.600" width="14" height="8.600" rx="1.300" fill="#3B4D79" />
        <path d="M25.700 42.800H38.300" stroke="#5A6C96" strokeWidth=".7" strokeLinecap="round" />
        <path d="M25.700 46.200H38.300" stroke="#1F2D4D" strokeWidth=".6" opacity=".7" />
        <rect x="30.400" y="45.200" width="3.200" height="2" rx=".6" fill="#BFC6D4" />
      </g>

      {/* construction helmet (side view, peak toward the front) */}
      <g className="logo-helmet">
        <path d="M25.800 12.600C25.800 4.200 38.200 4.200 38.200 12.600Z" fill="#F5C518" />
        <path d="M26.200 12.600C26.400 9 27.400 6.600 29 5.400C26.800 7 25.900 9.400 26.200 12.600Z" fill="#C99700" opacity=".5" />
        <path
          d="M27 10.600C27.600 6.600 30 4.900 32.200 4.900C34.400 4.900 36.600 6.600 37.400 10.600"
          fill="none"
          stroke="#FFD93D"
          strokeWidth="1.700"
          strokeLinecap="round"
        />
        <path
          d="M27.900 11.400C28.400 8 30.200 6.400 32.200 6.400C34.200 6.400 36 8 36.600 11.400"
          fill="none"
          stroke="#B88700"
          strokeWidth=".55"
          strokeLinecap="round"
          opacity=".8"
        />
        <path
          d="M27.200 8.400C27.800 7 28.800 6.200 29.800 5.800"
          fill="none"
          stroke="#FFF3B0"
          strokeWidth=".9"
          strokeLinecap="round"
          opacity=".9"
        />
        <rect x="24.800" y="11.700" width="17" height="2.900" rx="1.450" fill="#E8B100" />
        <path d="M25.800 12.500H40.800" stroke="#FFF3B0" strokeWidth=".55" strokeLinecap="round" opacity=".85" />
        <path d="M25.600 14H40.600" stroke="#B88700" strokeWidth=".5" strokeLinecap="round" opacity=".8" />
        <circle cx="29" cy="10.200" r=".45" fill="#B88700" opacity=".75" />
        <circle cx="35.400" cy="10.200" r=".45" fill="#B88700" opacity=".75" />
      </g>
    </svg>
  );
}

/** The logo on its small bone badge, as used on the rail and auth pages. */
export function LogoBadge({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-bone-100"
      style={{ width: size, height: size }}
    >
      <Logo size={Math.round(size * 0.9)} />
    </span>
  );
}

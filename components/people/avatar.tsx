/* eslint-disable @next/next/no-img-element -- signed storage links change every request, so next/image can't cache them */

/** A member's photo, or their initials when they haven't set one (D104). */
export function Avatar({
  name,
  initials,
  photoUrl,
  size = "md",
  className = "",
}: {
  name: string;
  initials: string;
  photoUrl: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const box = { xs: "size-6 text-[0.6rem]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-16 text-lg", xl: "size-24 text-2xl" }[size];
  return photoUrl ? (
    <img src={photoUrl} alt="" className={`${box} shrink-0 rounded-full border border-rule object-cover ${className}`} />
  ) : (
    <span
      aria-hidden
      title={name}
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-full border border-ink bg-canvas font-heading font-bold text-ink ${className}`}
    >
      {initials}
    </span>
  );
}

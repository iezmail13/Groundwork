import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "rail";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-heading font-semibold whitespace-nowrap transition-[transform,border-color,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary border border-primary hover:-translate-y-px",
  secondary: "bg-canvas text-ink border border-rule hover:border-ink",
  ghost: "text-ink border border-transparent hover:border-rule hover:bg-panel",
  // destructive: no red, so it's an outlined button with bold text and an icon
  danger: "bg-canvas text-ink border-2 border-ink hover:bg-panel",
  rail: "text-rail-ink border border-transparent hover:bg-rail-hover",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-[0.95rem]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

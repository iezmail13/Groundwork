"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DataGridHeroProps = {
  /** Number of rows and columns of cells. */
  rows?: number;
  cols?: number;
  /** Gap between cells, in px. */
  spacing?: number;
  /** Length of one breath of a cell, in seconds. */
  duration?: number;
  /** Cell colour: a CSS colour, normally a theme token. */
  color?: string;
  /** How the breathing travels across the grid. */
  animationType?: "pulse" | "wave" | "random";
  pulseEffect?: boolean;
  /** A soft light that follows the pointer (never on touch screens). */
  mouseGlow?: boolean;
  opacityMin?: number;
  opacityMax?: number;
  /** The container's background: a CSS colour or token. */
  background?: string;
  /** Classes for the grid layer, for example a mask that fades it out. */
  gridClassName?: string;
  className?: string;
  children?: ReactNode;
};

/** A stable stand-in for Math.random, so server and client agree on every delay. */
function scatter(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A generative hero backdrop (D117): a grid of cells that breathe outward from
 * the centre, with a soft glow under the pointer. The cells are decoration
 * only, hidden from assistive tech and transparent to the pointer. Their
 * breathing is CSS (the cell-pulse keyframes in app/globals.css), so it stops
 * under prefers-reduced-motion, leaving the grid still.
 */
export function DataGridHero({
  rows = 12,
  cols = 20,
  spacing = 6,
  duration = 3,
  color = "var(--landing-cell)",
  animationType = "pulse",
  pulseEffect = true,
  mouseGlow = true,
  opacityMin = 0.05,
  opacityMax = 0.6,
  background = "transparent",
  gridClassName,
  className,
  children,
}: DataGridHeroProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // The glow follows a mouse or trackpad only, and rests for reduced motion.
  useEffect(() => {
    const grid = gridRef.current;
    if (!mouseGlow || !grid) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || still.matches) return;
    let frame = 0;
    let at = { x: 0, y: 0 };
    const paint = () => {
      frame = 0;
      const rect = grid.getBoundingClientRect();
      const x = at.x - rect.left;
      const y = at.y - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      grid.style.setProperty("--mouse-x", `${x}px`);
      grid.style.setProperty("--mouse-y", `${y}px`);
      grid.style.setProperty("--mouse-glow-opacity", inside ? "1" : "0");
    };
    // on the window, because the content sits above the grid
    const onMove = (event: PointerEvent) => {
      at = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [mouseGlow]);

  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);
  const cells = Array.from({ length: rows * cols }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    let delay = 0;
    if (animationType === "wave") delay = (r + c) * 0.1;
    else if (animationType === "random") delay = scatter(i) * duration;
    else delay = Math.hypot(r - centerRow, c - centerCol) * 0.2;
    const style = {
      backgroundColor: color,
      "--opacity-min": opacityMin,
      "--opacity-max": opacityMax,
      // still, part-way up, when there's no animation
      opacity: opacityMin + (opacityMax - opacityMin) * 0.3,
      ...(pulseEffect ? { animation: `cell-pulse ${duration}s infinite alternate`, animationDelay: `${delay.toFixed(3)}s` } : {}),
    } as CSSProperties;
    return <div key={i} className="rounded-[3px]" style={style} />;
  });

  return (
    <div className={cn("relative isolate", className)} style={{ background }}>
      <div
        ref={gridRef}
        aria-hidden
        data-slot="data-grid"
        // on its own: check:labels reads "events" in a spaced string as a label
        className={cn("pointer-events-none", "absolute inset-0 grid", gridClassName)}
        style={
          {
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: `${spacing}px`,
            "--mouse-glow-opacity": 0,
          } as CSSProperties
        }
      >
        {cells}
        {mouseGlow ? (
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: "var(--mouse-glow-opacity)",
              background:
                "radial-gradient(240px circle at var(--mouse-x, -999px) var(--mouse-y, -999px), color-mix(in oklab, var(--landing-glow) 42%, transparent), transparent 70%)",
            }}
          />
        ) : null}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

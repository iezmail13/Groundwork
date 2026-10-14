"use client";

import { useState, useTransition } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Menu, menuItemClass } from "@/components/ui/menu";
import { setThemeMode } from "@/app/actions/theme";
import type { ThemeMode } from "@/lib/theme/mode";

const OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "Match my device", icon: Monitor },
];

/**
 * The sun/moon button in the top bar. The new mode applies at once (the
 * <html data-theme> attribute drives every token) and is saved to the
 * profile and the theme cookie in the background.
 */
export function ThemeToggle({ initial, onRail = false }: { initial: ThemeMode; onRail?: boolean }) {
  const [mode, setMode] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const current = OPTIONS.find((o) => o.mode === mode)!;

  const choose = (next: ThemeMode, close: () => void) => {
    close();
    setMode(next);
    setError(null);
    document.documentElement.setAttribute("data-theme", next);
    startTransition(async () => {
      const result = await setThemeMode(next);
      if (result.status === "error") setError(result.message ?? "Couldn't save that. Try again.");
    });
  };

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <p role="alert" className="text-sm font-semibold text-bad-ink">
          {error}
        </p>
      ) : null}
      <Menu
        placement="bottom"
        align="right"
        buttonLabel={`Appearance: ${current.label}`}
        buttonClassName={`inline-flex size-10 items-center justify-center rounded-md border border-transparent ${
          onRail ? "hover:bg-rail-hover" : "text-ink hover:border-rule hover:bg-panel"
        }`}
        button={
          <>
            {/* the sun shows in light mode and the moon in dark mode, from CSS, so it's right before hydration too */}
            <Sun aria-hidden className="only-light size-5" />
            <Moon aria-hidden className="only-dark size-5" />
          </>
        }
      >
        {(close) => (
          <>
            <p className="px-3 pt-1.5 pb-1 font-heading text-xs font-bold tracking-wider text-ink-muted uppercase">Appearance</p>
            {OPTIONS.map((o) => (
              <button
                key={o.mode}
                type="button"
                role="menuitemradio"
                aria-checked={mode === o.mode}
                className={menuItemClass}
                onClick={() => choose(o.mode, close)}
              >
                <o.icon aria-hidden className="size-4" />
                <span className="flex-1">{o.label}</span>
                {mode === o.mode ? <Check aria-hidden className="size-4 text-accent" /> : null}
              </button>
            ))}
          </>
        )}
      </Menu>
    </div>
  );
}

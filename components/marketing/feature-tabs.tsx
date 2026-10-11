"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, FileText, FolderKanban, LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

const ICONS = { FolderKanban, CalendarDays, FileText, LayoutDashboard };

export type FeatureTab = {
  id: string;
  icon: keyof typeof ICONS;
  label: string;
  badge: string;
  title: string;
  description: string;
  image: { src: string; alt: string; width: number; height: number };
};

/** An accessible tablist: arrow keys, Home and End move between tabs. */
export function FeatureTabs({ tabs }: { tabs: FeatureTab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      select(moves[event.key]!);
    }
  };

  return (
    <div className="mt-10">
      <div
        role="tablist"
        aria-label="Features"
        className="mx-auto grid max-w-4xl grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        {tabs.map((tab, i) => {
          const Icon = ICONS[tab.icon];
          const selected = i === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`feature-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`feature-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 font-heading text-sm font-semibold transition-[transform,border-color] duration-150 hover:-translate-y-px ${
                selected ? "border-ink bg-panel text-ink" : "border-rule text-ink-muted hover:border-ink-muted"
              }`}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="mx-auto mt-8 max-w-6xl rounded-2xl border border-rule bg-panel p-5 sm:p-8 lg:p-12">
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            id={`feature-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`feature-tab-${tab.id}`}
            hidden={i !== active}
            tabIndex={0}
            className="tab-panel-in grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
          >
            <div className="flex flex-col items-start gap-4">
              <Badge variant="outline" className="bg-canvas">
                {tab.badge}
              </Badge>
              <h3 className="font-heading text-2xl leading-tight font-bold text-balance lg:text-4xl">{tab.title}</h3>
              <p className="text-ink-muted lg:text-lg">{tab.description}</p>
              <ButtonLink href="/login" className="mt-2">
                Get started
              </ButtonLink>
            </div>
            <Image
              src={tab.image.src}
              alt={tab.image.alt}
              width={tab.image.width}
              height={tab.image.height}
              sizes="(min-width: 1024px) 520px, 100vw"
              className="h-auto w-full rounded-lg border border-rule bg-canvas"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

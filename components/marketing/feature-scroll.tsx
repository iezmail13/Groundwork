"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export type Feature = {
  id: string;
  heading: string;
  sentence: string;
  bullets: string[];
  image: { name: string; alt: string; width: number; height: number };
};

/** A feature picture, in whichever colour scheme the device uses (both are real captures). */
function Picture({ image, sizes }: { image: Feature["image"]; sizes: string }) {
  const props = { width: image.width, height: image.height, sizes, className: "block h-auto w-full rounded-lg border border-rule" };
  return (
    <>
      <span className="only-light">
        <Image src={`/marketing/${image.name}-light.webp`} alt={image.alt} {...props} />
      </span>
      <span className="only-dark">
        <Image src={`/marketing/${image.name}-dark.webp`} alt={image.alt} {...props} />
      </span>
    </>
  );
}

/**
 * The features under the hero (D117). On wide screens the pictures stay put
 * (position: sticky) while the words scroll past, and the picture cross-fades
 * to whichever feature is in the middle of the screen. On small screens each
 * feature sits with its own picture, with nothing sticky. The fade is a CSS
 * transition, so it becomes an instant swap under reduced motion.
 */
export function FeatureScroll({ features }: { features: Feature[] }) {
  const [active, setActive] = useState(0);
  const blocks = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      // a feature is "current" while it crosses the middle band of the screen
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const block of blocks.current) if (block) seen.observe(block);
    return () => seen.disconnect();
  }, []);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
      <div className="hidden lg:block">
        <div className="sticky top-[calc(50vh-15rem)]">
          <div className="relative aspect-[4/3]">
            {features.map((f, i) => (
              <div
                key={f.id}
                aria-hidden={i !== active}
                className={`absolute inset-0 flex items-center transition-opacity duration-500 ease-out ${i === active ? "opacity-100" : "opacity-0"}`}
              >
                <div className="w-full rounded-xl border border-rule bg-canvas p-2">
                  <Picture image={f.image} sizes="(min-width: 1024px) 600px, 0px" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ol className="flex flex-col">
        {features.map((f, i) => (
          <li
            key={f.id}
            id={f.id}
            ref={(el) => {
              blocks.current[i] = el;
            }}
            data-index={i}
            className="flex scroll-mt-20 flex-col justify-center border-t border-rule py-12 first:border-t-0 lg:min-h-[80vh] lg:py-0"
          >
            <p className="font-heading text-sm font-bold text-[var(--landing-highlight)]">
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-2 font-heading text-2xl font-bold sm:text-3xl">{f.heading}</h3>
            <p className="mt-3 max-w-xl text-lg text-ink-muted">{f.sentence}</p>
            <ul className="mt-5 flex flex-col gap-2.5">
              {f.bullets.map((b) => (
                <li key={b} className="flex gap-2.5">
                  <Check aria-hidden className="mt-1 size-4 shrink-0 text-[var(--landing-highlight)]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-xl border border-rule bg-canvas p-1.5 lg:hidden">
              <Picture image={f.image} sizes="100vw" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

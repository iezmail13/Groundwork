"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, options: { sitekey: string; theme: "auto"; "response-field-name": string }) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    let tag = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (!tag) {
      tag = document.createElement("script");
      tag.src = SCRIPT;
      tag.async = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile"))));
    tag.addEventListener("error", () => reject(new Error("turnstile failed to load")));
  });
}

/**
 * Cloudflare Turnstile, the demo's check that a visitor isn't a bot (D115).
 * It adds a "cf-turnstile-response" field to the surrounding form. `resetKey`
 * changes after each attempt, because a token works only once.
 */
export function Turnstile({ siteKey, resetKey }: { siteKey: string; resetKey: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then((api) => {
        if (cancelled || !box.current || widget.current) return;
        widget.current = api.render(box.current, { sitekey: siteKey, theme: "auto", "response-field-name": "cf-turnstile-response" });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [resetKey]);

  return <div ref={box} className="min-h-[65px]" />;
}

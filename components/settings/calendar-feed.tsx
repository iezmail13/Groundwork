"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Check, Copy, RefreshCw, X } from "lucide-react";
import { makeCalendarFeed, turnOffCalendarFeed } from "@/app/[orgSlug]/settings/calendar-feed-actions";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";

/**
 * Settings → Profile → Calendar feed (D102). The secret link is shown once,
 * right after it's made; afterwards only whether it's on is known.
 */
export function CalendarFeed({ onSince }: { onSince: string | null }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const on = Boolean(url || onSince);

  const run = (action: () => ReturnType<typeof makeCalendarFeed>, done: string) =>
    start(async () => {
      setCopied(false);
      const result = await action();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setUrl(result.url);
      setMessage(done);
    });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setMessage("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  const webcal = url?.replace(/^https?:/, "webcal:");

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-ink-muted">
        Subscribe from Google Calendar, Apple Calendar or Outlook to see your open {lower(t("task", "other"))} on the day they&apos;re
        due and the {lower(t("event", "other"))} on your {lower(t("project", "other"))}. It shows titles and dates only. Anyone with
        the link can read it, so keep it to yourself.
      </p>

      {url ? (
        <div className="flex flex-col gap-3 border-l-4 border-accent pl-4">
          <label htmlFor="calendar-feed-url" className="font-heading text-sm font-semibold">
            Your calendar link
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="calendar-feed-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-rule bg-canvas px-3 py-2 font-mono text-sm text-ink"
            />
            <Button variant="secondary" onClick={copy}>
              {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-sm text-ink-muted">Copy it now: for your safety it&apos;s shown only once. You can always make a new one.</p>
          <ul className="flex flex-col gap-1 text-sm">
            <li>
              <a className="font-semibold text-accent underline underline-offset-4" href={webcal}>
                Open in Apple Calendar
              </a>
            </li>
            <li>
              <a
                className="font-semibold text-accent underline underline-offset-4"
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal ?? "")}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Add to Google Calendar
              </a>
            </li>
            <li>
              <a
                className="font-semibold text-accent underline underline-offset-4"
                href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=Groundwork`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Add to Outlook
              </a>
            </li>
          </ul>
        </div>
      ) : on ? (
        <p className="flex items-center gap-2 text-sm">
          <Check aria-hidden className="size-4 text-good" />
          <span>
            <strong>On</strong> since {onSince}. To subscribe somewhere new, make a new link.
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {on ? (
          <>
            <Button variant="secondary" disabled={pending} onClick={() => run(makeCalendarFeed, "Made a new link. The old one no longer works.")}>
              <RefreshCw aria-hidden className="size-4" />
              Make a new link
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => run(turnOffCalendarFeed, "Calendar feed turned off. Its link no longer works.")}>
              <X aria-hidden className="size-4" />
              Turn off
            </Button>
          </>
        ) : (
          <Button disabled={pending} onClick={() => run(makeCalendarFeed, "Calendar feed turned on.")}>
            <CalendarPlus aria-hidden className="size-4" />
            Turn on calendar feed
          </Button>
        )}
      </div>
      <p role="status" className="text-sm font-semibold">
        {message}
      </p>
    </div>
  );
}

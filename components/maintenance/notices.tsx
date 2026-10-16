import { Wrench } from "lucide-react";
import { formatWindow, upcomingWindow, type MaintenanceSetting } from "@/lib/maintenance";
import { DismissibleBanner } from "./dismissible-banner";

/** The sentence for a scheduled window, in the viewer's time zone (named). */
export function scheduledSentence(setting: MaintenanceSetting, timeZone: string, now = new Date()): string | null {
  const window = upcomingWindow(setting, now);
  if (!window) return null;
  return `Scheduled maintenance: ${formatWindow(window.startsAt, window.endsAt, timeZone)}. Groundwork will be unavailable.`;
}

/** In the app shell: a slim banner, dismissible for the session. */
export function ScheduledMaintenanceBanner({ setting, timeZone }: { setting: MaintenanceSetting; timeZone: string }) {
  const sentence = scheduledSentence(setting, timeZone);
  if (!sentence) return null;
  return (
    <DismissibleBanner id={`maintenance:${setting.startsAt}`}>
      <Wrench aria-hidden className="size-4 shrink-0" />
      <span>{sentence}</span>
    </DismissibleBanner>
  );
}

/** On the landing page: a quiet line for a scheduled window, a banner while maintenance is on. */
export function LandingMaintenanceNotice({ setting, timeZone }: { setting: MaintenanceSetting; timeZone: string }) {
  if (setting.active) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-sm font-semibold text-on-accent">
        <Wrench aria-hidden className="size-4 shrink-0" />
        <span>
          Groundwork is down for maintenance{setting.message ? `: ${setting.message}` : "."} Signing in will work again when it&apos;s done.
        </span>
      </div>
    );
  }
  const sentence = scheduledSentence(setting, timeZone);
  if (!sentence) return null;
  return (
    <p className="flex items-center justify-center gap-2 border-b border-rule px-4 py-1.5 text-center text-sm text-ink-muted">
      <Wrench aria-hidden className="size-3.5 shrink-0" />
      {sentence}
    </p>
  );
}

"use client";

import { useActionState, useEffect, useId, useState, useTransition, type CSSProperties } from "react";
import { Check, ImageUp, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import {
  finishLogoUpload,
  removeLogo,
  requestLogoUpload,
  updateBranding,
  updateMyAppearance,
} from "@/app/[orgSlug]/settings/branding-actions";
import { failure, idle, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/client";
import { ACCENT_PRESETS, CSS_NAMES, DEFAULT_ACCENT, deriveTokens, type Mode, type ThemeTokens } from "@/lib/theme/theme";
import { isHex, normalizeHex } from "@/lib/theme/color";
import { LOGO_ACCEPT, LOGO_MIME_TYPES, MAX_LOGO_BYTES } from "@/lib/validation";
import type { ThemeMode } from "@/lib/theme/mode";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Logo } from "@/components/logo";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";

// Settings → Branding (the organization's accent, logo and artwork) and
// Settings → Profile (the viewer's own mode and accent). D84–D86, D99.

/** Every token as custom properties, so a preview can show a mode and accent other than the page's. */
function tokenStyle(tokens: ThemeTokens): CSSProperties {
  return Object.fromEntries(
    (Object.keys(CSS_NAMES) as (keyof ThemeTokens)[]).map((k) => [`--${CSS_NAMES[k]}`, tokens[k]]),
  ) as CSSProperties;
}

/** A small piece of the app drawn with the chosen accent, in light and dark mode. */
export function AccentPreview({ accent }: { accent: string }) {
  const t = useT();
  const modes: Mode[] = ["light", "dark"];
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Preview of the chosen colour" role="group">
      {modes.map((mode) => (
        <div
          key={mode}
          style={tokenStyle(deriveTokens(mode, accent))}
          className="flex overflow-hidden rounded-lg border border-rule bg-canvas text-ink"
        >
          {/* the sidebar takes a chosen accent too (D110) */}
          <div aria-hidden className="flex w-28 shrink-0 flex-col gap-1 bg-rail p-2 text-rail-ink">
            <span className="flex items-center gap-1.5 rounded bg-rail-active px-2 py-1 font-heading text-xs font-semibold text-rail-active-ink">
              <span className="size-2 rounded-full bg-accent" />
              {t("section.dashboard")}
            </span>
            <span className="px-2 py-1 font-heading text-xs font-semibold">{t("section.calendar")}</span>
            <span className="px-2 py-1 text-xs text-rail-ink-muted">Reports</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            <p className="flex items-center gap-1.5 font-heading text-xs font-bold tracking-wider text-ink-muted uppercase">
              {mode === "light" ? <Sun aria-hidden className="size-3.5" /> : <Moon aria-hidden className="size-3.5" />}
              {mode === "light" ? "Light mode" : "Dark mode"}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-9 items-center rounded-md bg-accent px-3 font-heading text-sm font-semibold text-on-accent">
                Save
              </span>
              <span className="text-sm font-semibold text-accent underline underline-offset-4">A link</span>
              <span className="rounded-full border border-accent bg-accent-tint px-2 py-0.5 font-heading text-xs font-semibold text-accent">
                Selected
              </span>
            </div>
            <div aria-hidden className="flex h-3 overflow-hidden rounded-sm border border-rule">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className="flex-1" style={{ background: `var(--chart-${n})` }} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The colour picker: presets as radio buttons plus a custom hex field. `name`
 * carries the chosen hex ("" for `emptyLabel`, when given).
 */
function AccentPicker({
  name,
  value,
  onChange,
  emptyLabel,
  disabled = false,
  error,
}: {
  name: string;
  value: string;
  onChange: (hex: string) => void;
  /** Offers a first choice that stores nothing, e.g. "Use the organization's colour". */
  emptyLabel?: { label: string; swatch: string };
  disabled?: boolean;
  error?: string[];
}) {
  const id = useId();
  const [custom, setCustom] = useState(value && !ACCENT_PRESETS.some((p) => p.value === value) ? value : "");
  const choices = [...(emptyLabel ? [{ value: "", name: emptyLabel.label, swatch: emptyLabel.swatch }] : []), ...ACCENT_PRESETS.map((p) => ({ ...p, swatch: p.value }))];
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      <legend className="mb-2 font-heading text-sm font-semibold">Accent colour</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => {
          const checked = value === c.value;
          return (
            <label
              key={c.value || "none"}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:border-ink-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                checked ? "border-ink font-semibold" : "border-rule"
              }`}
            >
              <input
                type="radio"
                name={`${id}-choice`}
                className="sr-only"
                checked={checked}
                onChange={() => {
                  setCustom("");
                  onChange(c.value);
                }}
              />
              <span aria-hidden className="size-4 rounded-full border border-ink/20" style={{ background: c.swatch }} />
              {c.name}
              {checked ? <Check aria-hidden className="size-4" /> : null}
            </label>
          );
        })}
      </div>
      <Field label="Or your own colour" htmlFor={`${id}-custom`} hint="A hex colour, like #0F766E. Too light or too dark? It's adjusted so text stays readable." error={error}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Pick a colour"
            value={(isHex(custom || value) ? normalizeHex(custom || value) : (emptyLabel?.swatch ?? DEFAULT_ACCENT)).toLowerCase()}
            onChange={(e) => {
              const hex = e.target.value.toUpperCase();
              setCustom(hex);
              onChange(hex);
            }}
            className="h-10 w-12 cursor-pointer rounded-md border border-rule bg-canvas p-1"
          />
          <Input
            id={`${id}-custom`}
            value={custom}
            placeholder="#0F766E"
            maxLength={7}
            className="max-w-36 font-mono"
            invalid={Boolean(error?.length)}
            onChange={(e) => {
              const next = e.target.value.trim();
              setCustom(next);
              if (isHex(next)) onChange(normalizeHex(next));
            }}
          />
        </div>
      </Field>
    </fieldset>
  );
}

export function BrandingForm({
  organizationId,
  accent,
  showIllustrations,
  allowPersonalAccent,
  canManage,
  isOwner,
}: {
  organizationId: string;
  accent: string | null;
  showIllustrations: boolean;
  allowPersonalAccent: boolean;
  canManage: boolean;
  isOwner: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(updateBranding, idle);
  const [choice, setChoice] = useState(accent ?? DEFAULT_ACCENT);
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <AccentPicker name="accent" value={choice} onChange={setChoice} disabled={!canManage} error={state.fieldErrors?.accent} />
      <AccentPreview accent={isHex(choice) ? choice : DEFAULT_ACCENT} />
      <fieldset disabled={!canManage} className="flex flex-col gap-3">
        <legend className="mb-1 font-heading text-sm font-semibold">Options</legend>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="showIllustrations" defaultChecked={showIllustrations} className="mt-1 size-4 accent-[var(--accent)]" />
          <span>
            <span className="block font-semibold">Show illustrations</span>
            <span className="block text-sm text-ink-muted">Groundwork&apos;s drawings on empty pages. Off shows a plain icon instead.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="allowPersonalAccent"
            defaultChecked={allowPersonalAccent}
            disabled={!isOwner}
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block font-semibold">Let people choose their own accent colour</span>
            <span className="block text-sm text-ink-muted">
              {isOwner ? "It changes only their own screen." : `Only ${lower(t("role.owner", "other"))} can change this.`}
            </span>
          </span>
        </label>
      </fieldset>
      <FormMessage state={state} />
      {canManage ? (
        <div>
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save branding
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

/** Uploading, previewing and removing one of the organization's logos. */
export function LogoUploader({
  organizationId,
  variant,
  currentUrl,
  fallbackUrl = null,
  canManage,
}: {
  organizationId: string;
  variant: "light" | "dark";
  currentUrl: string | null;
  /** For the dark version: the regular logo, which dark mode shows on a light backing until there is one. */
  fallbackUrl?: string | null;
  canManage: boolean;
}) {
  const id = useId();
  const [finished, finish] = useActionState(finishLogoUpload, idle);
  const [removed, remove] = useActionState(removeLogo, idle);
  const [localError, setLocalError] = useState<ActionState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const label = variant === "dark" ? "Logo for dark mode" : "Logo";

  // free each local preview once it's replaced or the uploader goes away
  useEffect(() => (preview ? () => URL.revokeObjectURL(preview) : undefined), [preview]);

  // once a logo is saved, the page shows it from storage: drop the local copy
  const [seen, setSeen] = useState(finished);
  if (finished !== seen) {
    setSeen(finished);
    if (finished.status === "success") {
      setFile(null);
      setPreview(null);
    }
  }

  const choose = (next: File | null) => {
    setLocalError(null);
    setFile(null);
    setPreview(null);
    if (!next) return;
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(next.type)) {
      setLocalError(failure("Use a PNG, JPG or WebP image. SVG files aren't accepted.", { file: ["Use a PNG, JPG or WebP image."] }));
      return;
    }
    if (next.size > MAX_LOGO_BYTES) {
      setLocalError(failure("Logos can be at most 2 MB.", { file: ["Logos can be at most 2 MB."] }));
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  };

  const save = () => {
    if (!file) return;
    startUpload(async () => {
      const ticket = await requestLogoUpload({ organizationId, variant, size: file.size, mimeType: file.type as (typeof LOGO_MIME_TYPES)[number] });
      if (!ticket.ok) {
        setLocalError(failure(ticket.message, { file: [ticket.message] }));
        return;
      }
      const { error } = await createClient().storage.from("branding").uploadToSignedUrl(ticket.path, ticket.token, file);
      if (error) {
        setLocalError(failure("The upload failed. Check your connection and try again."));
        return;
      }
      const form = new FormData();
      form.set("organizationId", organizationId);
      form.set("variant", variant);
      form.set("storagePath", ticket.path);
      startUpload(() => finish(form));
    });
  };

  const shown = localError ?? (removed.at && (!finished.at || removed.at > finished.at) ? removed : finished);
  const showing = preview ?? currentUrl;
  // the dark version is previewed on the dark sidebar colour, the regular one on white
  const backing = variant === "dark" ? "bg-rail" : "bg-white";

  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-4">
      <h3 className="font-heading font-bold">{variant === "dark" ? "Dark-mode version" : "Standard version"}</h3>
      <div className="flex flex-wrap items-center gap-4">
        <div className={`flex h-20 w-48 items-center justify-center overflow-hidden rounded-md border border-rule p-2 ${backing}`}>
          {showing ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview or a signed storage link
            <img src={showing} alt={preview ? `Preview of the new ${label.toLowerCase()}` : `Current ${label.toLowerCase()}`} className="max-h-full max-w-full object-contain" />
          ) : fallbackUrl ? (
            <span className="flex h-full items-center rounded bg-white p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link */}
              <img src={fallbackUrl} alt="Your logo on a light backing, as dark mode shows it now" className="max-h-full max-w-full object-contain" />
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-rail">
              <Logo size={28} />
              Groundwork logo
            </span>
          )}
        </div>
        {canManage ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-file`} className="font-heading text-sm font-semibold">
              {currentUrl ? "Replace" : "Upload"} {label.toLowerCase()}
            </label>
            <input
              id={`${id}-file`}
              type="file"
              accept={LOGO_ACCEPT}
              aria-describedby={`${id}-hint`}
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-rule file:bg-canvas file:px-3 file:py-1.5 file:font-heading file:font-semibold file:text-ink hover:file:border-ink"
            />
            <p id={`${id}-hint`} className="text-sm text-ink-muted">
              PNG, JPG or WebP, up to 2 MB.{variant === "dark" ? " Optional: without it, dark mode shows the logo on a light backing." : ""}
            </p>
          </div>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {file ? (
            <Button onClick={save} disabled={uploading}>
              <ImageUp aria-hidden className="size-4" />
              {uploading ? "Saving…" : `Save ${label.toLowerCase()}`}
            </Button>
          ) : null}
          {currentUrl && !file ? (
            <form action={remove}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="variant" value={variant} />
              <SubmitButton variant="danger">
                <Trash2 aria-hidden className="size-4" />
                Remove {label.toLowerCase()}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
      <FormMessage state={shown} />
    </div>
  );
}

const MODES: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "Match my device", icon: Monitor },
];

/** Settings → Profile: the viewer's mode and their own accent. */
export function AppearanceForm({
  themeMode,
  personalAccent,
  orgAccent,
  allowPersonalAccent,
}: {
  themeMode: ThemeMode;
  personalAccent: string | null;
  orgAccent: string;
  allowPersonalAccent: boolean;
}) {
  const [state, action, pending] = useActionState(updateMyAppearance, idle);
  const [choice, setChoice] = useState(personalAccent ?? "");
  const [mode, setMode] = useState(themeMode);
  // once saved, switch the page to the chosen mode straight away
  useEffect(() => {
    if (state.status === "success") document.documentElement.setAttribute("data-theme", mode);
  }, [state, mode]);
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-heading text-sm font-semibold">Appearance</legend>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <label
              key={m.mode}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-rule px-3 py-2 hover:border-ink-muted has-[:checked]:border-ink has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name="themeMode"
                value={m.mode}
                checked={mode === m.mode}
                onChange={() => setMode(m.mode)}
                className="sr-only"
              />
              <m.icon aria-hidden className="size-4" />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      {allowPersonalAccent ? (
        <>
          <AccentPicker
            name="accent"
            value={choice}
            onChange={setChoice}
            emptyLabel={{ label: "Use the organization's colour", swatch: orgAccent }}
            error={state.fieldErrors?.accent}
          />
          <AccentPreview accent={isHex(choice) ? choice : orgAccent} />
        </>
      ) : (
        <>
          <input type="hidden" name="accent" value={personalAccent ?? ""} />
          <p className="text-sm text-ink-muted">Your organization uses one accent colour for everyone, so you can&apos;t choose your own here.</p>
        </>
      )}
      <FormMessage state={state} />
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save appearance
        </SubmitButton>
      </div>
    </form>
  );
}

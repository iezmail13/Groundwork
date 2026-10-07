"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Copy, Moon, Sun, UserPlus } from "lucide-react";
import {
  inviteMember,
  saveTerminology,
  saveTheme,
  setPreset,
  updateOrganization,
} from "@/app/[orgSlug]/settings/actions";
import { idle } from "@/lib/action-state";
import { LABEL_GROUPS, SINGLE_FORM_KEYS, type LabelKey } from "@/lib/terminology/defaults";
import { useT } from "@/lib/terminology/context";
import { checkContrast, deriveTokens, isNavyFamily, MIN_CONTRAST, type ThemeMode } from "@/lib/theme/theme";
import { isHex, normalizeHex } from "@/lib/theme/color";
import { Field, Input, Select, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { LogoBadge } from "@/components/logo";
import { keepValues } from "@/lib/forms";

export type PresetChoice = { key: string; name: string; words: string[] };

export function PresetForm({
  organizationId,
  current,
  presets,
  disabled,
}: {
  organizationId: string;
  current: string;
  presets: PresetChoice[];
  disabled: boolean;
}) {
  const [state, action] = useActionState(setPreset, idle);
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <fieldset disabled={disabled}>
        <legend className="mb-2 text-ink-muted">
          A preset sets the words Groundwork uses everywhere. Your custom labels (in Terminology) still win.
        </legend>
        <div className="divide-y divide-rule border-y border-rule">
          {presets.map((p) => (
            <label key={p.key} className="flex cursor-pointer items-start gap-3 py-3 hover:bg-tint has-[:checked]:bg-panel">
              <input
                type="radio"
                name="preset"
                value={p.key}
                defaultChecked={p.key === current}
                className="mt-1 size-4 accent-[var(--ink)]"
              />
              <span>
                <span className="block font-heading font-semibold">
                  {p.name}
                  {p.key === current ? <span className="ml-2 text-sm font-normal text-ink-muted">(current)</span> : null}
                </span>
                <span className="block text-sm text-ink-muted">{p.words.join(" · ")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      {!disabled ? (
        <div>
          <SubmitButton pendingLabel="Applying…">Apply preset</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

const KEY_DESCRIPTIONS: Partial<Record<LabelKey, string>> = {
  project: "The main thing you organize work into",
  task: "A single to-do",
  event: "Something on the calendar",
  document: "An uploaded file",
  member: "A person in your organization",
};

export function TerminologyForm({
  organizationId,
  presetLabels,
  overrides,
  disabled,
}: {
  organizationId: string;
  presetLabels: Record<LabelKey, { one: string; other: string }>;
  overrides: Partial<Record<LabelKey, { one?: string; other?: string }>>;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(saveTerminology, idle);
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <p className="max-w-2xl text-ink-muted">
        Leave a field blank to use the preset&apos;s word, shown as the placeholder. Changes apply across the whole app as
        soon as you save.
      </p>
      <fieldset disabled={disabled} className="flex flex-col gap-6">
        {LABEL_GROUPS.map((group) => (
          <div key={group.title} className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="pb-2 text-left font-heading font-bold">{group.title}</caption>
              <thead>
                <tr className="border-b border-ink font-heading text-sm">
                  <th scope="col" className="w-1/3 py-2 pr-4 font-semibold">
                    Label
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Singular
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Plural
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.keys.map((key) => {
                  const single = SINGLE_FORM_KEYS.has(key);
                  return (
                    <tr key={key} className="border-b border-rule">
                      <th scope="row" className="py-2 pr-4 font-normal">
                        <span className="font-semibold">{presetLabels[key].one}</span>
                        {KEY_DESCRIPTIONS[key] ? (
                          <span className="block text-sm text-ink-muted">{KEY_DESCRIPTIONS[key]}</span>
                        ) : null}
                      </th>
                      <td className="py-2 pr-4" colSpan={single ? 2 : 1}>
                        <label htmlFor={`${key}.one`} className="sr-only">
                          {presetLabels[key].one}, {single ? "label" : "singular"}
                        </label>
                        <input
                          id={`${key}.one`}
                          name={`${key}.one`}
                          maxLength={40}
                          defaultValue={overrides[key]?.one ?? ""}
                          placeholder={presetLabels[key].one}
                          className={`${inputClass} py-1.5`}
                          aria-invalid={e[`${key}.one`] ? true : undefined}
                        />
                      </td>
                      {single ? null : (
                        <td className="py-2">
                          <label htmlFor={`${key}.other`} className="sr-only">
                            {presetLabels[key].one}, plural
                          </label>
                          <input
                            id={`${key}.other`}
                            name={`${key}.other`}
                            maxLength={40}
                            defaultValue={overrides[key]?.other ?? ""}
                            placeholder={presetLabels[key].other}
                            className={`${inputClass} py-1.5`}
                            aria-invalid={e[`${key}.other`] ? true : undefined}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </fieldset>
      <FormMessage state={state} />
      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending} pendingLabel="Saving…">Save labels</SubmitButton>
          <Button
            variant="ghost"
            onClick={(ev) => {
              const form = ev.currentTarget.form;
              form?.querySelectorAll<HTMLInputElement>("tbody input").forEach((i) => (i.value = ""));
            }}
          >
            Clear all fields
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function ThemeForm({
  organizationId,
  navy,
  mode,
  disabled,
}: {
  organizationId: string;
  navy: string;
  mode: ThemeMode;
  disabled: boolean;
}) {
  const [state, action] = useActionState(saveTheme, idle);
  const [hex, setHex] = useState(navy);
  const [currentMode, setMode] = useState<ThemeMode>(mode);
  const valid = isHex(hex);
  const family = valid && isNavyFamily(hex);
  const checks = useMemo(() => (valid ? checkContrast(deriveTokens({ navy: hex, mode: currentMode })) : []), [hex, currentMode, valid]);
  const tokens = valid ? deriveTokens({ navy: hex, mode: currentMode }) : null;
  const allPass = family && checks.every((c) => c.passes);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <p className="max-w-2xl text-ink-muted">
        Groundwork uses two colour scales, navy and bone. Pick the navy base and light or dark mode; the sidebar tint and
        every border and hover are derived from it. Changes that would drop text contrast below {MIN_CONTRAST}:1 are
        rejected.
      </p>
      <fieldset disabled={disabled} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Field label="Navy base colour" htmlFor="theme-navy" error={state.fieldErrors?.navy}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick the navy base colour"
                value={valid ? normalizeHex(hex).toLowerCase() : "#1f2d4d"}
                onChange={(e) => setHex(e.target.value.toUpperCase())}
                className="h-10 w-14 cursor-pointer rounded-md border border-rule bg-canvas p-1"
              />
              <Input
                id="theme-navy"
                name="navy"
                value={hex}
                onChange={(e) => setHex(e.target.value.trim())}
                maxLength={7}
                className="w-36 font-mono uppercase"
                invalid={!valid || !family}
              />
              <Button variant="ghost" size="sm" onClick={() => setHex("#1F2D4D")}>
                Reset
              </Button>
            </div>
          </Field>
          <fieldset>
            <legend className="mb-1.5 font-heading text-sm font-semibold">Mode</legend>
            <div className="flex gap-2">
              {(["light", "dark"] as const).map((m) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-rule px-3 py-2 has-[:checked]:border-2 has-[:checked]:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink"
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={currentMode === m}
                    onChange={() => setMode(m)}
                    className="sr-only"
                  />
                  {m === "light" ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
                  <span className="font-semibold capitalize">{m}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <h3 className="mb-1 font-heading text-sm font-semibold">Contrast check</h3>
            {!valid ? (
              <p className="text-sm font-semibold">Enter six hex digits, like #1F2D4D.</p>
            ) : !family ? (
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CircleAlert aria-hidden className="size-4" />
                Pick a navy: a blue hue that is darker than mid-tone and not too saturated.
              </p>
            ) : (
              <ul className="divide-y divide-rule border-y border-rule text-sm" aria-live="polite">
                {checks.map((c) => (
                  <li key={c.pair} className="flex items-center gap-2 py-1.5">
                    {c.passes ? <CircleCheck aria-hidden className="size-4" /> : <CircleAlert aria-hidden className="size-4" />}
                    <span className={`flex-1 ${c.passes ? "" : "font-bold"}`}>{c.pair}</span>
                    <span className="tabular-nums">{c.ratio.toFixed(2)}:1</span>
                    <span className={c.passes ? "w-12 text-ink-muted" : "w-12 font-bold"}>{c.passes ? "Pass" : "Fail"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div aria-hidden className="overflow-hidden rounded-lg border border-rule">
          {tokens ? (
            <div className="flex h-64" style={{ background: tokens.canvas, color: tokens.ink }}>
              <div className="flex w-40 flex-col gap-1.5 p-3" style={{ background: tokens.rail, color: tokens.railInk }}>
                <div className="mb-2 flex items-center gap-2">
                  <LogoBadge size={26} />
                  <span className="font-heading text-sm font-bold">Groundwork</span>
                </div>
                <span className="rounded px-2 py-1 text-sm font-semibold" style={{ background: tokens.activeBg, color: tokens.activeInk }}>
                  Active item
                </span>
                <span className="rounded px-2 py-1 text-sm" style={{ background: tokens.railHover }}>
                  Hovered item
                </span>
                <span className="px-2 py-1 text-sm" style={{ color: tokens.railInkMuted }}>
                  Secondary
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <span className="font-heading text-lg font-bold">Preview</span>
                <span className="text-sm" style={{ color: tokens.inkMuted }}>
                  Secondary text on the work area
                </span>
                <div className="rounded border p-2 text-sm" style={{ background: tokens.panel, borderColor: tokens.rule }}>
                  A panel with a rule
                </div>
                <span
                  className="mt-auto self-start rounded-md px-3 py-1.5 font-heading text-sm font-semibold"
                  style={{ background: tokens.primary, color: tokens.onPrimary }}
                >
                  Filled button
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-ink-muted">No preview</div>
          )}
        </div>
      </fieldset>
      <FormMessage state={state} />
      {!disabled ? (
        <div>
          <SubmitButton pendingLabel="Saving…" disabled={!allPass}>
            Save theme
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function OrganizationForm({
  organizationId,
  name,
  slug,
  disabled,
}: {
  organizationId: string;
  name: string;
  slug: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(updateOrganization, idle);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="currentSlug" value={slug} />
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <Field label="Organization name" htmlFor="org-name" error={e.name}>
          <Input id="org-name" name="name" required maxLength={120} defaultValue={name} invalid={Boolean(e.name)} />
        </Field>
        <Field
          label="Web address"
          htmlFor="org-slug"
          hint="Lowercase letters, digits and dashes. Changing it breaks old links."
          error={e.slug}
        >
          <div className="flex items-center">
            <span className="rounded-l-md border border-r-0 border-rule bg-panel px-3 py-2 text-ink-muted">/</span>
            <Input
              id="org-slug"
              name="slug"
              required
              maxLength={48}
              defaultValue={slug}
              className="rounded-l-none"
              invalid={Boolean(e.slug)}
            />
          </div>
        </Field>
      </fieldset>
      <FormMessage state={state} />
      {!disabled ? (
        <div>
          <SubmitButton pending={pending} pendingLabel="Saving…">Save</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function InviteForm({ organizationId }: { organizationId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(inviteMember, idle);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // start fresh after each invite, so the next one doesn't inherit the email or an Admin role
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  const link = state.status === "success" ? state.data?.link : undefined;
  const e = state.fieldErrors ?? {};
  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} action={action} onSubmit={keepValues(action)} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="organizationId" value={organizationId} />
        <Field label="Email" htmlFor="invite-email" error={e.email} className="min-w-64 flex-1">
          <Input id="invite-email" name="email" type="email" required placeholder="name@example.org" invalid={Boolean(e.email)} />
        </Field>
        <Field label="Role" htmlFor="invite-role" error={e.role}>
          <Select id="invite-role" name="role" defaultValue="member">
            <option value="member">{t("role.member")}</option>
            <option value="admin">{t("role.admin")}</option>
          </Select>
        </Field>
        <SubmitButton pending={pending} pendingLabel="Creating…">
          <UserPlus aria-hidden className="size-4" />
          Invite
        </SubmitButton>
      </form>
      <FormMessage state={state} />
      {link ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-ink p-2">
          <label htmlFor="invite-link" className="sr-only">
            Invite link
          </label>
          <input id="invite-link" readOnly value={link} className={`${inputClass} min-w-0 flex-1 font-mono text-sm`} onFocus={(ev) => ev.currentTarget.select()} />
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard?.writeText(link).catch(() => undefined);
              setCopied(true);
            }}
          >
            <Copy aria-hidden className="size-4" />
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

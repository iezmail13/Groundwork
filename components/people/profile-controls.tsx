"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellOff, ImageUp, Trash2 } from "lucide-react";
import {
  finishPhotoUpload,
  removePhoto,
  requestPhotoUpload,
  setPersonMuted,
  setPresenceMode,
  updateMyProfile,
} from "@/app/[orgSlug]/members/actions";
import { failure, idle, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/client";
import { LOGO_ACCEPT, LOGO_MIME_TYPES, MAX_PHOTO_BYTES } from "@/lib/validation";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Avatar } from "./avatar";
import type { PresenceMode } from "./presence";

// Member profile controls (D104).

/** "Mute notifications from [name]", on someone else's profile; only the viewer sees it. */
export function MuteSwitch({ organizationId, userId, name, initial }: { organizationId: string; userId: string; name: string; initial: boolean }) {
  const [muted, setMuted] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          role="switch"
          checked={muted}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setMuted(next);
            start(async () => {
              const result = await setPersonMuted({ organizationId, userId, muted: next });
              setError(!result.ok);
              if (!result.ok) setMuted(!next);
            });
          }}
          className="size-5 accent-[var(--accent)]"
        />
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <BellOff aria-hidden className="size-4" />
          Mute notifications from {name}
        </span>
      </label>
      <p className="text-sm text-ink-muted">Only you see this. You still see their work; you just aren&apos;t notified about what they do.</p>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-bad-ink">
          Couldn&apos;t change that. Try again.
        </p>
      ) : null}
    </div>
  );
}

const MODES: { value: PresenceMode; label: string; hint: string }[] = [
  { value: "auto", label: "Automatic", hint: "Online while Groundwork is open, away after five quiet minutes." },
  { value: "dnd", label: "Do not disturb", hint: "Shows Do not disturb and mutes your notifications." },
  { value: "invisible", label: "Appear offline", hint: "Nobody sees you online." },
];

export function PresenceModePicker({ initial }: { initial: PresenceMode }) {
  const [mode, setMode] = useState(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  return (
    <fieldset className="flex max-w-2xl flex-col gap-2" disabled={pending}>
      <legend className="mb-2 font-heading text-sm font-semibold">Your status</legend>
      {MODES.map((m) => (
        <label key={m.value} className="flex cursor-pointer items-start gap-3 rounded-md border border-rule p-3 has-[:checked]:border-ink">
          <input
            type="radio"
            name="presence"
            value={m.value}
            checked={mode === m.value}
            onChange={() => {
              setMode(m.value);
              start(async () => {
                const result = await setPresenceMode({ mode: m.value });
                setMessage(result.ok ? "Saved." : "Couldn't save. Try again.");
                if (result.ok) router.refresh();
              });
            }}
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block font-semibold">{m.label}</span>
            <span className="block text-sm text-ink-muted">{m.hint}</span>
          </span>
        </label>
      ))}
      <p role="status" className="text-sm font-semibold">
        {message}
      </p>
    </fieldset>
  );
}

export function ProfileForm({
  fullName,
  email,
  title,
  bio,
}: {
  fullName: string;
  email: string;
  title: string | null;
  bio: string | null;
}) {
  const [state, action, pending] = useActionState(updateMyProfile, idle);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <Field label="Name" htmlFor="profile-name" hint="How your colleagues see you." error={e.fullName}>
        <Input id="profile-name" name="fullName" required maxLength={120} defaultValue={fullName} invalid={Boolean(e.fullName)} />
      </Field>
      <Field label="Email" htmlFor="profile-email" hint="From your sign-in; it can't be changed here.">
        <Input id="profile-email" value={email} readOnly disabled />
      </Field>
      <Field label="Title" htmlFor="profile-title" hint="For example, Volunteer coordinator." error={e.title}>
        <Input id="profile-title" name="title" maxLength={120} defaultValue={title ?? ""} invalid={Boolean(e.title)} />
      </Field>
      <Field label="About you" htmlFor="profile-bio" hint="A line or two your colleagues will see on your profile." error={e.bio}>
        <Textarea id="profile-bio" name="bio" maxLength={1000} rows={3} defaultValue={bio ?? ""} invalid={Boolean(e.bio)} />
      </Field>
      <FormMessage state={state} />
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save profile
        </SubmitButton>
      </div>
    </form>
  );
}

/** Your own photo in this organization: PNG, JPG or WebP up to 5 MB. */
export function PhotoUploader({
  organizationId,
  name,
  initials,
  photoUrl,
}: {
  organizationId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(idle);
  const [uploading, start] = useTransition();
  const [removeState, remove, removing] = useActionState(removePhoto, idle);

  const upload = (file: File | undefined) => {
    if (!file) return;
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setState(failure("Use a PNG, JPG or WebP image."));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setState(failure("Photos can be at most 5 MB."));
      return;
    }
    start(async () => {
      const ticket = await requestPhotoUpload({ organizationId, size: file.size, mimeType: file.type });
      if (!ticket.ok) {
        setState(failure(ticket.message));
        return;
      }
      const { error } = await createClient().storage.from("profile-photos").uploadToSignedUrl(ticket.path, ticket.token, file);
      if (error) {
        setState(failure("The upload failed. Check your connection and try again."));
        return;
      }
      setState(await finishPhotoUpload({ organizationId, path: ticket.path }));
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={name} initials={initials} photoUrl={photoUrl} size="lg" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-rule bg-canvas px-3 py-2 font-heading text-sm font-semibold hover:border-ink-muted focus-within:outline-2 focus-within:outline-accent">
            <ImageUp aria-hidden className="size-4" />
            {uploading ? "Uploading…" : photoUrl ? "Replace photo" : "Upload a photo"}
            <input
              type="file"
              accept={LOGO_ACCEPT}
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {photoUrl ? (
            <form action={remove}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <Button type="submit" variant="ghost" disabled={removing}>
                <Trash2 aria-hidden className="size-4" />
                Remove photo
              </Button>
            </form>
          ) : null}
        </div>
        <p className="text-sm text-ink-muted">PNG, JPG or WebP, up to 5 MB. Only people in this organization see it.</p>
        <FormMessage state={removeState.status !== "idle" ? removeState : state} />
      </div>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, X } from "lucide-react";
import { Field, Input, Textarea, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { idle } from "@/lib/action-state";
import { keepValues } from "@/lib/forms";
import { createClient } from "@/lib/supabase/client";
import { decideSpending, fundsFor, receiptLink, requestReceiptUpload, submitSpending, withdrawSpending } from "@/app/[orgSlug]/spending/actions";

/**
 * Submitting spending (D108): pick the program, then a fund that pays for
 * it (names only), the amount, category, date, a note and an optional receipt.
 */
export function SpendingForm({
  orgSlug,
  programs,
  categories,
  today,
  programLabel,
}: {
  orgSlug: string;
  programs: { id: string; name: string }[];
  categories: string[];
  today: string;
  programLabel: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitSpending, idle);
  const [projectId, setProjectId] = useState(programs[0]?.id ?? "");
  const [funds, setFunds] = useState<{ id: string; name: string }[] | null>(null);
  const [receipt, setReceipt] = useState<{ path: string; name: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    void fundsFor({ projectId }).then((list) => {
      if (alive) setFunds(list);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    // a submitted receipt belongs to its entry now
    queueMicrotask(() => setReceipt(null));
    router.refresh();
  }, [state, router]);

  const upload = (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    startUpload(async () => {
      const ticket = await requestReceiptUpload({ orgSlug, size: file.size, mimeType: file.type });
      if (!ticket.ok) {
        setUploadError(ticket.message);
        return;
      }
      const { error } = await createClient().storage.from("receipts").uploadToSignedUrl(ticket.path, ticket.token, file);
      if (error) {
        setUploadError("The upload failed. Check your connection and try again.");
        return;
      }
      setReceipt({ path: ticket.path, name: file.name });
    });
  };

  if (programs.length === 0) {
    return <p className="text-sm text-ink-muted">You can submit spending once you&apos;re on a {programLabel.toLowerCase()} with a fund.</p>;
  }

  return (
    <form ref={formRef} action={action} onSubmit={keepValues(action)} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="receiptPath" value={receipt?.path ?? ""} />
      <Field label={programLabel} htmlFor="spend-project" error={state.fieldErrors?.projectId}>
        <select id="spend-project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Fund"
        htmlFor="spend-fund"
        error={state.fieldErrors?.fundId}
        hint={funds && funds.length === 0 ? "No fund pays for this yet. Ask whoever runs your funds to link one." : undefined}
      >
        <select id="spend-fund" name="fundId" required className={inputClass} disabled={!funds || funds.length === 0}>
          {(funds ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount" htmlFor="spend-amount" error={state.fieldErrors?.amount}>
        <Input id="spend-amount" name="amount" inputMode="decimal" placeholder="42.50" required invalid={Boolean(state.fieldErrors?.amount)} />
      </Field>
      <Field label="Category" htmlFor="spend-category" error={state.fieldErrors?.category}>
        <Input id="spend-category" name="category" list="spend-categories" required maxLength={60} invalid={Boolean(state.fieldErrors?.category)} />
        <datalist id="spend-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Date spent" htmlFor="spend-date" error={state.fieldErrors?.spentOn}>
        <Input id="spend-date" name="spentOn" type="date" defaultValue={today} max={today} required />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="font-heading text-sm font-semibold">Receipt (optional)</span>
        {receipt ? (
          <p className="flex items-center gap-2 text-sm">
            <Check aria-hidden className="size-4 text-good" />
            <span className="truncate">{receipt.name}</span>
            <button type="button" onClick={() => setReceipt(null)} className="inline-flex items-center gap-1 text-ink-muted hover:underline">
              <X aria-hidden className="size-3.5" />
              Remove
            </button>
          </p>
        ) : (
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-rule px-3 py-2 font-heading text-sm font-semibold hover:border-ink-muted focus-within:outline-2 focus-within:outline-accent">
            <FileUp aria-hidden className="size-4" />
            {uploading ? "Uploading…" : "Add a photo or PDF"}
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        )}
        {uploadError ? (
          <p role="alert" className="text-sm font-semibold text-bad-ink">
            {uploadError}
          </p>
        ) : null}
      </div>
      <Field label="Note (optional)" htmlFor="spend-note" error={state.fieldErrors?.note} className="md:col-span-2">
        <Textarea id="spend-note" name="note" maxLength={1000} rows={2} />
      </Field>
      <div className="flex flex-col gap-2 md:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pending={pending || uploading} pendingLabel="Submitting…" className="self-start">
          Submit for approval
        </SubmitButton>
      </div>
    </form>
  );
}

/** Approve or reject, with an optional note (D108). */
export function DecisionButtons({ entryId, label }: { entryId: string; label: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const result = await decideSpending({ entryId, approve, note });
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor={`note-${entryId}`}>
          Note for {label}
        </label>
        <input
          id={`note-${entryId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Note (optional)"
          className="w-36 rounded border border-rule bg-canvas px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(true)}
          aria-label={`Approve ${label}`}
          className="rounded border border-good px-2 py-1 font-heading text-xs font-semibold text-good-ink hover:bg-panel"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(false)}
          aria-label={`Reject ${label}`}
          className="rounded border border-bad px-2 py-1 font-heading text-xs font-semibold text-bad-ink hover:bg-panel"
        >
          Reject
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-semibold text-bad-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function WithdrawButton({ entryId, label }: { entryId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Withdraw ${label}`}
      onClick={() => {
        if (!window.confirm("Withdraw this entry?")) return;
        start(async () => {
          if ((await withdrawSpending({ entryId })).ok) router.refresh();
        });
      }}
      className="text-xs text-ink-muted hover:text-bad-ink hover:underline"
    >
      Withdraw
    </button>
  );
}

export function ReceiptButton({ entryId, label }: { entryId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`View the receipt for ${label}`}
      onClick={() =>
        start(async () => {
          const link = await receiptLink({ entryId });
          if (link.ok) window.open(link.url, "_blank", "noopener,noreferrer");
        })
      }
      className="text-xs font-semibold text-accent hover:underline"
    >
      Receipt
    </button>
  );
}

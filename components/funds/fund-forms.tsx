"use client";

import { useActionState, useEffect } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { addAllocation, createFund, deleteFund, updateAllocation, updateFund } from "@/app/[orgSlug]/funds/actions";
import { idle } from "@/lib/action-state";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";
import { CURRENCIES, centsToInput } from "@/lib/money";
import { DialogButton } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { keepValues } from "@/lib/forms";

type ProjectOption = { id: string; name: string };

export type FundValues = {
  id: string;
  name: string;
  description: string | null;
  total_cents: number;
  currency: string;
  project_id: string | null;
};

function ProjectPicker({ id, projects, value, error }: { id: string; projects: ProjectOption[]; value: string | null; error?: string[] }) {
  const t = useT();
  return (
    <Field label={`Linked ${lower(t("project"))} (optional)`} htmlFor={id} error={error}>
      <Select id={id} name="projectId" defaultValue={value ?? ""}>
        <option value="">None</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function FundButton({
  organizationId,
  orgSlug,
  projects,
  fund,
}: {
  organizationId: string;
  orgSlug: string;
  projects: ProjectOption[];
  /** Edit this fund; omit to create one. */
  fund?: FundValues;
}) {
  return (
    <DialogButton
      variant={fund ? "secondary" : "primary"}
      label={fund ? "Edit fund" : "New fund"}
      icon={fund ? <Pencil aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
      title={fund ? `Edit ${fund.name}` : "New fund"}
    >
      {(close) => <FundForm organizationId={organizationId} orgSlug={orgSlug} projects={projects} fund={fund} onDone={close} />}
    </DialogButton>
  );
}

function FundForm({
  organizationId,
  orgSlug,
  projects,
  fund,
  onDone,
}: {
  organizationId: string;
  orgSlug: string;
  projects: ProjectOption[];
  fund?: FundValues;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(fund ? updateFund : createFund, idle);
  const e = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {fund ? <input type="hidden" name="id" value={fund.id} /> : null}
      <Field label="Name" htmlFor="fund-name" hint="For example, the grant or campaign it comes from." error={e.name}>
        <Input id="fund-name" name="name" required maxLength={120} defaultValue={fund?.name} invalid={Boolean(e.name)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Total" htmlFor="fund-total" error={e.total}>
          <Input
            id="fund-total"
            name="total"
            inputMode="decimal"
            required
            placeholder="10000"
            defaultValue={fund ? centsToInput(fund.total_cents) : ""}
            invalid={Boolean(e.total)}
          />
        </Field>
        <Field label="Currency" htmlFor="fund-currency" error={e.currency}>
          <Select id="fund-currency" name="currency" defaultValue={fund?.currency ?? "CAD"}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ProjectPicker id="fund-project" projects={projects} value={fund?.project_id ?? null} error={e.projectId} />
      <Field label="Notes" htmlFor="fund-description" error={e.description}>
        <Textarea id="fund-description" name="description" rows={3} maxLength={2000} defaultValue={fund?.description ?? ""} />
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {fund ? "Save changes" : "Create fund"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function AddAllocationForm({
  organizationId,
  fundId,
  projects,
  remainingLabel,
}: {
  organizationId: string;
  fundId: string;
  projects: ProjectOption[];
  /** "$4,000 left to allocate" */
  remainingLabel: string;
}) {
  const [state, action, pending] = useActionState(addAllocation, idle);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-3" noValidate key={state.status === "success" ? state.at : "form"}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="fundId" value={fundId} />
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1.5fr_auto] md:items-end">
        <Field label="What it's for" htmlFor="allocation-label" error={e.label}>
          <Input id="allocation-label" name="label" required maxLength={120} placeholder="Supplies" invalid={Boolean(e.label)} />
        </Field>
        <Field label="Amount" htmlFor="allocation-amount" error={e.amount}>
          <Input id="allocation-amount" name="amount" inputMode="decimal" required placeholder="2500" invalid={Boolean(e.amount)} />
        </Field>
        <ProjectPicker id="allocation-project" projects={projects} value={null} error={e.projectId} />
        <SubmitButton pending={pending} pendingLabel="Adding…">
          <Plus aria-hidden className="size-4" />
          Allocate
        </SubmitButton>
      </div>
      <p className="text-sm text-ink-muted">{remainingLabel}</p>
      <FormMessage state={state} />
    </form>
  );
}

export function EditAllocationButton({
  organizationId,
  fundId,
  projects,
  allocation,
}: {
  organizationId: string;
  fundId: string;
  projects: ProjectOption[];
  allocation: { id: string; label: string; amount_cents: number; project_id: string | null };
}) {
  return (
    <DialogButton
      variant="ghost"
      size="sm"
      label="Edit"
      ariaLabel={`Edit ${allocation.label}`}
      icon={<Pencil aria-hidden className="size-4" />}
      title={`Edit ${allocation.label}`}
    >
      {(close) => <EditAllocationForm organizationId={organizationId} fundId={fundId} projects={projects} allocation={allocation} onDone={close} />}
    </DialogButton>
  );
}

function EditAllocationForm({
  organizationId,
  fundId,
  projects,
  allocation,
  onDone,
}: {
  organizationId: string;
  fundId: string;
  projects: ProjectOption[];
  allocation: { id: string; label: string; amount_cents: number; project_id: string | null };
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateAllocation, idle);
  const e = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="fundId" value={fundId} />
      <input type="hidden" name="id" value={allocation.id} />
      <Field label="What it's for" htmlFor="edit-allocation-label" error={e.label}>
        <Input id="edit-allocation-label" name="label" required maxLength={120} defaultValue={allocation.label} invalid={Boolean(e.label)} />
      </Field>
      <Field label="Amount" htmlFor="edit-allocation-amount" error={e.amount}>
        <Input
          id="edit-allocation-amount"
          name="amount"
          inputMode="decimal"
          required
          defaultValue={centsToInput(allocation.amount_cents)}
          invalid={Boolean(e.amount)}
        />
      </Field>
      <ProjectPicker id="edit-allocation-project" projects={projects} value={allocation.project_id} error={e.projectId} />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}

export function DeleteFundButton({ id, name, orgSlug }: { id: string; name: string; orgSlug: string }) {
  return (
    <DialogButton variant="danger" label="Delete" icon={<Trash2 aria-hidden className="size-4" />} title={`Delete ${name}?`}>
      {(close) => <DeleteFundForm id={id} name={name} orgSlug={orgSlug} onCancel={close} />}
    </DialogButton>
  );
}

function DeleteFundForm({ id, name, orgSlug, onCancel }: { id: string; name: string; orgSlug: string; onCancel: () => void }) {
  const [state, action] = useActionState(deleteFund, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <p>
        <strong>{name}</strong> and how it&apos;s split will be deleted. This can&apos;t be undone.
      </p>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton variant="danger" pendingLabel="Deleting…">
          <Trash2 aria-hidden className="size-4" />
          Delete permanently
        </SubmitButton>
      </div>
    </form>
  );
}

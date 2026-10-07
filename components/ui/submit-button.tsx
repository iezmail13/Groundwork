"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "./button";
import type { ComponentProps } from "react";

export function SubmitButton({
  children,
  pendingLabel,
  pending: pendingProp,
  ...props
}: ComponentProps<typeof Button> & {
  pendingLabel?: string;
  /** Pass useActionState's isPending for forms submitted with keepValues(). */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-disabled={pending} {...props}>
      {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

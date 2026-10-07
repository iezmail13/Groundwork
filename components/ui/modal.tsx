"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";

/**
 * Controlled modal built on <dialog>: the browser makes the page behind it
 * inert, traps focus, closes on Escape and restores focus on close.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="gw-dialog m-auto"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // a click on the backdrop lands on the <dialog> element itself
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-bold">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-0.5 text-sm text-ink-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog" className="-mr-2 px-2">
              <X aria-hidden className="size-4" />
            </Button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

/** A button that opens a modal. `children` receives a close() callback. */
export function DialogButton({
  label,
  icon,
  title,
  description,
  variant = "primary",
  size = "md",
  className,
  ariaLabel,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
      >
        {icon}
        {label}
      </Button>
      <Modal open={open} onClose={close} title={title} description={description}>
        {children(close)}
      </Modal>
    </>
  );
}

"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Submits a form to a useActionState action WITHOUT React's automatic form
 * reset. React 19 resets uncontrolled fields whenever a form `action`
 * resolves, including when it returns a validation error, which would wipe
 * what the person typed (and any file they picked). Pair it with the third
 * value from useActionState for the button's pending state.
 */
export function keepValues(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => action(formData));
  };
}

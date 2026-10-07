import { z } from "zod";

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Monotonic stamp so clients can react to repeated identical results. */
  at?: number;
};

export const idle: ActionState = { status: "idle" };

export function success(message?: string): ActionState {
  return { status: "success", message, at: Date.now() };
}

export function failure(message: string, fieldErrors?: ActionState["fieldErrors"]): ActionState {
  return { status: "error", message, fieldErrors, at: Date.now() };
}

export function invalid(error: z.ZodError): ActionState {
  const { fieldErrors, formErrors } = z.flattenError(error);
  return failure(formErrors[0] ?? "Check the highlighted fields.", fieldErrors as ActionState["fieldErrors"]);
}

/** Maps a Postgres/PostgREST error to a message people can act on. */
export function dbFailure(error: { code?: string; message?: string; hint?: string | null } | null): ActionState {
  if (!error) return failure("Something went wrong. Try again.");
  switch (error.code) {
    case "42501":
      return failure("You don't have permission to do that.");
    case "23505":
      return failure("That is already taken. Try something else.");
    case "23503":
      return failure("Something this refers to no longer exists. Refresh and try again.");
    case "23514":
    case "22023":
      return failure("Some of the values aren't allowed. Check them and try again.");
    case "P0001":
    case "P0002":
      return failure(error.message ?? "That isn't allowed.");
    default:
      return failure("Something went wrong saving that. Try again.");
  }
}

/** FormData -> plain object, turning empty strings into undefined. */
export function formObject(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    out[key] = trimmed === "" ? undefined : trimmed;
  }
  return out;
}

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Sign in with Google through Supabase Auth. Google returns to
 * /auth/callback, which exchanges the code and continues to `next`.
 * Supabase only links a Google account to an existing one when Google says
 * the address is verified.
 */
export function GoogleButton({ next }: { next?: string }) {
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        className="w-full"
        disabled={state === "pending"}
        onClick={async () => {
          setState("pending");
          const callback = new URL("/auth/callback", window.location.origin);
          if (next) callback.searchParams.set("next", next);
          const { error } = await createClient().auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: callback.toString() },
          });
          if (error) setState("error");
        }}
      >
        {state === "pending" ? "Opening Google…" : "Continue with Google"}
      </Button>
      {state === "error" ? (
        <p role="alert" className="text-sm font-semibold">
          Google sign-in isn&apos;t available right now. Use the email link instead.
        </p>
      ) : null}
    </div>
  );
}

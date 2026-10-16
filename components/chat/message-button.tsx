"use client";

import { MessageSquare } from "lucide-react";
import { useChat } from "@/components/chat/chat";

/** "Send a message" on someone's profile: opens the chat panel on your direct conversation. */
export function MessageButton({ userId, name }: { userId: string; name: string }) {
  const chat = useChat();
  return (
    <button
      type="button"
      onClick={() => chat.openDirectWith(userId)}
      className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 font-heading text-sm font-semibold text-on-accent"
    >
      <MessageSquare aria-hidden className="size-4" />
      Message {name.split(" ")[0]}
    </button>
  );
}

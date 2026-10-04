import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listWhatsappConversationsFn,
  getWhatsappThreadFn,
  sendWhatsappReplyFn,
} from "../server/whatsapp";
import { toast } from "../components/toaster";

export const Route = createFileRoute("/whatsapp")({
  component: WhatsappInbox,
});

const SUPABASE_PUBLIC = import.meta.env.VITE_SUPABASE_URL as string | undefined;
function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (!SUPABASE_PUBLIC) return null;
  return `${SUPABASE_PUBLIC.replace(/\/$/, "")}/storage/v1/object/public/whatsapp-media/${path}`;
}

function WhatsappInbox() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const conversations = useQuery({
    queryKey: ["wa", "conversations"],
    queryFn: () => listWhatsappConversationsFn(),
    refetchInterval: 5000,
  });

  const thread = useQuery({
    queryKey: ["wa", "thread", selected],
    queryFn: () => getWhatsappThreadFn({ data: { conversationId: selected! } }),
    enabled: !!selected,
    refetchInterval: 5000,
  });

  async function send() {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    try {
      const res = await sendWhatsappReplyFn({ data: { conversationId: selected, text } });
      if (!res.ok) {
        setDraft(text);
        toast.error("Failed to send", res.message);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["wa", "thread", selected] });
      await qc.invalidateQueries({ queryKey: ["wa", "conversations"] });
    } catch (e) {
      setDraft(text);
      toast.error("Failed to send", e instanceof Error ? e.message : "Network error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversation list */}
      <aside className="w-72 shrink-0 overflow-y-auto rounded-lg border border-black/10 bg-white">
        <h1 className="px-4 py-3 text-lg font-semibold">WhatsApp</h1>
        {(conversations.data ?? []).map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`flex w-full flex-col gap-0.5 border-t border-black/5 px-4 py-3 text-left hover:bg-black/5 ${
              selected === c.id ? "bg-black/5" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.displayName ?? `+${c.phone}`}</span>
              {c.unreadCount > 0 && (
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">
                  {c.unreadCount}
                </span>
              )}
            </div>
            <span className="truncate text-sm text-black/60">{c.lastPreview}</span>
          </button>
        ))}
        {conversations.data?.length === 0 && (
          <p className="px-4 py-6 text-sm text-black/50">No conversations yet.</p>
        )}
      </aside>

      {/* Thread */}
      <section className="flex flex-1 flex-col rounded-lg border border-black/10 bg-white">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-black/40">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {(thread.data ?? []).map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    m.direction === "outbound"
                      ? "ml-auto bg-emerald-600 text-white"
                      : "bg-black/5"
                  }`}
                >
                  {m.kind === "image" && mediaUrl(m.mediaStoragePath) && (
                    <img
                      src={mediaUrl(m.mediaStoragePath)!}
                      alt={m.text ?? "photo"}
                      className="mb-1 max-h-60 rounded"
                    />
                  )}
                  {m.text && <span>{m.text}</span>}
                  {!m.text && m.kind !== "image" && (
                    <span className="italic opacity-70">[{m.kind}]</span>
                  )}
                </div>
              ))}
            </div>
            <form
              className="flex gap-2 border-t border-black/10 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a reply…"
                className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

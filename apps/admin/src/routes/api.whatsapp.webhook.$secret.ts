import { createFileRoute } from "@tanstack/react-router";
import {
  getEnv,
  tryCreateDb,
  recordInboundMessage,
  timingSafeEqualStr,
} from "@flowers/api";
import { parseInboundMessage } from "@flowers/integrations";
import { createSupabaseAdminClient } from "@flowers/auth";

const MEDIA_BUCKET = "whatsapp-media";

function extFor(mime: string | null): string {
  if (!mime) return "bin";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "bin";
}

/** Decode base64 to bytes (Workers-native atob). */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const Route = createFileRoute("/api/whatsapp/webhook/$secret")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const env = getEnv();
        if (
          !env.WHATSAPP_WEBHOOK_SECRET ||
          !timingSafeEqualStr(params.secret, env.WHATSAPP_WEBHOOK_SECRET)
        ) {
          return new Response("Not found", { status: 404 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("ok", { status: 200 }); // nothing to do
        }

        const parsed = parseInboundMessage(body);
        if (!parsed) return new Response("ok", { status: 200 });

        const db = tryCreateDb();
        if (!db) return new Response("db unavailable", { status: 500 });

        try {
          // Store image media (best-effort) in the public whatsapp-media bucket.
          let mediaStoragePath: string | null = null;
          if (parsed.kind === "image" && parsed.mediaBase64) {
            if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
              try {
                const supabase = createSupabaseAdminClient({
                  url: env.SUPABASE_URL,
                  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
                });
                const key = `inbound/${parsed.phone}/${parsed.keyId ?? crypto.randomUUID()}.${extFor(parsed.mediaMime)}`;
                const { error } = await supabase.storage
                  .from(MEDIA_BUCKET)
                  .upload(key, b64ToBytes(parsed.mediaBase64), {
                    contentType: parsed.mediaMime ?? "application/octet-stream",
                    upsert: true,
                  });
                if (!error) mediaStoragePath = key;
              } catch {
                // media upload is best-effort; fall through storing the row w/o media
              }
            }
          }

          await recordInboundMessage(db, {
            remoteJid: parsed.remoteJid,
            phone: parsed.phone,
            pushName: parsed.pushName,
            evolutionKeyId: parsed.keyId,
            kind: parsed.kind,
            text: parsed.text,
            mediaStoragePath,
            mediaMime: parsed.mediaMime,
            remoteTimestamp: parsed.timestamp ? new Date(parsed.timestamp * 1000) : null,
          });

          return new Response("ok", { status: 200 });
        } catch {
          return new Response("error", { status: 500 }); // safe: idempotent retry
        }
      },
    },
  },
});

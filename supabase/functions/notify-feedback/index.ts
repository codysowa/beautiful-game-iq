import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKeysRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const publishableKey = publishableKeysRaw
      ? (() => {
          try {
            return JSON.parse(publishableKeysRaw).default || "";
          } catch {
            return "";
          }
        })()
      : Deno.env.get("SUPABASE_ANON_KEY") || "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !publishableKey || !resendApiKey) {
      console.error("Feedback notification server configuration is incomplete.");
      return jsonResponse({ error: "Feedback email is temporarily unavailable." }, 503);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Missing authorization" }, 401);
    const accessToken = authHeader.substring(7).trim();
    const supabase = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) return jsonResponse({ error: "Unable to verify signed-in user" }, 401);

    const body = await req.json();
    const feedbackType = body.feedback_type === "suggestion" ? "Feature idea / suggestion" : "General feedback";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const platform = typeof body.platform === "string" ? body.platform : "unknown";

    if (!message || message.length > 4000) {
      return jsonResponse({ error: "Feedback must be between 1 and 4000 characters." }, 400);
    }

    const html = `
      <h2>Beautiful Game IQ — ${escapeHtml(feedbackType)}</h2>
      <p><strong>From account:</strong> ${escapeHtml(user.email || user.id)}</p>
      <p><strong>Platform:</strong> ${escapeHtml(platform)}</p>
      <hr />
      <p>${escapeHtml(message).replaceAll("\\n", "<br />")}</p>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: "Beautiful Game IQ Feedback <cody@beautifulgameiq.com>",
        to: ["cody@beautifulgameiq.com"],
        subject: `[BG IQ Feedback] ${feedbackType} — ${(user.email || "Coach").slice(0, 120)}`,
        html,
        reply_to: user.email || undefined,
      }),
    });

    if (!emailResponse.ok) {
      console.error("Feedback email failed:", await emailResponse.text());
      return jsonResponse({ error: "Feedback was saved, but email notification failed." }, 502);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Notify feedback error:", error);
    return jsonResponse({ error: "Could not send feedback notification." }, 500);
  }
});

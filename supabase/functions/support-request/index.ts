import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not configured");
      return jsonResponse({ error: "Support service is temporarily unavailable." }, 503);
    }

    const body = await req.json();

    // Honeypot for simple bot protection.
    if (typeof body.website === "string" && body.website.trim()) {
      return jsonResponse({ success: true });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!name || !email || !message) {
      return jsonResponse({ error: "Name, email, and message are required." }, 400);
    }

    if (!isValidEmail(email)) {
      return jsonResponse({ error: "Please enter a valid email address." }, 400);
    }

    if (name.length > 100 || email.length > 254 || message.length > 5000) {
      return jsonResponse({ error: "Your support request is too long." }, 400);
    }

    const html = `
      <h2>Beautiful Game IQ Support Request</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <hr />
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replaceAll("\\n", "<br />")}</p>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Beautiful Game IQ Support <cody@beautifulgameiq.com>",
        to: ["cody@beautifulgameiq.com"],
        subject: `[BG IQ Support] ${name}`,
        html,
        reply_to: email,
      }),
    });

    if (!emailResponse.ok) {
      console.error("Support email failed:", await emailResponse.text());
      return jsonResponse({ error: "We couldn't send your request. Please try again." }, 502);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Support request error:", error);
    return jsonResponse({ error: "We couldn't send your request. Please try again." }, 500);
  }
});

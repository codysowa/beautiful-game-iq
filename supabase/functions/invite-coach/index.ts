import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type InviteRole = "coach" | "viewer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");

    if (!supabaseUrl || !secretKeysRaw) {
      console.error("Missing Supabase server configuration");
      return jsonResponse(
        { error: "Server configuration is missing" },
        500
      );
    }

    const secretKeys = JSON.parse(secretKeysRaw);
    const secretKey = secretKeys.default;

    if (!secretKey) {
      console.error("Default Supabase secret key is missing");
      return jsonResponse(
        { error: "Supabase secret key is missing" },
        500
      );
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const accessToken = authHeader.substring(7).trim();

    if (!accessToken) {
      return jsonResponse({ error: "Missing access token" }, 401);
    }

    const supabase = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      console.error("User verification failed:", userError);
      return jsonResponse(
        { error: "Unable to verify signed-in user" },
        401
      );
    }

    console.log("Authenticated user:", user.id);

    const body = await req.json();

    const teamId =
      typeof body.team_id === "string" ? body.team_id.trim() : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const role = body.role as InviteRole;

    if (!teamId || !email || !role) {
      return jsonResponse(
        { error: "team_id, email, and role are required" },
        400
      );
    }

    if (role !== "coach" && role !== "viewer") {
      return jsonResponse(
        { error: "Role must be coach or viewer" },
        400
      );
    }

    if (!email.includes("@")) {
      return jsonResponse(
        { error: "Please provide a valid email address" },
        400
      );
    }

    const {
      data: membership,
      error: membershipError,
    } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("Membership lookup failed:", membershipError);
      return jsonResponse(
        { error: "Unable to verify team permissions" },
        500
      );
    }

    if (membership?.role !== "owner") {
      return jsonResponse(
        { error: "Only the team owner can invite staff" },
        403
      );
    }

    const {
      data: team,
      error: teamError,
    } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .maybeSingle();

    if (teamError) {
      console.error("Team lookup failed:", teamError);
      return jsonResponse(
        { error: "Unable to verify team" },
        500
      );
    }

    if (!team) {
      return jsonResponse({ error: "Team not found" }, 404);
    }

    const {
      data: existingInvitation,
      error: invitationLookupError,
    } = await supabase
      .from("team_invitations")
      .select("id")
      .eq("team_id", teamId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (invitationLookupError) {
      console.error(
        "Invitation lookup failed:",
        invitationLookupError
      );
      return jsonResponse(
        { error: "Unable to check existing invitations" },
        500
      );
    }

    if (existingInvitation) {
      return jsonResponse(
        {
          error: "An invitation is already pending for this email",
        },
        409
      );
    }

    console.log("Sending invitation to:", email);

    const {
      data: invitedUser,
      error: inviteError,
    } = await supabase.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      console.error("Auth invitation failed:", inviteError);
      return jsonResponse(
        { error: inviteError.message },
        400
      );
    }

    const invitedUserId = invitedUser.user?.id;

    if (!invitedUserId) {
      return jsonResponse(
        { error: "No user ID returned from invitation" },
        500
      );
    }

    console.log("Invited user:", invitedUserId);

    const { error: memberError } =
      await supabase
        .from("team_members")
        .insert({
          team_id: teamId,
          user_id: invitedUserId,
          role,
        });

    if (memberError) {
      console.error("Team member insert failed:", memberError);
      return jsonResponse(
        {
          error:
            "Invitation was sent, but the coach could not be added to the team",
        },
        500
      );
    }

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const {
      error: invitationInsertError,
    } = await supabase
      .from("team_invitations")
      .insert({
        email,
        team_id: teamId,
        invited_by: user.id,
        role,
        status: "pending",
        expires_at: expiresAt,
      });

    if (invitationInsertError) {
      console.error(
        "Invitation record insert failed:",
        invitationInsertError
      );
      return jsonResponse(
        {
          error:
            "Invitation was sent and the coach was added, but the invitation record could not be saved",
        },
        500
      );
    }

    console.log("Invitation completed successfully");

    return jsonResponse({
      success: true,
      message: `Invitation sent to ${email}`,
      team: team.name,
      role,
    });
  } catch (error) {
    console.error("Invite coach error:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error",
      },
      500
    );
  }
});

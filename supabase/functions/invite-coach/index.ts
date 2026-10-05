import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type InviteRole = "coach";

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

    if (role !== "coach") {
      return jsonResponse(
        { error: "Role must be coach" },
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

    // Look up the Auth account directly. The profiles table is an app-level
    // convenience and may not exist yet for a newly created/unverified user.
    // Auth is the source of truth for whether an account exists.
    let existingAuthUser: { id: string; email?: string | null; email_confirmed_at?: string | null } | null = null;
    let page = 1;

    while (!existingAuthUser) {
      const { data: authUsers, error: authUsersError } =
        await supabase.auth.admin.listUsers({ page, perPage: 1000 });

      if (authUsersError) {
        console.error("Auth user lookup failed:", authUsersError);
        return jsonResponse(
          { error: "Unable to check whether this coach already has an account" },
          500
        );
      }

      existingAuthUser = authUsers.users.find(
        (candidate) => candidate.email?.toLowerCase() === email
      ) ?? null;

      if (existingAuthUser || authUsers.users.length < 1000) break;
      page += 1;
    }

    if (existingAuthUser) {
      const { error: staleInvitationCleanupError } = await supabase
        .from("team_invitations")
        .delete()
        .eq("team_id", teamId)
        .eq("email", email)
        .eq("status", "pending");

      if (staleInvitationCleanupError) {
        console.error(
          "Stale invitation cleanup failed:",
          staleInvitationCleanupError
        );
        return jsonResponse(
          { error: "Unable to prepare the coach invitation" },
          500
        );
      }

      const { data: existingMembership, error: existingMembershipError } =
        await supabase
          .from("team_members")
          .select("role")
          .eq("team_id", teamId)
          .eq("user_id", existingAuthUser.id)
          .maybeSingle();

      if (existingMembershipError) {
        console.error(
          "Existing membership lookup failed:",
          existingMembershipError
        );
        return jsonResponse(
          { error: "Unable to check the coach's existing team access" },
          500
        );
      }

      if (existingMembership) {
        if (existingMembership.role !== role) {
          const { error: roleUpdateError } = await supabase
            .from("team_members")
            .update({ role })
            .eq("team_id", teamId)
            .eq("user_id", existingAuthUser.id);

          if (roleUpdateError) {
            console.error(
              "Existing membership role update failed:",
              roleUpdateError
            );
            return jsonResponse(
              {
                error:
                  "The coach already has team access, but the role could not be updated",
              },
              500
            );
          }
        }

        return jsonResponse({
          success: true,
          already_registered: true,
          message: `This coach already has access to ${team.name}`,
          team: team.name,
          role,
        });
      }

      const { error: existingMemberInsertError } = await supabase
        .from("team_members")
        .insert({
          team_id: teamId,
          user_id: existingAuthUser.id,
          role,
        });

      if (existingMemberInsertError) {
        console.error(
          "Existing user team member insert failed:",
          existingMemberInsertError
        );
        return jsonResponse(
          { error: "The coach has an account, but could not be added to this team" },
          500
        );
      }

      // An existing account may still be unverified. We do not need to create
      // another Auth user; the coach can finish verification and sign in.
      return jsonResponse({
        success: true,
        already_registered: true,
        email_confirmed: Boolean(existingAuthUser.email_confirmed_at),
        message: existingAuthUser.email_confirmed_at
          ? `Coach added to ${team.name}`
          : `Coach added to ${team.name}. They still need to verify their email before signing in.`,
        team: team.name,
        role,
      });
    }

    const { data: existingInvitation, error: invitationLookupError } =
      await supabase
        .from("team_invitations")
        .select("id")
        .eq("team_id", teamId)
        .eq("email", email)
        .eq("status", "pending")
        .maybeSingle();

    if (invitationLookupError) {
      console.error("Invitation lookup failed:", invitationLookupError);
      return jsonResponse(
        { error: "Unable to check existing invitations" },
        500
      );
    }

    if (existingInvitation) {
      console.log("Removing stale pending invitation before resending:", email);

      const { error: staleInvitationDeleteError } = await supabase
        .from("team_invitations")
        .delete()
        .eq("id", existingInvitation.id);

      if (staleInvitationDeleteError) {
        console.error(
          "Stale invitation delete failed:",
          staleInvitationDeleteError
        );
        return jsonResponse(
          { error: "Unable to resend the invitation" },
          500
        );
      }
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

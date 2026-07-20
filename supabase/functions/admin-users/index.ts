// ===========================================================================
// admin-users — privileged user management (service-role), gated to admins.
// Actions: invite / setRole / setActive / delete. Password reset is NOT here —
// it is anon-safe and runs client-side (supabase.auth.resetPasswordForEmail).
// The service-role key is read from the function env and NEVER leaves the server.
// ===========================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ROLES = ["admin", "staff", "viewer"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json(401, { error: "missing authorization" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Identify caller and require an ACTIVE ADMIN (checked against profiles, not a JWT claim).
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json(401, { error: "invalid token" });
  const callerId = userData.user.id;
  const { data: prof } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", callerId)
    .single();
  if (!prof || prof.role !== "admin" || prof.active === false) {
    return json(403, { error: "admin only" });
  }

  let body: { action?: string; email?: string; userId?: string; role?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }

  try {
    switch (body.action) {
      case "invite": {
        if (!body.email) return json(400, { error: "email required" });
        const { data, error } = await admin.auth.admin.inviteUserByEmail(body.email);
        if (error) throw error;
        const role = ROLES.includes(body.role ?? "") ? body.role : "viewer";
        // The handle_new_user trigger defaults a fresh profile to 'viewer', so a silent failure
        // here lands the invitee on the LEAST-privileged role while the UI says "Invitation
        // sent". Check the error, and treat "matched no rows" as a failure too — the profile
        // row is created by a trigger, so a zero-row update means it wasn't there yet.
        const { data: updated, error: roleErr } = await admin
          .from("profiles").update({ role }).eq("id", data.user.id).select("id");
        if (roleErr) return json(500, { error: `Invited, but the role could not be set: ${roleErr.message}` });
        if (!updated?.length) return json(500, { error: "Invited, but the profile row was not found to set the role." });
        return json(200, { id: data.user.id, email: data.user.email, role });
      }
      case "setRole": {
        if (!body.userId || !ROLES.includes(body.role ?? "")) {
          return json(400, { error: "userId + valid role required" });
        }
        if (body.userId === callerId) return json(400, { error: "cannot change your own role" });
        const { error } = await admin.from("profiles").update({ role: body.role }).eq("id", body.userId);
        if (error) throw error;
        return json(200, { ok: true });
      }
      case "setActive": {
        if (!body.userId || typeof body.active !== "boolean") {
          return json(400, { error: "userId + active required" });
        }
        if (body.userId === callerId) return json(400, { error: "cannot deactivate yourself" });
        const { error } = await admin.from("profiles").update({ active: body.active }).eq("id", body.userId);
        if (error) throw error;
        // Mirror to the auth user so a deactivated account cannot obtain new tokens.
        await admin.auth.admin.updateUserById(body.userId, {
          ban_duration: body.active ? "none" : "87600h",
        });
        return json(200, { ok: true });
      }
      case "delete": {
        if (!body.userId) return json(400, { error: "userId required" });
        if (body.userId === callerId) return json(400, { error: "cannot delete yourself" });
        const { error } = await admin.auth.admin.deleteUser(body.userId);
        if (error) throw error;
        return json(200, { ok: true });
      }
      default:
        return json(400, { error: "unknown action" });
    }
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});

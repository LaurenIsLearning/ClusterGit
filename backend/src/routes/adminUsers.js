import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireAdmin from "../middleware/requireAdmin.js";

const router = express.Router();

router.use(authMiddleware, requireAdmin);

function isValidationError(err) {
  const msg = err?.message ?? "";
  return (
    msg.includes("required") ||
    msg.includes("Invalid") ||
    msg.includes("must be") ||
    msg.includes("No valid fields")
  );
}

function normalizeOptionalString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeOptionalDateTime(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid datetime value");
  }

  return date.toISOString();
}

function validateCreateUserPayload(body) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const display_name = normalizeOptionalString(body.display_name);
  const role = String(body.role ?? "student").trim();
  const storage_quota_bytes = Number(body.storage_quota_bytes ?? 20 * 1024 * 1024 * 1024);
  const storage_used_bytes = Number(body.storage_used_bytes ?? 0);
  const last_active_at = normalizeOptionalDateTime(body.last_active_at);

  if (!email) throw new Error("Email is required");
  if (!password) throw new Error("Password is required");
  if (!["student", "instructor", "admin"].includes(role)) throw new Error("Invalid role");
  if (!Number.isFinite(storage_quota_bytes) || storage_quota_bytes < 0) {
    throw new Error("storage_quota_bytes must be a non-negative number");
  }
  if (!Number.isFinite(storage_used_bytes) || storage_used_bytes < 0) {
    throw new Error("storage_used_bytes must be a non-negative number");
  }

  return {
    email,
    password,
    display_name,
    role,
    storage_quota_bytes: Math.trunc(storage_quota_bytes),
    storage_used_bytes: Math.trunc(storage_used_bytes),
    last_active_at,
  };
}

function validateUpdateUserPayload(body) {
  const updates = {};

  if ("display_name" in body) {
    updates.display_name = normalizeOptionalString(body.display_name);
  }

  if ("role" in body) {
    const role = String(body.role ?? "").trim();
    if (!["student", "instructor", "admin"].includes(role)) {
      throw new Error("Invalid role");
    }
    updates.role = role;
  }

  if ("storage_quota_bytes" in body) {
    const quota = Number(body.storage_quota_bytes);
    if (!Number.isFinite(quota) || quota < 0) {
      throw new Error("storage_quota_bytes must be a non-negative number");
    }
    updates.storage_quota_bytes = Math.trunc(quota);
  }

  if ("storage_used_bytes" in body) {
    const used = Number(body.storage_used_bytes);
    if (!Number.isFinite(used) || used < 0) {
      throw new Error("storage_used_bytes must be a non-negative number");
    }
    updates.storage_used_bytes = Math.trunc(used);
  }

  if ("last_active_at" in body) {
    updates.last_active_at = normalizeOptionalDateTime(body.last_active_at);
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("No valid fields provided for update");
  }

  return updates;
}

async function listAuthUsersById() {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return new Map((data?.users || []).map((user) => [user.id, user]));
}

function formatUserRow(profile, authUser) {
  return {
    user_id: profile.user_id,
    email: authUser?.email || "",
    display_name: profile.display_name,
    role: profile.role,
    storage_quota_bytes: Number(profile.storage_quota_bytes) || 0,
    storage_used_bytes: Number(profile.storage_used_bytes) || 0,
    last_active_at: profile.last_active_at,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    is_admin_created: profile.is_admin_created,
    admin_created_by: profile.admin_created_by,
  };
}

router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select(`
        user_id,
        display_name,
        role,
        storage_quota_bytes,
        storage_used_bytes,
        last_active_at,
        created_at,
        updated_at,
        is_admin_created,
        admin_created_by
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const authUsersById = await listAuthUsersById();
    res.json((data || []).map((profile) => formatUserRow(profile, authUsersById.get(profile.user_id))));
  } catch (err) {
    console.error("GET manage-users failed:", err);
    res.status(500).json({
      error: {
        message: "Failed to fetch users",
        details: err.message || null,
      },
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      email,
      password,
      display_name,
      role,
      storage_quota_bytes,
      storage_used_bytes,
      last_active_at,
    } = validateCreateUserPayload(req.body);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name,
      },
    });

    if (authError) throw authError;

    const userId = authData?.user?.id;
    if (!userId) {
      throw new Error("Auth user was created without a valid id");
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          display_name,
          role,
          storage_quota_bytes,
          storage_used_bytes,
          last_active_at,
          is_admin_created: true,
          admin_created_by: req.user?.id ?? null,
        },
        { onConflict: "user_id" },
      )
      .select(`
        user_id,
        display_name,
        role,
        storage_quota_bytes,
        storage_used_bytes,
        last_active_at,
        created_at,
        updated_at,
        is_admin_created,
        admin_created_by
      `)
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(userId).catch(() => null);
      throw profileError;
    }

    res.status(201).json(formatUserRow(profile, { email }));
  } catch (err) {
    console.error("CREATE manage-user failed:", err);
    const status = isValidationError(err) ? 400 : 500;
    res.status(status).json({
      error: {
        message: status === 400 ? err.message : "Failed to create user",
        details: status === 500 ? err.message || null : null,
        code: err.code || null,
      },
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = validateUpdateUserPayload(req.body);

    const { data, error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("user_id", userId)
      .select(`
        user_id,
        display_name,
        role,
        storage_quota_bytes,
        storage_used_bytes,
        last_active_at,
        created_at,
        updated_at,
        is_admin_created,
        admin_created_by
      `)
      .single();

    if (error) throw error;

    const authUsersById = await listAuthUsersById();
    res.json(formatUserRow(data, authUsersById.get(userId)));
  } catch (err) {
    console.error("UPDATE manage-user failed:", err);
    const status = isValidationError(err) ? 400 : 500;
    res.status(status).json({
      error: {
        message: status === 400 ? err.message : "Failed to update user",
        details: status === 500 ? err.message || null : null,
        code: err.code || null,
      },
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    if (req.user?.id === userId) {
      return res.status(400).json({
        error: { message: "Admins cannot delete their own account." },
      });
    }

    const { data: targetUser, error: targetErr } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (targetErr) throw targetErr;

    if (!targetUser) {
      return res.status(404).json({
        error: { message: "User not found" },
      });
    }

    if (targetUser.role === "admin") {
      const { count, error: countErr } = await supabase
        .from("user_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");

      if (countErr) throw countErr;

      if (count <= 1) {
        return res.status(400).json({
          error: { message: "Cannot delete the last admin." },
        });
      }
    }

    const { data, error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error("DELETE manage-user failed:", err);
    res.status(500).json({
      error: {
        message: "Failed to delete user",
        details: err.message || null,
        code: err.code || null,
      },
    });
  }
});

export default router;

import express from "express";
import { supabase } from "../utils/supabase.js";
import {
  validateCreateUserPayload,
  validateUpdateUserPayload,
} from "../utils/userFieldValidation.js";

const router = express.Router();

function isValidationError(err) {
  const msg = err?.message ?? "";
  return (
    msg.includes("required") ||
    msg.includes("Invalid") ||
    msg.includes("must be") ||
    msg.includes("No valid fields")
  );
}

/* 
GET /api/admin/users
Return all users with profile data
*/
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select(`
        user_id,
        email,
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

    res.json(data ?? []);
  } catch (err) {
    console.error("GET users failed:", err);
    res.status(500).json({
      error: {
        message: "Failed to fetch users",
        details: err.message || null,
      },
    });
  }
});

/*
POST /api/admin/users
Create auth user first, then update the profile row.
This works with the existing auth.users -> trigger -> user_profiles flow.
*/
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

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedDisplayName =
      typeof display_name === "string" ? display_name.trim() : null;

    // 1) Create the auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: normalizedDisplayName,
        },
      });

    if (authError) {
      console.error("CREATE auth user failed:", authError);
      throw authError;
    }

    const createdAuthUser = authData?.user;
    if (!createdAuthUser?.id) {
      throw new Error("Auth user was created without a valid id");
    }

    const userId = createdAuthUser.id;

    // 2) Upsert profile row
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          email: normalizedEmail,
          display_name: normalizedDisplayName,
          role,
          storage_quota_bytes,
          storage_used_bytes,
          last_active_at,
          is_admin_created: true,
          admin_created_by: req.user?.id ?? null,
        },
        { onConflict: "user_id" }
      )
      .select(`
        user_id,
        email,
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
      console.error("UPSERT profile failed:", profileError);

      // Best-effort cleanup so you don't leave a stranded auth user
      const { error: cleanupError } = await supabase.auth.admin.deleteUser(userId);
      if (cleanupError) {
        console.error(
          "Cleanup delete after failed profile upsert also failed:",
          cleanupError
        );
      }

      throw profileError;
    }

    res.status(201).json(profile);
  } catch (err) {
    console.error("CREATE user failed:", err);

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

/*
PATCH /api/admin/users/:id
Update profile attributes
*/
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
        email,
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

    res.json(data);
  } catch (err) {
    console.error("UPDATE user failed:", err);

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

/*
DELETE /api/admin/users/:id
Delete auth user first.
Profile row should cascade because user_profiles.user_id references auth.users(id) ON DELETE CASCADE.
*/
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent self-delete
    if (req.user?.id === userId) {
      return res.status(400).json({
        error: { message: "Admins cannot delete their own account." },
      });
    }

    // Check if target user is an admin
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

    // If deleting an admin, ensure another admin exists
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

    // Perform deletion
    const { data, error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      console.error("DELETE auth user failed:", error);
      throw error;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("DELETE user failed:", err);
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
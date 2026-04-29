import { validatePasswordAuthEmail } from "./authValidation.js";

export const ALLOWED_ROLES = ["student", "instructor", "admin"];
export const DEFAULT_STORAGE_QUOTA_BYTES = 21474836480;

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

export function validateCreateUserPayload(body) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const display_name = normalizeOptionalString(body.display_name);
  const role = String(body.role ?? "student").trim();
  const storage_quota_bytes = Number(
    body.storage_quota_bytes ?? DEFAULT_STORAGE_QUOTA_BYTES
  );
  const storage_used_bytes = Number(body.storage_used_bytes ?? 0);
  const last_active_at = normalizeOptionalDateTime(body.last_active_at);

  if (!email) throw new Error("Email is required");
  if (!password) throw new Error("Password is required");
  const emailError = validatePasswordAuthEmail(email);
  if (emailError) throw new Error(emailError);
  if (password.length < 6) throw new Error("Password must be at least 6 characters");

  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error("Invalid role");
  }

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

export function validateUpdateUserPayload(body) {
  const updates = {};

  if ("email" in body) {
    const normalizedEmail = normalizeOptionalString(body.email)?.toLowerCase() ?? null;
    if (normalizedEmail) {
      const emailError = validatePasswordAuthEmail(normalizedEmail);
      if (emailError) throw new Error(emailError);
    }
    updates.email = normalizedEmail;
  }

  if ("display_name" in body) {
    updates.display_name = normalizeOptionalString(body.display_name);
  }

  if ("role" in body) {
    const role = String(body.role ?? "").trim();
    if (!ALLOWED_ROLES.includes(role)) {
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

import { supabase } from "./supabaseClient";
import { getApiBaseUrl } from "../utils/api";
import { normalizeEmail, validatePasswordAuthEmail } from "../utils/authValidation";

const rawApiUrl = getApiBaseUrl();
const normalizedApiUrl = rawApiUrl.replace(/\/+$/, '');
const API_BASE_URL = normalizedApiUrl.endsWith('/api')
  ? normalizedApiUrl
  : `${normalizedApiUrl}/api`;

async function getAccessToken() {
  // grabs the current supabase jwt for backend-authenticated routes
  const session = await waitForSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

async function waitForSession({ timeoutMs = 8000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const session = data?.session ?? null;
    if (session?.access_token) {
      return session;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

async function safeParseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function isMissingRoute(response, data) {
  const raw = String(data?._raw || "");
  return response.status === 404 || raw.includes("Cannot GET");
}

export const authService = {
  async signUp(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const emailError = validatePasswordAuthEmail(normalizedEmail);
    if (emailError) throw new Error(emailError);

    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: normalizedEmail, password, role: "student" }),
    });

    const data = await safeParseJson(response);
    if (!response.ok) {
      throw new Error(data.error?.message || data._raw || "Registration failed");
    }

    return data;
  },

  async signIn(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const emailError = validatePasswordAuthEmail(normalizedEmail);
    if (emailError) throw new Error(emailError);

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });

    const data = await safeParseJson(response);
    if (!response.ok) {
      throw new Error(data.error?.message || data._raw || "Authentication failed");
    }

    const session = data?.session;
    if (!session?.access_token || !session?.refresh_token) {
      throw new Error("Login succeeded but no session was returned");
    }

    const { data: sessionData, error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    if (error) throw error;
    return sessionData;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    return waitForSession();
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  },

  async signInWithGitHub(redirectTo) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) throw error;
    return data;
  },

  async getProfile() {
    // prefers the backend profile route but can fall back to direct supabase reads in older deployments
    const token = await getAccessToken();
    let response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    let data = await safeParseJson(response);

    if (!response.ok && isMissingRoute(response, data)) {
      // Backward-compatible fallback: read directly from Supabase user_profiles.
      const session = await this.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("display_name, role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      return {
        user_id: user.id,
        email: user.email,
        display_name: profile?.display_name || null,
        role: profile?.role || null,
      };
    }

    if (!response.ok) {
      throw new Error(data.error?.message || data._raw || "Failed to load profile");
    }
    return data;
  },

  async updateDisplayName(displayName) {
    // updates profile through the backend first and falls back to direct supabase upsert if needed
    const token = await getAccessToken();
    let response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ display_name: displayName }),
    });

    let data = await safeParseJson(response);

    if (!response.ok && isMissingRoute(response, data)) {
      // Backward-compatible fallback: write directly to user_profiles.
      const session = await this.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      const resolvedRole = existing?.role || "student";

      const { data: updated, error } = await supabase
        .from("user_profiles")
        .upsert(
          {
            user_id: user.id,
            display_name: displayName,
            role: resolvedRole,
          },
          { onConflict: "user_id" }
        )
        .select("display_name, role")
        .single();

      if (error) throw error;

      return {
        user_id: user.id,
        email: user.email,
        display_name: updated?.display_name || displayName,
        role: updated?.role || resolvedRole,
      };
    }

    if (!response.ok) {
      throw new Error(data.error?.message || data._raw || "Failed to update display name");
    }
    return data;
  },

  async updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data;
  },
};


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

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      throw new Error(error.message || "Authentication failed");
    }

    if (!data?.session?.access_token) {
      throw new Error("Login succeeded but no session was returned");
    }

    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut({ scope: "local" });
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
    // keep profile lookups on the backend path so the browser does not read RLS-protected tables directly
    const token = await getAccessToken();
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(data.error?.message || data._raw || "Failed to load profile");
    }
    return data;
  },

  async updateDisplayName(displayName) {
    // keep profile writes on the backend path so the browser does not write RLS-protected tables directly
    const token = await getAccessToken();
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ display_name: displayName }),
    });

    const data = await safeParseJson(response);

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


import { supabase } from "./supabaseClient";

const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const normalizedApiUrl = rawApiUrl.replace(/\/+$/, '');
const API_BASE_URL = normalizedApiUrl.endsWith('/api')
  ? normalizedApiUrl
  : `${normalizedApiUrl}/api`;

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
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
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data?.session ?? null;
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


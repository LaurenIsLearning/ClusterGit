import { supabase } from "./supabaseClient";

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
};


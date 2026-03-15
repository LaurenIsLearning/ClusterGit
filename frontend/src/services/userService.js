// src/services/userService.js
import { supabase } from "./supabaseClient";
import { getApiBaseUrl } from "../utils/api";

const API_BASE = getApiBaseUrl();

async function getAuthHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data?.session?.access_token;
  if (!token) throw new Error("No auth session found");

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || "Request failed");
  }
  return data;
}

export const userService = {
  async listUsers() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/admin/users`, {
      method: "GET",
      headers,
    });
    return parseJson(response);
  },

  async createUser(payload) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return parseJson(response);
  },

  async updateUser(userId, updates) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(updates),
    });
    return parseJson(response);
  },

  async deleteUser(userId) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
      method: "DELETE",
      headers,
    });
    return parseJson(response);
  },
};
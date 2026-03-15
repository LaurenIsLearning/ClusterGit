import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Search,
  HelpCircle,
  Pencil,
  Trash2,
  Plus,
  X,
} from "lucide-react";
import ConfirmationModal from "../../components/ConfirmationModal";
import { useToast } from "../../context/ToastContext";
import { userService } from "../../services/userService";

const emptyForm = {
  email: "",
  password: "",
  display_name: "",
  role: "student",
  storage_quota_bytes: 21474836480, // 20 GB
  storage_used_bytes: 0,
  last_active_at: "",
};

function formatBytes(bytes) {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value < 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString();
}

export default function AdminUsers() {
  const { addToast } = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [search, setSearch] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setPageError("");

    try {
      const data = await userService.listUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("[AdminUsers] loadUsers error:", error);
      setPageError(error.message || "Failed to load users");
      addToast(error.message || "Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;

    return users.filter((user) => {
      const displayName = String(user.display_name ?? "").toLowerCase();
      const email = String(user.email ?? "").toLowerCase();
      const role = String(user.role ?? "").toLowerCase();
      const userId = String(user.user_id ?? "").toLowerCase();

      return (
        displayName.includes(q) ||
        email.includes(q) ||
        role.includes(q) ||
        userId.includes(q)
      );
    });
  }, [users, search]);

  function openCreateForm() {
    setEditingUser(null);
    setFormData(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(user) {
    setEditingUser(user);
    setFormData({
      email: user.email ?? "",
      password: "",
      display_name: user.display_name ?? "",
      role: user.role ?? "student",
      storage_quota_bytes: Number(user.storage_quota_bytes ?? 21474836480),
      storage_used_bytes: Number(user.storage_used_bytes ?? 0),
      last_active_at: user.last_active_at
        ? new Date(user.last_active_at).toISOString().slice(0, 16)
        : "",
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingUser(null);
    setFormData(emptyForm);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "storage_quota_bytes" || name === "storage_used_bytes"
          ? value === ""
            ? ""
            : Number(value)
          : value,
    }));
  }

  async function handleSaveUser(e) {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingUser) {
        const updates = {
          display_name: formData.display_name.trim() || null,
          role: formData.role,
          storage_quota_bytes: Number(formData.storage_quota_bytes || 0),
          storage_used_bytes: Number(formData.storage_used_bytes || 0),
          last_active_at: formData.last_active_at || null,
        };

        await userService.updateUser(editingUser.user_id, updates);
        addToast("User updated successfully.", "success");
      } else {
        if (!formData.email.trim()) {
          throw new Error("Email is required");
        }
        if (!formData.password.trim()) {
          throw new Error("Password is required");
        }

        const payload = {
          email: formData.email.trim(),
          password: formData.password,
          display_name: formData.display_name.trim() || null,
          role: formData.role,
          storage_quota_bytes: Number(formData.storage_quota_bytes || 0),
          storage_used_bytes: Number(formData.storage_used_bytes || 0),
          last_active_at: formData.last_active_at || null,
        };

        await userService.createUser(payload);
        addToast("User created successfully.", "success");
      }

      closeForm();
      await loadUsers();
    } catch (error) {
      console.error("[AdminUsers] handleSaveUser error:", error);
      addToast(error.message || "Failed to save user", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClick(user) {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  }

  async function handleConfirmDelete() {
    if (!selectedUser) return;

    setDeleting(true);
    try {
      await userService.deleteUser(selectedUser.user_id);
      addToast(`Deleted ${selectedUser.display_name || selectedUser.email || "user"}`, "success");
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      await loadUsers();
    } catch (error) {
      console.error("[AdminUsers] delete error:", error);
      addToast(error.message || "Failed to delete user", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <h1 className="text-3xl font-bold">User Management</h1>
        <button className="btn btn-primary flex items-center gap-2" onClick={openCreateForm}>
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {isFormOpen && (
        <div className="card p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">
              {editingUser ? "Edit User" : "Create User"}
            </h2>
            <button
              type="button"
              onClick={closeForm}
              className="text-[--text-secondary] hover:text-[--text-primary]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!editingUser && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 rounded-md bg-[--bg-primary] border border-[--border-color]"
                    placeholder="student@university.edu"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Temporary Password</label>
                  <input
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 rounded-md bg-[--bg-primary] border border-[--border-color]"
                    placeholder="At least 6 characters"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Display Name</label>
              <input
                name="display_name"
                value={formData.display_name}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-md bg-[--bg-primary] border border-[--border-color]"
                placeholder="Student Name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Role</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-md bg-[--bg-primary] border border-[--border-color]"
              >
                <option value="student">student</option>
                <option value="instructor">instructor</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Storage Quota (bytes)</label>
              <input
                name="storage_quota_bytes"
                type="number"
                min="0"
                value={formData.storage_quota_bytes}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-md bg-[--bg-primary] border border-[--border-color]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Storage Used (bytes)</label>
              <input
                name="storage_used_bytes"
                type="number"
                min="0"
                value={formData.storage_used_bytes}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-md bg-[--bg-primary] border border-[--border-color]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Last Active</label>
              <input
                name="last_active_at"
                type="datetime-local"
                value={formData.last_active_at}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-md bg-[--bg-primary] border border-[--border-color]"
              />
            </div>

            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : editingUser ? "Update User" : "Create User"}
              </button>
              <button type="button" className="btn" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-[--border-color] flex justify-between items-center bg-[--bg-secondary] gap-4 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--text-muted]" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-md bg-[--bg-primary] border border-[--border-color] text-sm focus:outline-none focus:border-[--accent-primary]"
            />
          </div>

          <div className="flex gap-2">
            <span
              className="text-sm text-[--text-secondary] flex items-center gap-1"
              title="Total users shown"
            >
              <Users className="w-4 h-4" /> {filteredUsers.length} Users
            </span>
          </div>
        </div>

        {pageError && (
          <div className="p-4 text-sm text-red-400 border-b border-[--border-color]">
            {pageError}
          </div>
        )}

        {loading ? (
          <div className="p-6 text-sm text-[--text-secondary]">Loading users...</div>
        ) : (
          <table className="w-full text-left">
            <thead className="text-xs uppercase text-[--text-muted] bg-[--bg-tertiary]">
              <tr>
                <th className="px-6 py-3">User</th>
                <th
                  className="px-6 py-3 flex items-center gap-1 group cursor-help"
                  title="Storage used compared to assigned quota"
                >
                  Storage
                  <HelpCircle className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                </th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Last Active</th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[--border-color]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-sm text-[--text-secondary]">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const used = Number(user.storage_used_bytes ?? 0);
                  const quota = Number(user.storage_quota_bytes ?? 0);
                  const usagePct = quota > 0 ? Math.min((used / quota) * 100, 100) : 0;

                  return (
                    <tr key={user.user_id} className="hover:bg-[--bg-tertiary]/20">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-xs">
                            {(user.display_name || user.email || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {user.display_name || "Unnamed User"}
                            </p>
                            <p className="text-xs text-[--text-secondary]">
                              {user.email || "No email"}
                            </p>
                            <p className="text-xs text-[--text-muted]">{user.user_id}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="w-48">
                          <div className="flex justify-between text-xs mb-1">
                            <span>{formatBytes(used)}</span>
                            <span className="text-[--text-muted]">
                              of {formatBytes(quota)}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-[--bg-primary] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                quota > 0 && used / quota > 0.9
                                  ? "bg-[--status-error]"
                                  : "bg-[--accent-primary]"
                              }`}
                              style={{ width: `${usagePct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm">{user.role || "unknown"}</td>

                      <td className="px-6 py-4 text-sm text-[--text-secondary]">
                        {formatDate(user.last_active_at)}
                      </td>

                      <td className="px-6 py-4 text-sm text-[--text-secondary]">
                        {formatDate(user.created_at)}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => openEditForm(user)}
                            className="text-sm hover:underline inline-flex items-center gap-1"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </button>

                          <button
                            onClick={() => handleDeleteClick(user)}
                            className="text-[--status-error] text-sm hover:underline hover:text-red-400 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!deleting) {
            setIsDeleteModalOpen(false);
            setSelectedUser(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title="Delete User?"
        message={`Are you sure you want to delete ${
          selectedUser?.display_name || selectedUser?.email || "this user"
        }?`}
        confirmText={deleting ? "Deleting..." : "Delete User"}
        confirmStyle="danger"
      />
    </div>
  );
}
import { useAuth } from "../context/AuthContext";

export default function Settings() {
  const { user, role, loading } = useAuth();

  if (loading) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-[--text-secondary]">Manage your profile and git credentials.</p>
      </div>

      <div className="rounded-2xl border border-[--border-color] bg-[--bg-secondary] p-6">
        <h2 className="text-xl font-semibold mb-4">Profile Information</h2>

        <div className="grid gap-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium mb-2">Email Address</label>
            <input
              value={user?.email ?? ""}
              readOnly
              className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Role</label>
            <input
              value={role ?? "unknown"}
              readOnly
              className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}


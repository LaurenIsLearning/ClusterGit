import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/authService";

export default function Settings() {
  const { user, role, loading } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      setProfileLoading(true);
      setProfileMessage("");
      try {
        const profile = await authService.getProfile();
        setDisplayName(profile?.display_name || "");
      } catch (error) {
        setProfileMessage(error.message || "Failed to load profile");
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const onSaveDisplayName = async (e) => {
    e.preventDefault();
    setProfileMessage("");

    const trimmed = displayName.trim();
    if (!trimmed) {
      setProfileMessage("Display name cannot be empty");
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await authService.updateDisplayName(trimmed);
      setDisplayName(updated?.display_name || trimmed);
      setProfileMessage("Display name updated");
    } catch (error) {
      setProfileMessage(error.message || "Failed to update display name");
    } finally {
      setProfileSaving(false);
    }
  };

  const onChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage("");

    if (!newPassword || newPassword.length < 6) {
      setPasswordMessage("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match");
      return;
    }

    setPasswordSaving(true);
    try {
      await authService.updatePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated");
    } catch (error) {
      setPasswordMessage(error.message || "Failed to update password");
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-[--text-secondary]">Manage your profile and git credentials.</p>
      </div>

      <div className="rounded-2xl border border-[--border-color] bg-[--bg-secondary] p-6">
        <h2 className="text-xl font-semibold mb-4">Profile Information</h2>

        <form className="grid gap-4 max-w-xl" onSubmit={onSaveDisplayName}>
          <div>
            <label className="block text-sm font-medium mb-2">Email Address</label>
            <input
              value={user?.email ?? ""}
              readOnly
              className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={profileLoading || profileSaving}
              className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]"
              placeholder="Enter display name"
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

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={profileLoading || profileSaving}
              className="btn btn-primary"
            >
              {profileSaving ? "Saving..." : "Save Display Name"}
            </button>
            {profileMessage && (
              <span className="text-sm text-[--text-secondary]">{profileMessage}</span>
            )}
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-[--border-color] bg-[--bg-secondary] p-6">
        <h2 className="text-xl font-semibold mb-4">Password</h2>
        <form className="grid gap-4 max-w-xl" onSubmit={onChangePassword}>
          <div>
            <label className="block text-sm font-medium mb-2">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary]"
              placeholder="Confirm new password"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={passwordSaving}
              className="btn btn-secondary"
            >
              {passwordSaving ? "Updating..." : "Update Password"}
            </button>
            {passwordMessage && (
              <span className="text-sm text-[--text-secondary]">{passwordMessage}</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}


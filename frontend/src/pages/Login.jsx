// src/pages/Login.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Mail, Lock, AlertCircle } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { validatePasswordAuthEmail } from "../utils/authValidation";

export default function Login() {
  const { signIn, signUp, signInWithGitHub, user, role } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  // Local-only submit state. This is the important fix.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stuck, setStuck] = useState(false);

  // Route users after auth once role has resolved.
  useEffect(() => {
    if (!user) return;
    if (role === null) return;
    navigate(role === "admin" ? "/admin" : "/dashboard", { replace: true });
  }, [user, role, navigate]);

  const validate = () => {
    const emailError = validatePasswordAuthEmail(email);
    if (emailError) return emailError;
    if (!password) return "Please fill in all fields";
    if (password.length < 6) return "Password must be at least 6 characters";
    if (isRegisterMode && password !== confirmPassword) return "Passwords do not match";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setIsSubmitting(true);
    setStuck(false);

    // Watchdog: if a request hangs, the UI doesn't pretend forever.
    const watchdog = window.setTimeout(() => setStuck(true), 12000);

    try {
      if (isRegisterMode) {
        await signUp(email, password);
        addToast("Account created successfully! Welcome to ClusterGit.", "success");
      } else {
        await signIn(email, password);
        addToast("Welcome back!", "success");
      }
    } catch (e2) {
      setError(e2?.message ?? "Authentication failed");
    } finally {
      window.clearTimeout(watchdog);
      setIsSubmitting(false);
    }
  };

  const handleGitHub = async () => {
    setError("");
    setIsSubmitting(true);
    setStuck(false);

    const watchdog = window.setTimeout(() => setStuck(true), 12000);

    try {
      // Return to /login and let role-aware routing above navigate in-app.
      // This avoids direct hard reloads to nested SPA paths in preview/prod.
      await signInWithGitHub(`${window.location.origin}/login`);
    } catch (e) {
      setError(e?.message ?? "GitHub login failed");
      setIsSubmitting(false);
    } finally {
      window.clearTimeout(watchdog);
    }
  };

  const disableUI = isSubmitting;

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[--border-color] bg-[--bg-secondary] p-8">
          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <div className="h-16 w-16 rounded-2xl bg-[--bg-tertiary] flex items-center justify-center">
              <User className="h-8 w-8 text-[--accent-primary]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">
                {isRegisterMode ? "Create Account" : "Student Login"}
              </h2>
              <p className="text-[--text-secondary]">
                {isRegisterMode
                  ? "Sign up to access your ClusterGit portal"
                  : "Sign in to access your projects and repositories"}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[--text-muted]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@university.edu"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary] focus:outline-none focus:ring-2 focus:ring-[--accent-primary]"
                  disabled={disableUI}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[--text-muted]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary] focus:outline-none focus:ring-2 focus:ring-[--accent-primary]"
                  disabled={disableUI}
                  autoComplete={isRegisterMode ? "new-password" : "current-password"}
                />
              </div>
              {isRegisterMode && (
                <p className="text-xs text-[--text-muted] mt-1">Use your school email and a password with at least 6 characters</p>
              )}
            </div>

            {isRegisterMode && (
              <div>
                <label className="block text-sm font-medium mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[--text-muted]" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[--border-color] bg-[--bg-tertiary] focus:outline-none focus:ring-2 focus:ring-[--accent-primary]"
                    disabled={disableUI}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}

            <button type="submit" disabled={disableUI} className="btn btn-primary w-full">
              {isSubmitting ? "Processing..." : isRegisterMode ? "Create Account" : "Sign In"}
            </button>

            <button
              type="button"
              onClick={handleGitHub}
              disabled={disableUI}
              className="btn w-full border border-[--border-color] bg-[--bg-tertiary] hover:bg-[--bg-secondary]"
            >
              Continue with GitHub
            </button>

            {stuck && (
              <div className="text-sm text-[--text-secondary] pt-2">
                This is taking longer than expected. If it stays stuck, reload the page.
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="ml-2 text-[--accent-primary] hover:underline"
                >
                  Reload
                </button>
              </div>
            )}
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                if (disableUI) return;
                setIsRegisterMode(!isRegisterMode);
                setError("");
                setEmail("");
                setPassword("");
                setConfirmPassword("");
              }}
              className="text-sm text-[--accent-primary] hover:underline"
              disabled={disableUI}
            >
              {isRegisterMode ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

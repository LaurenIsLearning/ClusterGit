import { Routes, Route, Navigate } from "react-router-dom";
import PublicLayout from "./layouts/PublicLayout";
import DashboardLayout from "./layouts/DashboardLayout";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import SupabaseSmokeTest from "./pages/SupabaseSmokeTest";

import StudentDashboard from "./pages/Student/Dashboard";
import StudentProjects from "./pages/Student/Projects";
import StudentSettings from "./pages/Student/Settings";

import AdminDashboard from "./pages/Admin/Dashboard";
import AdminNodes from "./pages/Admin/Nodes";
import AdminUsers from "./pages/Admin/Users";

import { useAuth } from "./context/AuthContext";
import AdminGuard from "./components/AdminGuard";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null; // or spinner
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/__supabase_test" element={<SupabaseSmokeTest />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {/* Student */}
        <Route path="/dashboard" element={<StudentDashboard />} />
        <Route path="/projects" element={<StudentProjects />} />
        <Route path="/settings" element={<StudentSettings />} />

        {/* Admin (guarded) */}
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/nodes"
          element={
            <AdminGuard>
              <AdminNodes />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminGuard>
              <AdminUsers />
            </AdminGuard>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}



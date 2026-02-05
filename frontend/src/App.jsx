import SupabaseSmokeTest from "./pages/SupabaseSmokeTest";

export default function App() {
  return <SupabaseSmokeTest />;
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';
import PublicLayout from './layouts/PublicLayout';
import DashboardLayout from './layouts/DashboardLayout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import StudentDashboard from './pages/Student/Dashboard';
import StudentProjects from './pages/Student/Projects';
import AdminDashboard from './pages/Admin/Dashboard';
import AdminNodes from './pages/Admin/Nodes';
import AdminUsers from './pages/Admin/Users';
import StudentSettings from './pages/Student/Settings';
import NotFound from './pages/NotFound';

const Placeholder = ({ title }) => (
  <div className="p-8 text-center text-[--text-secondary]">
    <h2 className="text-2xl font-bold mb-4">{title}</h2>
    <p>This functionality is coming soon.</p>
  </div>
);

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { user, isLoading } = useApp();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[--accent-primary] mx-auto mb-4"></div>
          <p className="text-[--text-secondary]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
      </Route>

      {/* Authenticated Dashboard Routes */}
      <Route element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<StudentDashboard />} />
        <Route path="/projects" element={<StudentProjects />} />
        <Route path="/settings" element={<StudentSettings />} />

        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/nodes" element={<AdminNodes />} />
        <Route path="/admin/users" element={<AdminUsers />} />
      </Route>

      {/* Fallback - 404 Page */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;


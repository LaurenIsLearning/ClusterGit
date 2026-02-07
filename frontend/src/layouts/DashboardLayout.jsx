import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  FolderGit2,
  Settings,
  Server,
  Users,
  LogOut,
  Database
} from 'lucide-react';

export default function DashboardLayout() {
  const { user, logout } = useApp();
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  // Guards: don't render dashboard shell until we know auth state
  if (loading) return null;             // or a spinner component
  if (!user) return null;               // or navigate('/') in an effect, but null is safe

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const NavItem = ({ to, icon: Icon, label }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
          isActive
            ? 'bg-[--accent-primary] text-white'
            : 'text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--bg-tertiary]'
        }`
      }
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </NavLink>
  );

  // Only show admin UI when role explicitly says admin/faculty/instructor
  const isStudent = role === 'student';
  const isPrivileged = role === 'admin' || role === 'faculty' || role === 'instructor';

  return (
    <div className="flex min-h-screen bg-[--bg-primary]">
      <aside className="fixed left-0 top-0 h-screen w-64 bg-[--bg-secondary] border-r border-[--border-color] flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-[--border-color]">
          <Database className="w-6 h-6 text-[--accent-primary] mr-2" />
          <span className="font-bold text-lg">ClusterGit</span>
          <span className="ml-2 px-2 py-0.5 rounded text-xs bg-[--bg-tertiary] text-[--text-muted] uppercase">
            {role ?? 'unknown'}
          </span>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
          {isStudent && (
            <>
              <NavItem to="/dashboard" icon={LayoutDashboard} label="Overview" />
              <NavItem to="/projects" icon={FolderGit2} label="Projects" />
              <NavItem to="/settings" icon={Settings} label="Settings" />
            </>
          )}

          {isPrivileged && (
            <>
              <NavItem to="/admin" icon={LayoutDashboard} label="Cluster Health" />
              <NavItem to="/admin/nodes" icon={Server} label="Nodes" />
              <NavItem to="/admin/users" icon={Users} label="User Allocations" />
            </>
          )}

          {/* If role is missing/unknown, show nothing (safer than showing admin UI) */}
        </nav>

        <div className="p-4 border-t border-[--border-color]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-md text-[--text-muted] hover:text-[--status-error] hover:bg-[--bg-tertiary] transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  FolderGit2,
  Settings,
  Server,
  Users,
  LogOut,
  Database,
} from "lucide-react";

export default function DashboardLayout() {
  const { role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const NavItem = ({ to, icon: Icon, label }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 ${
          isActive
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-slate-600 hover:text-emerald-600 hover:bg-emerald-50"
        }`
      }
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </NavLink>
  );

  // function AuthDebug() {
  //   const { user, role, loading, authError } = useAuth();
  //   return (
  //       <pre style={{ fontSize: 12, opacity: 0.7, padding: 8 }}>
  //       {JSON.stringify(
  //           { hasUser: !!user, userId: user?.id, role, loading, authError },
  //           null,
  //           2
  //       )}
  //       </pre>
  //   );
  // }

  return (
    <div className="flex min-h-screen bg-[--bg-primary]">
      <aside className="fixed left-0 top-0 h-screen w-64 bg-[--bg-secondary] border-r border-[--border-color] flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-[--border-color]">
          <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
            <Database className="w-6 h-6 text-emerald-600 mr-2" />
            <span className="font-bold text-lg">ClusterGit</span>
          </Link>

          <span className="ml-auto px-2 py-0.5 rounded text-xs bg-[--bg-tertiary] text-[--text-muted] uppercase">
            {role ?? "unknown"}
          </span>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
          {role === "student" ? (
            <>
              <NavItem to="/dashboard" icon={LayoutDashboard} label="Overview" />
              <NavItem to="/projects" icon={FolderGit2} label="Projects" />
              <NavItem to="/settings" icon={Settings} label="Settings" />
            </>
          ) : role === "admin" ? (
            <>
              <NavItem to="/admin" icon={LayoutDashboard} label="Cluster Health" />
              <NavItem to="/admin/nodes" icon={Server} label="Nodes" />
              <NavItem to="/admin/users" icon={Users} label="Users" />
              <NavItem to="/admin/settings" icon={Settings} label="Settings" />
            </>
          ) : null}
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
          {/* <AuthDebug /> */}
          <Outlet />
        </div>
      </main>
    </div>
  );
}

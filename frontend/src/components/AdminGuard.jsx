import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminGuard({ children }) {
  const { user, role } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role === null) {
    return <div>Checking permissions...</div>;
  }

  if (role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

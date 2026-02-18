import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminGuard({ children }) {
  const { role, loading } = useAuth();

  if (loading) return null; // or spinner

  if (role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

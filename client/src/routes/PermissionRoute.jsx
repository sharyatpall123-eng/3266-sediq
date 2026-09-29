import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { can } from "../utils/permissions";

export default function PermissionRoute({ permission, children }) {
  const { profile } = useAuth();
  return can(profile, permission) ? children : <Navigate to="/" replace />;
}

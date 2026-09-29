import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace state={{ from: location }} />;
}

import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../features/auth/useAuth";
import { UserRole } from "../types/auth";

type ProtectedRouteProps = {
  children: JSX.Element;
  allowedRoles?: UserRole[];
};

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="page-state">Carregando sessão...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user?.must_change_password && location.pathname !== "/trocar-senha") {
    return <Navigate to="/trocar-senha" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <div className="page-state">Acesso negado para este perfil.</div>;
  }

  return children;
}

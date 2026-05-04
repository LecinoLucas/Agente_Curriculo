import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";

import { useAuth } from "../features/auth/useAuth";
import { UserRole } from "../types/auth";

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: UserRole[];
  redirectTo?: string;
};

function LoadingState() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">
      Carregando sessão...
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-sm text-red-500">
      <span>Acesso negado</span>
      <span className="text-gray-400 text-xs">
        Você não tem permissão para acessar esta página
      </span>
    </div>
  );
}

export function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = "/login",
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // 🔄 loading
  if (isLoading) {
    return <LoadingState />;
  }

  // 🚪 não autenticado
  if (!isAuthenticated || !user) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // 🔐 força troca de senha
  if (
    user.must_change_password &&
    location.pathname !== "/trocar-senha"
  ) {
    return <Navigate to="/trocar-senha" replace />;
  }

  // 🚫 role inválida
  if (
    allowedRoles &&
    !allowedRoles.includes(user.role)
  ) {
    // você pode trocar por redirect se quiser:
    // return <Navigate to="/" replace />
    return <AccessDenied />;
  }

  return <>{children}</>;
}
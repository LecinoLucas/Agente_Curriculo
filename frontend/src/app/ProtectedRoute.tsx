import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";

import { useAuth } from "../features/auth/useAuth";
import { isAdmin } from "../shared/auth/roles";
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

  // 🚫 check dinâmico de telas configurado pelo administrador
  let storedScreens = null;
  try {
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      storedScreens = window.localStorage.getItem("app_screens_config");
    }
  } catch (e) {
    console.error("Erro ao acessar localStorage no ProtectedRoute:", e);
  }

  if (storedScreens && user) {
    try {
      const screens = JSON.parse(storedScreens);
      const currentPath = location.pathname;
      
      const matchedScreen = screens.find((s: any) => {
        if (s.path === "/") return currentPath === "/";
        // Verifica igualdade perfeita, sub-rotas ou match de prefixo base
        return (
          currentPath === s.path ||
          currentPath.startsWith(s.path + "/") ||
          (s.path !== "/" && currentPath.split("/")[1] === s.path.split("/")[1])
        );
      });

      if (matchedScreen) {
        // Administrador sempre tem bypass global para evitar auto-bloqueio acidental
        if (isAdmin(user.role)) {
          // Permite acesso
        } else if (!matchedScreen.roles.includes(user.role)) {
          return <AccessDenied />;
        }
      }
    } catch (e) {
      console.error("Erro ao analisar permissões dinâmicas no ProtectedRoute:", e);
    }
  }

  // 🚫 role inválida (fallback estático)
  if (
    allowedRoles &&
    !allowedRoles.includes(user.role)
  ) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

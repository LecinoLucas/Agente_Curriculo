import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { AppRouter } from "./app/AppRouter";
import { GoogleCalendarOAuthBridge } from "./app/GoogleCalendarOAuthBridge";
import { AuthProvider } from "./features/auth/AuthContext";
import { NotificationsProvider } from "./features/notifications/NotificationsContext";
import { ToastContainer } from "./components/common/ToastContainer";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { VisualThemeProvider } from "./hooks/useVisualTheme";
import { initializeVisualTheme } from "./hooks/visualThemeStorage";
import "./styles/index.css";

initializeVisualTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <VisualThemeProvider>
          <NotificationsProvider>
            <ErrorBoundary>
              <GoogleCalendarOAuthBridge />
              <AppRouter />
            </ErrorBoundary>
          </NotificationsProvider>
        </VisualThemeProvider>
      </AuthProvider>
      <ToastContainer />
    </BrowserRouter>
  </React.StrictMode>,
);

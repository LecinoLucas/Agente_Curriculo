import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { AppRouter } from "./app/AppRouter";
import { AuthProvider } from "./features/auth/AuthContext";
import { ToastContainer } from "./components/common/ToastContainer";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { initializeVisualTheme } from "./hooks/useVisualTheme";
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
        <ErrorBoundary>
          <AppRouter />
        </ErrorBoundary>
      </AuthProvider>
      <ToastContainer />
    </BrowserRouter>
  </React.StrictMode>,
);

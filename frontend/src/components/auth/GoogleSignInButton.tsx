import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  initializeGoogleIdentity,
  isGoogleOriginError,
  loadGoogleScript,
  renderGoogleButton,
  setCredentialHandler,
} from "../../services/googleIdentityService";

function maskGoogleClientId(clientId: string): string {
  if (!clientId) return "não definido";
  const [prefix] = clientId.split(".");
  if (!prefix) return clientId;
  return `${prefix.slice(0, 12)}...${prefix.slice(-8)}.apps.googleusercontent.com`;
}

function buildGoogleOriginMessage(clientId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "origem desconhecida";
  return [
    "Google OAuth não autorizado para esta origem.",
    `Origem atual: ${origin}.`,
    `Client ID em uso: ${maskGoogleClientId(clientId)}.`,
    "No Google Cloud, esse mesmo OAuth Client precisa ser do tipo Web application e conter essa origem em Authorized JavaScript origins.",
  ].join(" ");
}

type GoogleSignInButtonProps = {
  disabled?: boolean;
  onCredential: (idToken: string) => void | Promise<void>;
  onError?: (message: string) => void;
  width?: number;
};

function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
}

export function GoogleSignInButton({ disabled = false, onCredential, onError, width = 400 }: GoogleSignInButtonProps) {
  const clientId = getGoogleClientId();
  // Container where Google Identity Services renders its OFFICIAL button.
  // We do NOT use a hidden proxy + .click() any more — that pattern fails
  // silently on the GIS shadow-DOM iframe and the credential callback is
  // never invoked. Rendering the real GIS button visibly is the supported path.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(clientId));
  const [renderedWidth, setRenderedWidth] = useState(width);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Automeasure parent element width on mount to scale the Google iframe button perfectly
  useEffect(() => {
    if (containerRef.current) {
      const parentWidth = containerRef.current.parentElement?.clientWidth;
      if (parentWidth && parentWidth > 0) {
        // Clamp official button width between GIS API limits (200px - 400px)
        const clamped = Math.max(200, Math.min(400, Math.floor(parentWidth)));
        setRenderedWidth(clamped);
      }
    }
  }, [width]);

  useEffect(() => {
    let cancelled = false;

    if (!clientId) {
      setIsLoading(false);
      setIsReady(false);
      return;
    }

    const handleGoogleError = (event: ErrorEvent) => {
      const message = event.message || event.error?.message || "";
      if (!isGoogleOriginError(message)) return;
      const originMessage = buildGoogleOriginMessage(clientId);
      // eslint-disable-next-line no-console
      console.error(originMessage);
      onErrorRef.current?.(originMessage);
    };

    setIsLoading(true);
    window.addEventListener("error", handleGoogleError);

    // Register the credential callback BEFORE rendering the button so the
    // very first user click is always handled.
    setCredentialHandler((response) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[google] credential received", {
          hasCredential: Boolean(response.credential),
        });
      }
      if (!response.credential) {
        onErrorRef.current?.("Não foi possível iniciar o login com Google.");
        return;
      }
      void onCredentialRef.current(response.credential);
    });

    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !containerRef.current) {
          return;
        }
        try {
          initializeGoogleIdentity(clientId);
          renderGoogleButton(containerRef.current, {
            theme: "outline",
            size: "large",
            text: "signin_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: renderedWidth,
          });
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug("[google] button rendered", { width: renderedWidth });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (isGoogleOriginError(message)) {
            const originMessage = buildGoogleOriginMessage(clientId);
            // eslint-disable-next-line no-console
            console.error(originMessage);
            onErrorRef.current?.(originMessage);
            return;
          }
          throw error;
        }
        setIsReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          onErrorRef.current?.(error instanceof Error ? error.message : "Não foi possível carregar o Google.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.removeEventListener("error", handleGoogleError);
      setCredentialHandler(null);
    };
  }, [clientId, renderedWidth]);

  const unavailableInDev = !clientId && import.meta.env.DEV;

  if (!clientId) {
    return unavailableInDev ? (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Defina `VITE_GOOGLE_CLIENT_ID` para habilitar o Google neste ambiente.
      </p>
    ) : null;
  }

  // We render a wrapper around the official GIS button. When `disabled` is
  // true (parent is mid-login), we visually dim the button and block pointer
  // events — but only on the wrapper, never on the GIS iframe itself when
  // active, so the GIS click handler keeps working.
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div
        ref={containerRef}
        className="flex w-full justify-center"
        style={{
          opacity: disabled || !isReady ? 0.5 : 1,
          pointerEvents: disabled ? "none" : "auto",
          minHeight: 44,
        }}
      />
      {isLoading || !isReady ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Carregando Google…</span>
        </div>
      ) : null}
    </div>
  );
}


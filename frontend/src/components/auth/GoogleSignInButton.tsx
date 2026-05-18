import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../ui/button";
import {
  initializeGoogleIdentity,
  isGoogleOriginError,
  loadGoogleScript,
  renderGoogleButton,
  setCredentialHandler,
} from "../../services/googleIdentityService";

const GOOGLE_ORIGIN_MESSAGE =
  "Google OAuth não autorizado para esta origem. Adicione http://localhost:5173 em Authorized JavaScript origins.";

type GoogleSignInButtonProps = {
  disabled?: boolean;
  onCredential: (idToken: string) => void | Promise<void>;
  onError?: (message: string) => void;
};

function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
}

export function GoogleSignInButton({ disabled = false, onCredential, onError }: GoogleSignInButtonProps) {
  const clientId = getGoogleClientId();
  const hiddenButtonContainerRef = useRef<HTMLDivElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(clientId));

  // Keep latest callback refs without retriggering the GIS init effect.
  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
      console.error(GOOGLE_ORIGIN_MESSAGE);
      onErrorRef.current?.(GOOGLE_ORIGIN_MESSAGE);
    };

    setIsLoading(true);
    window.addEventListener("error", handleGoogleError);

    setCredentialHandler((response) => {
      if (!response.credential) {
        onErrorRef.current?.("Não foi possível iniciar o login com Google.");
        return;
      }
      void onCredentialRef.current(response.credential);
    });

    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !hiddenButtonContainerRef.current) {
          return;
        }

        try {
          initializeGoogleIdentity(clientId);
          renderGoogleButton(hiddenButtonContainerRef.current);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (isGoogleOriginError(message)) {
            console.error(GOOGLE_ORIGIN_MESSAGE);
            onErrorRef.current?.(GOOGLE_ORIGIN_MESSAGE);
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
  }, [clientId]);

  const handleClick = () => {
    if (!clientId) {
      onErrorRef.current?.("Login com Google indisponível neste ambiente.");
      return;
    }

    const hiddenButton = hiddenButtonContainerRef.current?.firstElementChild as HTMLElement | null;
    if (!hiddenButton) {
      onErrorRef.current?.("Login com Google ainda não está pronto. Tente novamente.");
      return;
    }

    hiddenButton.click();
  };

  const unavailableInDev = !clientId && import.meta.env.DEV;

  if (!clientId) {
    return unavailableInDev ? (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Defina `VITE_GOOGLE_CLIENT_ID` para habilitar o Google neste ambiente.
      </p>
    ) : null;
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 hover:bg-slate-50"
        disabled={disabled || isLoading || !clientId || !isReady}
        onClick={handleClick}
      >
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continuar com Google
      </Button>
      <div ref={hiddenButtonContainerRef} className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden />
    </div>
  );
}

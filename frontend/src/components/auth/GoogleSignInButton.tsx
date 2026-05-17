import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../ui/button";

const GOOGLE_GSI_SCRIPT_ID = "google-identity-services";
const GOOGLE_GSI_SRC = "https://accounts.google.com/gsi/client";

type GoogleSignInButtonProps = {
  disabled?: boolean;
  onCredential: (idToken: string) => void | Promise<void>;
  onError?: (message: string) => void;
};

function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.getElementById(GOOGLE_GSI_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Não foi possível carregar o Google.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_GSI_SCRIPT_ID;
    script.src = GOOGLE_GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar o Google."));
    document.head.appendChild(script);
  });
}

export function GoogleSignInButton({ disabled = false, onCredential, onError }: GoogleSignInButtonProps) {
  const clientId = getGoogleClientId();
  const hiddenButtonContainerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(clientId));

  useEffect(() => {
    let cancelled = false;

    if (!clientId) {
      setIsLoading(false);
      setIsReady(false);
      return;
    }

    setIsLoading(true);
    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !hiddenButtonContainerRef.current) {
          return;
        }

        hiddenButtonContainerRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (!response.credential) {
              onError?.("Não foi possível iniciar o login com Google.");
              return;
            }
            void onCredential(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(hiddenButtonContainerRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 260,
          logo_alignment: "left",
        });
        setIsReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          onError?.(error instanceof Error ? error.message : "Não foi possível carregar o Google.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential, onError]);

  const handleClick = () => {
    if (!clientId) {
      onError?.("Login com Google indisponível neste ambiente.");
      return;
    }

    const hiddenButton = hiddenButtonContainerRef.current?.firstElementChild as HTMLElement | null;
    if (!hiddenButton) {
      onError?.("Login com Google ainda não está pronto. Tente novamente.");
      return;
    }

    hiddenButton.click();
  };

  const unavailableInDev = !clientId && import.meta.env.DEV;

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
      {unavailableInDev ? (
        <p className="text-xs text-amber-700">Defina `VITE_GOOGLE_CLIENT_ID` para habilitar o Google neste ambiente.</p>
      ) : null}
      <div ref={hiddenButtonContainerRef} className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden />
    </div>
  );
}

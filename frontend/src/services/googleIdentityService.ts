/**
 * Google Identity Services (GIS) singleton manager.
 *
 * Rules:
 * - Loads the GIS script exactly once.
 * - Calls google.accounts.id.initialize() at most once per clientId.
 * - renderButton can be called many times safely.
 * - StrictMode / dev hot-reload safe: tracks init state by clientId.
 * - If clientId is missing, does nothing.
 *
 * Multiple components can share the same initialized GIS by registering
 * a credential handler. The internal initialize() callback dispatches to
 * the currently-registered handler so initialize() does not have to be
 * called again when a different component mounts.
 */

const GOOGLE_GSI_SCRIPT_ID = "google-identity-services";
const GOOGLE_GSI_SRC = "https://accounts.google.com/gsi/client";

type CredentialHandler = (response: GoogleCredentialResponse) => void;
type ButtonOptions = Parameters<NonNullable<Window["google"]>["accounts"]["id"]["renderButton"]>[1];

let scriptLoadPromise: Promise<void> | null = null;
let initializedClientId: string | null = null;
let currentCredentialHandler: CredentialHandler | null = null;

export function isGoogleOriginError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("origin is not allowed") ||
    normalized.includes("not allowed for the given client id") ||
    normalized.includes("idpiframe_initialization_failed")
  );
}

/**
 * Loads the GIS script tag into <head>. Idempotent — returns the same
 * promise if already loading or loaded.
 */
export function loadGoogleScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.getElementById(GOOGLE_GSI_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Não foi possível carregar o Google.")),
        { once: true },
      );
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

  return scriptLoadPromise;
}

/**
 * Calls google.accounts.id.initialize() exactly once per clientId.
 * Subsequent calls with the same clientId are no-ops.
 * Returns true if GIS is ready (just initialized or previously initialized),
 * false if clientId is missing or GIS is not loaded yet.
 */
export function initializeGoogleIdentity(clientId: string): boolean {
  if (!clientId || !window.google?.accounts?.id) return false;

  if (initializedClientId === clientId) return true;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      currentCredentialHandler?.(response);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  initializedClientId = clientId;
  return true;
}

/**
 * Registers the credential handler that receives GIS callbacks.
 * Components should set this on mount and clear (pass null) on unmount.
 */
export function setCredentialHandler(handler: CredentialHandler | null): void {
  currentCredentialHandler = handler;
}

/**
 * Renders the Google button into the given container.
 * Clears the container first to handle re-renders safely.
 */
export function renderGoogleButton(container: HTMLElement, options?: ButtonOptions): void {
  if (!window.google?.accounts?.id) return;

  container.innerHTML = "";
  window.google.accounts.id.renderButton(
    container,
    options ?? {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      width: 260,
      logo_alignment: "left",
    },
  );
}

/**
 * Test-only reset. Clears module-level singleton state so tests can
 * re-initialize without leaking across cases.
 */
export function __resetGoogleIdentityForTests(): void {
  scriptLoadPromise = null;
  initializedClientId = null;
  currentCredentialHandler = null;
}

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { API_BASE_URL } from "../services/http";
import { toast } from "../shared/utils/toast";
import {
  dispatchGoogleCalendarOAuthResult,
  GOOGLE_CALENDAR_OAUTH_RESULT_MESSAGE_TYPE,
} from "../features/agenda/googleCalendarOAuth";

function getApiOrigin(): string | null {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return null;
  }
}

export function GoogleCalendarOAuthBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const handledSearchRef = useRef<string | null>(null);

  useEffect(() => {
    const apiOrigin = getApiOrigin();

    function handleMessage(event: MessageEvent) {
      if (!apiOrigin || event.origin !== apiOrigin) return;
      if (!event.data || typeof event.data !== "object") return;

      const payload = event.data as { type?: string; success?: boolean };
      if (payload.type !== GOOGLE_CALENDAR_OAUTH_RESULT_MESSAGE_TYPE) return;

      const success = payload.success === true;
      dispatchGoogleCalendarOAuthResult({
        success,
        source: "google-calendar",
      });

      if (success) {
        toast.success("Google Calendar conectado com sucesso.");
      } else {
        toast.error("Não foi possível concluir a conexão com o Google Calendar.");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauthResult = params.get("google_calendar_oauth");
    if (!oauthResult) {
      handledSearchRef.current = null;
      return;
    }

    const currentKey = `${location.pathname}?${params.toString()}${location.hash}`;
    if (handledSearchRef.current === currentKey) return;
    handledSearchRef.current = currentKey;

    const success = oauthResult === "success";

    dispatchGoogleCalendarOAuthResult({
      success,
      source: "google-calendar",
    });

    if (success) {
      toast.success("Google Calendar conectado com sucesso.");
    } else {
      toast.error("Não foi possível concluir a conexão com o Google Calendar.");
    }

    params.delete("google_calendar_oauth");
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
        hash: location.hash,
      },
      { replace: true }
    );
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}

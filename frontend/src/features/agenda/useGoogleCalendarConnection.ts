import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { agendaService } from "../../services/agendaService";
import {
  GOOGLE_CALENDAR_OAUTH_RESULT_EVENT,
  startGoogleCalendarOAuth,
} from "./googleCalendarOAuth";

type UseGoogleCalendarConnectionOptions = {
  enabled?: boolean;
};

export function useGoogleCalendarConnection(
  options: UseGoogleCalendarConnectionOptions = {}
) {
  const { enabled = true } = options;
  const location = useLocation();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleAccountEmail, setGoogleAccountEmail] = useState<string | null>(
    null
  );
  const [loadingGoogleConnection, setLoadingGoogleConnection] =
    useState(enabled);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  async function refreshGoogleCalendarConnection() {
    if (!enabled) return;

    setLoadingGoogleConnection(true);
    try {
      const status = await agendaService.getGoogleCalendarStatus();
      setGoogleConnected(status.connected);
      setGoogleAccountEmail(status.google_account_email ?? null);
    } catch {
      setGoogleConnected(false);
      setGoogleAccountEmail(null);
    } finally {
      setLoadingGoogleConnection(false);
    }
  }

  async function connectGoogleCalendar() {
    const returnPath =
      `${location.pathname}${location.search}${location.hash}` || "/agenda";

    setConnectingGoogle(true);
    try {
      await startGoogleCalendarOAuth(returnPath);
    } finally {
      setConnectingGoogle(false);
    }
  }

  useEffect(() => {
    if (!enabled) {
      setLoadingGoogleConnection(false);
      return;
    }

    void refreshGoogleCalendarConnection();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    function handleOauthResult() {
      void refreshGoogleCalendarConnection();
    }

    window.addEventListener(
      GOOGLE_CALENDAR_OAUTH_RESULT_EVENT,
      handleOauthResult as EventListener
    );

    return () => {
      window.removeEventListener(
        GOOGLE_CALENDAR_OAUTH_RESULT_EVENT,
        handleOauthResult as EventListener
      );
    };
  }, [enabled]);

  return {
    googleConnected,
    googleAccountEmail,
    loadingGoogleConnection,
    connectingGoogle,
    refreshGoogleCalendarConnection,
    connectGoogleCalendar,
  };
}

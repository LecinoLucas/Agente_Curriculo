import { agendaService } from "../../services/agendaService";

export const GOOGLE_CALENDAR_OAUTH_RESULT_MESSAGE_TYPE =
  "GOOGLE_CALENDAR_OAUTH_RESULT";
export const GOOGLE_CALENDAR_OAUTH_RESULT_EVENT =
  "google-calendar-oauth-result";

export type GoogleCalendarOAuthResultDetail = {
  success: boolean;
  source: "google-calendar";
};

export function dispatchGoogleCalendarOAuthResult(
  detail: GoogleCalendarOAuthResultDetail
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<GoogleCalendarOAuthResultDetail>(
      GOOGLE_CALENDAR_OAUTH_RESULT_EVENT,
      { detail }
    )
  );
}

export async function startGoogleCalendarOAuth(returnPath: string): Promise<void> {
  const popup = window.open(
    "about:blank",
    "google-calendar-oauth",
    "popup=yes,width=520,height=720,resizable=yes,scrollbars=yes"
  );

  try {
    const response = await agendaService.getGoogleCalendarAuthUrl({
      frontendOrigin: window.location.origin,
      returnPath,
    });

    if (!response.auth_url) {
      throw new Error("URL de autenticação não retornada");
    }

    if (popup) {
      popup.location.href = response.auth_url;
      return;
    }

    window.location.assign(response.auth_url);
  } catch (error) {
    if (popup) popup.close();
    throw error;
  }
}

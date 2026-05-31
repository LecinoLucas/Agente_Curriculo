import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCandidateSession } from '../App';
import { candidatePortalService } from '../services/candidatePortalService';
import { HttpError } from '../services/publicApiClient';

/**
 * Restores the candidate name in the session context after a hard refresh.
 *
 * When an authenticated page is loaded directly (refresh or deep link), the
 * React state held by CandidateSessionCtx is empty even though the HttpOnly
 * session cookie is still valid. This hook fires a single GET /overview on
 * mount if candidateName is null, populates the context, and redirects to
 * /login on 401.
 *
 * Call at the top of any authenticated page that does NOT already fetch the
 * overview (currently: CandidateAssessmentPage, CandidatePreAdmissionPage).
 * CandidateHomePage already calls getOverview() itself and does not need this.
 */
export function useSessionRestore(): void {
  const { candidateName, setCandidateName } = useCandidateSession();
  const navigate = useNavigate();
  const attempted = useRef(false);

  useEffect(() => {
    // Skip if name already known (navigated here without a refresh)
    if (candidateName !== null) return;
    // Skip if we already fired a restore attempt in this component lifetime
    if (attempted.current) return;
    attempted.current = true;

    candidatePortalService
      .getOverview()
      .then((data) => setCandidateName(data.candidateName))
      .catch((err) => {
        if (err instanceof HttpError && err.status === 401) {
          navigate('/login');
        }
        // Other errors (network, 403): let the page's own data-fetch handle them
      });
  // Intentionally only runs on mount — candidateName changes after restore but
  // the ref guard prevents re-entry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

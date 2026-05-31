import { createContext, useContext, useState, useEffect } from 'react';
import { CandidatePortalRouter } from './routes/CandidatePortalRouter';
import { candidatePortalService } from './services/candidatePortalService';

// Lightweight session context — tracks the candidate's display name after a
// successful login or overview fetch. The actual auth is cookie-based (HttpOnly);
// this state is only used for UI (header name, logout button visibility).
interface CandidateSession {
  candidateName: string | null;
  setCandidateName: (name: string | null) => void;
}

const CandidateSessionCtx = createContext<CandidateSession | null>(null);

export function useCandidateSession(): CandidateSession {
  const ctx = useContext(CandidateSessionCtx);
  if (!ctx) throw new Error('useCandidateSession must be used within App');
  return ctx;
}

export function App() {
  const [candidateName, setCandidateName] = useState<string | null>(null);

  // Silent session probe on mount — uses GET /auth/session which always returns
  // 200 (never 401), so no console errors appear for logged-out visitors.
  // getOverview() is NOT called here; /minha-area uses it directly for full data.
  useEffect(() => {
    candidatePortalService
      .getSession()
      .then((session) => {
        if (session.authenticated && session.candidateName) {
          setCandidateName(session.candidateName);
        }
      })
      .catch(() => { /* network error — context stays null */ });
  }, []);

  return (
    <CandidateSessionCtx.Provider value={{ candidateName, setCandidateName }}>
      <CandidatePortalRouter />
    </CandidateSessionCtx.Provider>
  );
}

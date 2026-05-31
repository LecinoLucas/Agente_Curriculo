import { createContext, useContext, useState } from 'react';
import { CandidatePortalRouter } from './routes/CandidatePortalRouter';

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

  return (
    <CandidateSessionCtx.Provider value={{ candidateName, setCandidateName }}>
      <CandidatePortalRouter />
    </CandidateSessionCtx.Provider>
  );
}

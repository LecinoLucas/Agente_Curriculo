import { createContext, useContext, useState } from 'react';
import { CandidatePortalRouter } from './routes/CandidatePortalRouter';
import type { MockCandidate } from './types/candidatePortal';

interface MockAuthContext {
  candidate: MockCandidate | null;
  login: (candidate: MockCandidate) => void;
  logout: () => void;
}

const MockAuthCtx = createContext<MockAuthContext | null>(null);

export function useMockAuth(): MockAuthContext {
  const ctx = useContext(MockAuthCtx);
  if (!ctx) throw new Error('useMockAuth must be used within App');
  return ctx;
}

export function App() {
  const [candidate, setCandidate] = useState<MockCandidate | null>(null);

  return (
    <MockAuthCtx.Provider
      value={{
        candidate,
        login: setCandidate,
        logout: () => setCandidate(null),
      }}
    >
      <CandidatePortalRouter />
    </MockAuthCtx.Provider>
  );
}

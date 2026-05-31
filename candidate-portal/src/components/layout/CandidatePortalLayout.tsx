import { useNavigate } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { useCandidateSession } from '../../App';
import { candidateAuthService } from '../../services/candidateAuthService';

interface CandidatePortalLayoutProps {
  children: React.ReactNode;
  maxWidth?: 'content' | 'wide' | 'page' | 'full';
}

const maxWidthClasses = {
  content: 'max-w-content',
  wide: 'max-w-wide',
  page: 'max-w-page',
  full: 'w-full',
};

export function CandidatePortalLayout({
  children,
  maxWidth = 'page',
}: CandidatePortalLayoutProps) {
  const { candidateName, setCandidateName } = useCandidateSession();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await candidateAuthService.logout();
    } catch {
      // Logout is idempotent — always clear local state even on network error.
    }
    setCandidateName(null);
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <PublicHeader
        candidateName={candidateName ?? undefined}
        onLogout={() => void handleLogout()}
      />
      <main className="flex-1">
        <div className={['mx-auto w-full px-4 sm:px-6 py-6 sm:py-8', maxWidthClasses[maxWidth]].join(' ')}>
          {children}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

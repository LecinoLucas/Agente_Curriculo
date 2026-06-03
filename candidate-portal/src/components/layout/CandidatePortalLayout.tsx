import { useNavigate, useLocation } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { useCandidateSession } from '../../App';
import { candidateAuthService } from '../../services/candidateAuthService';

interface CandidatePortalLayoutProps {
  children: React.ReactNode;
  maxWidth?: 'content' | 'wide' | 'page' | 'full';
  hideFooter?: boolean;
  fullHeight?: boolean;
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
  hideFooter = false,
  fullHeight = false,
}: CandidatePortalLayoutProps) {
  const { candidateName, setCandidateName } = useCandidateSession();
  const navigate = useNavigate();
  const location = useLocation();

  const isAssistantPage = location.pathname === '/portal-2';

  async function handleLogout() {
    try {
      await candidateAuthService.logout();
    } catch {
      // Logout is idempotent — always clear local state even on network error.
    }
    setCandidateName(null);
    navigate('/login');
  }

  const rootClasses = [
    'min-h-screen flex flex-col bg-gray-50',
    isAssistantPage ? 'lg:flex-row lg:h-screen lg:overflow-hidden' : '',
    fullHeight ? 'h-screen overflow-hidden' : '',
  ].filter(Boolean).join(' ');

  const mainClasses = [
    'flex-1 flex flex-col min-w-0',
    isAssistantPage ? 'lg:h-screen lg:overflow-hidden' : '',
    fullHeight ? 'overflow-hidden' : '',
  ].filter(Boolean).join(' ');

  const containerClasses = [
    'mx-auto w-full px-4 sm:px-6',
    (fullHeight || isAssistantPage) ? 'flex-1 flex flex-col py-0 overflow-hidden' : 'py-6 sm:py-8',
    maxWidthClasses[maxWidth],
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClasses}>
      <PublicHeader
        candidateName={candidateName ?? undefined}
        onLogout={() => void handleLogout()}
      />
      <main className={mainClasses}>
        <div className={containerClasses}>
          {children}
        </div>
      </main>
      {!hideFooter && <PublicFooter />}
    </div>
  );
}

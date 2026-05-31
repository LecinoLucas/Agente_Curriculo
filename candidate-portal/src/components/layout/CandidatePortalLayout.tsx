import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { useMockAuth } from '../../App';

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
  const { candidate, logout } = useMockAuth();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <PublicHeader
        candidateName={candidate?.name}
        onLogout={logout}
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

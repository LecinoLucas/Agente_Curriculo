import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, User } from 'lucide-react';
import { Button } from '../ui/Button';

interface PublicHeaderProps {
  candidateName?: string;
  onLogout?: () => void;
}

const navLinks = [
  { label: 'Home', href: '/', featured: true },
  { label: 'Vagas', href: '/vagas' },
  { label: 'Sobre nós', href: '/sobre-nos' },
  { label: 'Nossas unidades', href: '/unidades' },
  { label: 'Dúvidas frequentes', href: '/duvidas-frequentes' },
  { label: 'Contato', href: '/contato' },
];

export function PublicHeader({ candidateName, onLogout }: PublicHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const isAssistantPage = location.pathname === '/portal-2';

  const headerClasses = [
    'sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200',
    isAssistantPage ? 'lg:border-b-0 lg:border-r lg:w-64 lg:h-screen lg:flex lg:flex-col lg:shrink-0 lg:sticky lg:left-0 lg:top-0' : ''
  ].filter(Boolean).join(' ');

  const containerClasses = [
    'mx-auto flex h-16 w-full items-center justify-between px-4 sm:px-6',
    isAssistantPage ? 'lg:h-full lg:flex-col lg:items-start lg:justify-start lg:py-8 lg:px-6 lg:gap-8 lg:max-w-none' : 'max-w-page'
  ].filter(Boolean).join(' ');

  const logoClasses = [
    'flex items-center gap-1.5 flex-shrink-0',
    isAssistantPage ? 'lg:mb-2' : ''
  ].filter(Boolean).join(' ');

  const navClasses = [
    'hidden lg:flex',
    isAssistantPage ? 'lg:flex-col lg:items-stretch lg:w-full lg:gap-1.5' : 'items-center gap-1'
  ].filter(Boolean).join(' ');

  const ctaContainerClasses = [
    'flex items-center gap-2',
    isAssistantPage ? 'lg:flex-col lg:items-stretch lg:w-full lg:mt-auto lg:gap-3' : ''
  ].filter(Boolean).join(' ');

  return (
    <header className={headerClasses}>
      <div className={containerClasses}>
        {/* Logo */}
        <Link to="/" className={logoClasses}>
          <span className="text-xl font-extrabold tracking-tight text-primary-700">Marajó</span>
          <span className="text-xl font-extrabold tracking-tight text-gray-900">RH</span>
        </Link>

        {/* Desktop nav */}
        <nav className={navClasses}>
          {navLinks.map((link) => {
            const isActive = location.pathname === link.href;
            const linkClasses = isAssistantPage
              ? [
                  'px-3 py-2 rounded-lg text-sm transition-colors w-full text-left',
                  link.featured
                    ? isActive
                      ? 'font-bold bg-primary-700 text-white'
                      : 'font-bold bg-primary-50 text-primary-700 hover:bg-primary-100'
                    : isActive
                    ? 'font-semibold bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                ].join(' ')
              : [
                  'px-3 py-1.5 rounded-md text-sm transition-colors',
                  link.featured
                    ? isActive
                      ? 'font-bold bg-primary-700 text-white shadow-sm'
                      : 'font-bold bg-primary-50 text-primary-700 hover:bg-primary-100'
                    : isActive
                    ? 'font-semibold text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                ].join(' ');

            return (
              <Link
                key={link.label}
                to={link.href}
                className={linkClasses}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* CTA / user */}
        <div className={ctaContainerClasses}>
          {candidateName ? (
            <div className={isAssistantPage ? 'flex flex-col lg:w-full gap-2' : 'flex items-center gap-2'}>
              <Link
                to="/minha-area"
                className={[
                'hidden sm:flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700',
                isAssistantPage ? 'lg:w-full lg:py-2' : ''
              ].filter(Boolean).join(' ')}
              >
                <User className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-medium truncate">{candidateName}</span>
              </Link>
              <Button variant="ghost" size="sm" onClick={onLogout} className={isAssistantPage ? 'lg:w-full lg:justify-center' : ''}>
                Sair
              </Button>
            </div>
          ) : (
            <Link to="/login" className={isAssistantPage ? 'lg:w-full' : ''}>
              <Button size="sm" variant="primary" className={isAssistantPage ? 'lg:w-full lg:justify-center' : ''}>
                Área do candidato
              </Button>
            </Link>
          )}

          {/* Mobile menu toggle */}
          <button
            className="flex lg:hidden items-center justify-center h-9 w-9 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="absolute left-3 right-3 top-[calc(100%+8px)] rounded-xl border border-gray-200 bg-white p-2 shadow-modal lg:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              className={[
                'block rounded-lg px-3 py-2.5 text-sm transition-colors',
                link.featured
                  ? 'font-bold bg-primary-50 text-primary-700 hover:bg-primary-100'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
              ].join(' ')}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

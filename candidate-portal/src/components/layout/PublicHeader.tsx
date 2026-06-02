import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, User } from 'lucide-react';
import { Button } from '../ui/Button';

interface PublicHeaderProps {
  candidateName?: string;
  onLogout?: () => void;
}

const navLinks = [
  { label: 'Vagas', href: '/' },
  { label: 'Sobre nós', href: '/sobre-nos' },
  { label: 'Nossas unidades', href: '/unidades' },
  { label: 'Dúvidas frequentes', href: '/duvidas-frequentes' },
  { label: 'Contato', href: '/contato' },
];

export function PublicHeader({ candidateName, onLogout }: PublicHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xl font-extrabold tracking-tight text-primary-700">Marajó</span>
          <span className="text-xl font-extrabold tracking-tight text-gray-900">RH</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              className={[
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                location.pathname === link.href
                  ? 'font-semibold text-primary-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
              ].join(' ')}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* CTA / user */}
        <div className="flex items-center gap-2">
          {candidateName ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700">
                <User className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-medium">{candidateName}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={onLogout}>
                Sair
              </Button>
            </div>
          ) : (
            <Link to="/login">
              <Button size="sm" variant="primary">
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
              className="block rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
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

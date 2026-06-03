import { Link } from 'react-router-dom';

export function PublicFooter() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="mx-auto max-w-page px-4 sm:px-6 pt-12 sm:pt-14 pb-8">

        {/* Main grid */}
        <div className="grid grid-cols-2 gap-8 sm:gap-10 lg:grid-cols-5 lg:gap-12">

          {/* ── Col 1: Brand ─────────────────────────────────────────────── */}
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-1 mb-3">
              <span className="text-lg font-extrabold tracking-tight text-primary-600">Marajó</span>
              <span className="text-lg font-extrabold tracking-tight text-white">RH</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
              Portal de recrutamento da Rede Marajó, rede de postos em rodovias brasileiras.
            </p>
          </div>

          {/* ── Col 2: Candidatos ─────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
              Candidatos
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/vagas"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Ver vagas
                </Link>
              </li>
              <li>
                <Link
                  to="/login"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Minha área
                </Link>
              </li>
              <li>
                <Link
                  to="/recuperar-acesso"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Recuperar acesso
                </Link>
              </li>
              <li>
                <Link
                  to="/duvidas-frequentes"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Dúvidas frequentes
                </Link>
              </li>
            </ul>
          </div>

          {/* ── Col 3: Rede Marajó ────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
              Rede Marajó
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/sobre-nos"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Sobre nós
                </Link>
              </li>
              <li>
                <Link
                  to="/unidades"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Nossas unidades
                </Link>
              </li>
              <li>
                <Link
                  to="/contato"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Contato
                </Link>
              </li>
            </ul>
          </div>

          {/* ── Col 4: Carreiras (static — rotas não disponíveis) ─────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
              Carreiras
            </p>
            <ul className="space-y-2.5">
              <li>
                <span className="text-sm text-gray-500">Áreas de atuação</span>
              </li>
              <li>
                <span className="text-sm text-gray-500">Desenvolvimento</span>
              </li>
              <li>
                <span className="text-sm text-gray-500">Banco de talentos</span>
              </li>
            </ul>
          </div>

          {/* ── Col 5: Legal ─────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
              Legal
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/privacidade"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Política de privacidade
                </Link>
              </li>
              <li>
                <Link
                  to="/termos"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Termos de uso
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* ── Bottom bar ───────────────────────────────────────────────────── */}
        <div className="mt-10 pt-6 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center sm:text-left">
            © {new Date().getFullYear()} Rede Marajó. Todos os direitos reservados.
          </p>
        </div>

      </div>
    </footer>
  );
}

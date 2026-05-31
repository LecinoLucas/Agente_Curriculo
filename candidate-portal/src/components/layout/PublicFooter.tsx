export function PublicFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="mx-auto max-w-page px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-1">
              <span className="text-lg font-extrabold tracking-tight text-primary-700">Marajó</span>
              <span className="text-lg font-extrabold tracking-tight text-gray-900">RH</span>
            </div>
            <p className="mt-1.5 text-sm text-gray-500 max-w-xs">
              Plataforma de recrutamento e seleção da Rede Marajó.
            </p>
          </div>

          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Candidatos
              </p>
              <ul className="space-y-1.5 text-sm text-gray-600">
                <li><a href="/vagas" className="hover:text-primary-700 transition-colors">Ver vagas</a></li>
                <li><a href="/login" className="hover:text-primary-700 transition-colors">Minha área</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Empresa
              </p>
              <ul className="space-y-1.5 text-sm text-gray-600">
                <li><a href="#" className="hover:text-primary-700 transition-colors">Sobre nós</a></li>
                <li><a href="#" className="hover:text-primary-700 transition-colors">Nossas unidades</a></li>
                <li><a href="#" className="hover:text-primary-700 transition-colors">Contato</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-100 pt-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
          <p>© {new Date().getFullYear()} Rede Marajó. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-gray-600 transition-colors">Política de privacidade</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Termos de uso</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

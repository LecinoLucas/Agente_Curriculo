import { useLocation } from "react-router-dom";
import { ArrowRight, ExternalLink } from "lucide-react";

/**
 * Transition screen shown on all /candidato/* routes.
 *
 * The old candidate portal (CandidatePortalPage, PublicApplicationPage, etc.)
 * has been superseded by the new standalone candidate-portal app. This page
 * informs the candidate and provides a CTA to the new portal without forcing
 * an automatic redirect that could disrupt development workflows.
 *
 * Configure VITE_CANDIDATE_PORTAL_URL in .env.local to point to the new portal.
 * Defaults to http://localhost:5174 for local development.
 *
 * This page is intentionally kept separate from the old pages so that C-Clean-2
 * can safely remove the old pages without touching this file.
 */

const PORTAL_BASE =
  import.meta.env.VITE_CANDIDATE_PORTAL_URL ?? "http://localhost:5174";

// Maps old /candidato/* paths to equivalent new portal paths
const PATH_MAP: Record<string, string> = {
  "/candidato": "/vagas",
  "/candidato/cadastro": "/vagas",
  "/candidato/login": "/login",
  "/candidato/portal": "/minha-area",
  "/candidato/pre-admissao": "/pre-admissao",
};

export function CandidatePortalRedirectPage() {
  const location = useLocation();
  const targetPath = PATH_MAP[location.pathname] ?? "/vagas";
  const targetUrl = `${PORTAL_BASE}${targetPath}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
        {/* Logo / brand */}
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary-50">
          <ExternalLink className="h-7 w-7 text-primary-700" />
        </div>

        <h1 className="text-2xl font-extrabold text-gray-900">
          Portal do Candidato
        </h1>

        <p className="mt-3 text-base text-gray-600 leading-relaxed">
          O portal do candidato foi atualizado para uma nova experiência,
          mais rápida e fácil de usar.
        </p>

        <p className="mt-2 text-sm text-gray-400">
          Esta página está em processo de migração.
        </p>

        <a
          href={targetUrl}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-700 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2"
        >
          Acessar novo portal
          <ArrowRight className="h-4 w-4" />
        </a>

        <p className="mt-4 text-xs text-gray-400 break-all">
          {targetUrl}
        </p>
      </div>
    </div>
  );
}

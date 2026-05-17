import { GoogleSignInButton } from "../../../components/auth/GoogleSignInButton";
import { Button } from "../../../components/ui/button";

interface Props {
  onSelectManual: () => void;
  onGoogleCredential: (idToken: string) => void | Promise<void>;
  onGoogleError: (message: string) => void;
  googleDisabled?: boolean;
}

export function SignupMethodStep({ onSelectManual, onGoogleCredential, onGoogleError, googleDisabled = false }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--primary))]">Acesso inicial</p>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(var(--text))]">Como você deseja começar?</h2>
        <p className="text-sm text-[hsl(var(--text-muted))]">
          Use sua conta Google para validar identidade ou siga com o cadastro tradicional completo.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-900">Cadastro com Google</p>
          <p className="mt-1 text-sm text-slate-600">
            Validamos nome e e-mail pela sua conta Google, mas os demais dados continuam obrigatórios.
          </p>
          <div className="mt-4">
            <GoogleSignInButton
              disabled={googleDisabled}
              onCredential={onGoogleCredential}
              onError={onGoogleError}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-900">Cadastro tradicional</p>
          <p className="mt-1 text-sm text-slate-600">
            Preencha o formulário completo, crie sua senha e acompanhe tudo pelo portal.
          </p>
          <Button variant="default" onClick={onSelectManual} className="mt-4 h-12 w-full rounded-2xl">
            Preencher manualmente
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        O login social não pula etapas obrigatórias: pretensão salarial, currículo e consentimento continuam sendo exigidos.
      </p>
    </div>
  );
}

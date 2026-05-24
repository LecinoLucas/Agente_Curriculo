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
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--primary))] animate-in fade-in duration-500">Acesso inicial</p>
        <h2 className="text-2xl font-bold tracking-tight text-[hsl(var(--text))] font-heading">Como você deseja começar?</h2>
        <p className="text-sm text-[hsl(var(--text-muted))] leading-relaxed">
          Use sua conta Google para validar identidade ou siga com o cadastro tradicional completo.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Google Signup Option Card */}
        <div className="flex flex-col justify-between rounded-[2rem] border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface)/0.65)] p-6 shadow-sm hover:shadow-md hover:border-[hsl(var(--primary)/0.25)] transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[hsl(var(--primary))]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="space-y-2">
            <h3 className="font-heading text-lg font-bold text-[hsl(var(--text))]">Cadastro com Google</h3>
            <p className="text-[13px] text-[hsl(var(--text-muted))] leading-relaxed">
              Validamos nome e e-mail pela sua conta Google, mas os demais dados continuam obrigatórios.
            </p>
          </div>
          <div className="mt-6 flex min-h-[56px] items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.4)] bg-[hsl(var(--bg)/0.2)] p-2 backdrop-blur-sm">
            <GoogleSignInButton
              disabled={googleDisabled}
              onCredential={onGoogleCredential}
              onError={onGoogleError}
            />
          </div>
        </div>

        {/* Traditional Signup Option Card */}
        <div className="flex flex-col justify-between rounded-[2rem] border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface))] p-6 shadow-sm hover:shadow-md hover:border-[hsl(var(--primary)/0.25)] transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[hsl(var(--primary))]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="space-y-2">
            <h3 className="font-heading text-lg font-bold text-[hsl(var(--text))]">Cadastro tradicional</h3>
            <p className="text-[13px] text-[hsl(var(--text-muted))] leading-relaxed">
              Preencha o formulário completo, crie sua senha e acompanhe todo pelo portal.
            </p>
          </div>
          <Button 
            variant="default" 
            onClick={onSelectManual} 
            className="mt-6 h-12 w-full rounded-2xl bg-[hsl(var(--primary))] hover:bg-[hsl(var(--brand-dark))] text-white font-semibold shadow-sm hover:shadow transition-all duration-200"
          >
            Preencher manualmente
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-[hsl(var(--surface-muted)/0.3)] border border-[hsl(var(--border)/0.25)] p-4 text-[13px] text-[hsl(var(--text-muted))] leading-relaxed">
        <span className="font-bold text-[hsl(var(--primary))]">Nota:</span> O login social não pula etapas obrigatórias. A pretensão salarial, currículo e o consentimento de dados continuam sendo exigidos para finalizar sua candidatura.
      </div>
    </div>
  );
}

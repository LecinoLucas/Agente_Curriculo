import { Button } from "../../../components/ui/button";

interface Props {
  onSelectManual: () => void;
}

export function SignupMethodStep({ onSelectManual }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Como você deseja se inscrever?</h2>

      <div className="space-y-3">
        <Button
          disabled
          variant="outline"
          className="h-12 w-full text-left"
          title="Google OAuth será disponibilizado em breve"
        >
          <span className="text-gray-400">
            🔒 Cadastrar com Google <span className="text-xs">(em breve)</span>
          </span>
        </Button>

        <Button variant="default" onClick={onSelectManual} className="h-12 w-full">
          ✏️ Preencher manualmente
        </Button>
      </div>

      <p className="text-sm text-gray-500">
        Sem conta? Sem problema. Preencha seus dados e nossa equipe entrará em contato.
      </p>
    </div>
  );
}

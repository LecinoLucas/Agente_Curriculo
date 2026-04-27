import { useEffect, useState } from "react";
import { ShieldCheck, User } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "../components/common/PageHeader";
import { useAuth } from "../features/auth/useAuth";
import { authService } from "../services/authService";
import { toast } from "../services/toast";

function roleLabel(role?: string) {
  const labels: Record<string, string> = {
    admin: "Administrador",
    recruiter: "Recrutador",
    candidate: "Candidato",
    viewer: "Visualizador",
  };
  return role ? labels[role] ?? role : "Nao informado";
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    active: "Ativo",
    pending_verification: "Aguardando validacao",
    suspended: "Suspenso",
    inactive: "Inativo",
  };
  return status ? labels[status] ?? status : "Nao informado";
}

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user?.full_name ?? "");
  }, [user?.full_name]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await authService.updateMe({ full_name: fullName });
      await refreshUser();
      toast.success("Perfil atualizado com sucesso");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar perfil");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Meu perfil"
        subtitle="Edite seus dados de forma rapida, sem precisar procurar dentro do painel admin"
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Dados da conta
            </CardTitle>
            <CardDescription>Voce pode atualizar seu nome aqui sempre que precisar.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
                Nome completo
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
                E-mail
                <input
                  value={user?.email ?? ""}
                  disabled
                  className="h-10 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500"
                />
              </label>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar perfil"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Acesso atual
            </CardTitle>
            <CardDescription>Esses dados sao controlados pela plataforma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Perfil</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{roleLabel(user?.role)}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{statusLabel(user?.status)}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

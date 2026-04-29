import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ActivitySquare,
  Bell,
  Camera,
  KeyRound,
  Loader,
  Moon,
  Sun,
  Trash2,
  User,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "../components/common/PageHeader";
import { useAuth } from "../features/auth/useAuth";
import { useTheme } from "../hooks/useTheme";
import { authService } from "../services/authService";
import { usersService } from "../services/usersService";
import { toast } from "../services/toast";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  recruiter: "Recrutador",
  candidate: "Candidato",
  viewer: "Visualizador",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active:               { label: "Ativo",               variant: "default" },
  pending_verification: { label: "Aguardando validação", variant: "secondary" },
  suspended:            { label: "Suspenso",             variant: "destructive" },
  inactive:             { label: "Inativo",              variant: "outline" },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function AvatarBadge({
  name,
  avatarUrl,
  onUpload,
  onDelete,
  uploading
}: {
  name: string;
  avatarUrl?: string | null;
  onUpload: (file: File) => Promise<void>;
  onDelete?: () => Promise<void>;
  uploading?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error("Arquivo muito grande (máximo 2MB)");
      return;
    }

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Apenas JPEG e PNG são permitidos");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      await onUpload(file);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setPreview(null);
    }
  };

  const displayImage = preview || avatarUrl;

  return (
    <div className="relative inline-block">
      {displayImage ? (
        <img
          src={displayImage}
          alt={name}
          className={`h-16 w-16 shrink-0 rounded-2xl object-cover shadow-md transition-opacity duration-300 ${uploading ? "opacity-50" : "opacity-100"}`}
        />
      ) : (
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-bold text-white shadow-md transition-opacity duration-300 ${uploading ? "opacity-50" : "opacity-100"}`}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}

      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/20 backdrop-blur-sm">
          <Loader className="h-5 w-5 animate-spin text-white" />
        </div>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={`absolute bottom-0 right-0 rounded-full p-2 text-white shadow-md transition-all duration-200 ${uploading ? "bg-gray-400 cursor-not-allowed opacity-50" : "bg-blue-600 hover:bg-blue-700"}`}
      >
        <Camera className="h-4 w-4" />
      </button>

      {avatarUrl && onDelete && (
        <button
          type="button"
          onClick={() => void onDelete()}
          disabled={uploading}
          className={`absolute top-0 right-0 rounded-full p-1.5 text-white shadow-md transition-all duration-200 ${uploading ? "bg-gray-400 cursor-not-allowed" : "bg-red-500 hover:bg-red-600"}`}
          title="Remover foto"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={(e) => void handleFileSelect(e)}
        className="hidden"
      />
    </div>
  );
}

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
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

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await usersService.uploadAvatar(formData);
      await refreshUser();
      toast.success("Foto de perfil atualizada");
    } catch (err) {
      throw err;
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleAvatarDelete() {
    setUploadingAvatar(true);
    try {
      await usersService.deleteAvatar();
      await refreshUser();
      toast.success("Foto de perfil removida");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover foto");
    } finally {
      setUploadingAvatar(false);
    }
  }

  const statusConf = STATUS_CONFIG[user?.status ?? ""] ?? { label: user?.status ?? "—", variant: "outline" as const };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Minha conta"
        subtitle="Gerencie seus dados, segurança e preferências"
      />

      {/* ── Identity strip ──────────────────────────────────────────── */}
      <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <AvatarBadge
          name={user?.full_name ?? "?"}
          avatarUrl={user?.avatar_url}
          onUpload={handleAvatarUpload}
          onDelete={handleAvatarDelete}
          uploading={uploadingAvatar}
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">
            {user?.full_name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
            </span>
            <Badge variant={statusConf.variant}>{statusConf.label}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── Card 1: Dados pessoais ───────────────────────────────── */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-blue-600" />
              Dados pessoais
            </CardTitle>
            <CardDescription>Atualize seu nome de exibição.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                Nome completo
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                E-mail
                <input
                  value={user?.email ?? ""}
                  disabled
                  className="h-10 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400"
                />
                <span className="text-xs text-gray-400">O e-mail não pode ser alterado por aqui.</span>
              </label>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="pt-1">
                <Button type="submit" disabled={saving} size="sm">
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Card 2: Segurança ────────────────────────────────────── */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-amber-600" />
              Segurança
            </CardTitle>
            <CardDescription>Configurações de acesso à sua conta.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Alterar senha</p>
                <p className="mt-1 text-xs text-gray-400">
                  Abra a tela de segurança para trocar sua senha sem exibir nenhuma credencial atual.
                </p>
                <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => navigate("/trocar-senha")}>
                  Alterar senha
                </Button>
              </div>

              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Autenticação em dois fatores</p>
                <p className="mt-1 text-xs text-gray-400">
                  Disponível em versões futuras da plataforma.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Card 3: Preferências ─────────────────────────────────── */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {theme === "light"
                ? <Sun className="h-4 w-4 text-yellow-500" />
                : <Moon className="h-4 w-4 text-indigo-400" />}
              Preferências
            </CardTitle>
            <CardDescription>Personalize sua experiência na plataforma.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Tema */}
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Tema da interface</p>
                <p className="text-xs text-gray-400">
                  {theme === "light" ? "Tema claro ativo" : "Tema escuro ativo"}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                {theme === "light"
                  ? <><Moon className="h-3.5 w-3.5" /> Escuro</>
                  : <><Sun className="h-3.5 w-3.5" /> Claro</>}
              </button>
            </div>

            {/* Notificações */}
            <div className="flex items-center justify-between rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Notificações</p>
                  <p className="text-xs text-gray-400">Em breve — preferências de alerta por e-mail e na plataforma.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Card 4: Atividade da conta ───────────────────────────── */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ActivitySquare className="h-4 w-4 text-emerald-600" />
              Atividade da conta
            </CardTitle>
            <CardDescription>Informações de acesso e histórico.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ActivityRow label="Perfil de acesso" value={ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? "—"} />
            <ActivityRow label="Status da conta" value={statusConf.label} />
            <ActivityRow label="Último acesso" value={formatDate(user?.last_login_at)} />
            <ActivityRow label="Membro desde" value={formatDate(user?.created_at)} />
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function ActivityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-800/50">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

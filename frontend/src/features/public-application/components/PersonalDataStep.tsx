import { formatPhone } from "../utils/phone";
import type { FormData, ApplicationErrors } from "../types";
import { Link } from "react-router-dom";

interface Props {
  form: FormData;
  errors: ApplicationErrors;
  onChange: (field: keyof FormData, value: unknown) => void;
}

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export function PersonalDataStep({ form, errors, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--primary))]">Dados pessoais</p>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(var(--text))]">Preencha seus dados principais</h2>
        <p className="text-sm text-[hsl(var(--text-muted))]">
          Usamos essas informações para identificar seu perfil e evitar cadastros duplicados.
        </p>
        <p className="text-sm text-[hsl(var(--text-muted))]">
          Se você já tiver cadastro, suas informações serão vinculadas ao seu perfil existente quando possível.
        </p>
      </div>

      {form.authMethod === "google" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Conta Google validada. Complete os dados restantes para finalizar sua candidatura.
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="candidate-full-name" className="block text-sm font-medium text-gray-700">Nome completo *</label>
          <input
            id="candidate-full-name"
            type="text"
            autoComplete="name"
            value={form.fullName}
            onChange={(e) => onChange("fullName", e.target.value)}
            placeholder="João Silva Santos"
            className={`mt-1 h-12 w-full rounded-2xl border px-4 py-2 ${
              errors.fullName ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          {errors.fullName && <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>}
        </div>

        <div>
          <label htmlFor="candidate-cpf" className="block text-sm font-medium text-gray-700">CPF *</label>
          <input
            id="candidate-cpf"
            type="text"
            value={form.cpf}
            onChange={(e) => onChange("cpf", e.target.value)}
            placeholder="Digite seu CPF"
            className={`mt-1 h-12 w-full rounded-2xl border px-4 py-2 ${
              errors.cpf ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          {errors.cpf && (
            <p className="mt-1 text-sm text-red-600">
              {errors.cpf}{" "}
              {errors.cpf.includes("Faça login") && (
                <Link to="/candidato" className="font-semibold underline hover:text-red-800 ml-1">
                  Acessar Portal
                </Link>
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            O CPF será utilizado apenas para identificação no processo seletivo e prevenção de cadastros duplicados.
          </p>
        </div>

        <div>
          <label htmlFor="candidate-email" className="block text-sm font-medium text-gray-700">E-mail *</label>
          <input
            id="candidate-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => onChange("email", e.target.value)}
            placeholder="seu.email@example.com"
            disabled={form.emailLocked}
            className={`mt-1 h-12 w-full rounded-2xl border px-4 py-2 ${
              errors.email ? "border-red-500" : "border-gray-300"
            } ${form.emailLocked ? "bg-slate-100 text-slate-500" : ""} focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">
              {errors.email}{" "}
              {errors.email.includes("Faça login") && (
                <Link to="/candidato" className="font-semibold underline hover:text-red-800 ml-1">
                  Acessar Portal
                </Link>
              )}
            </p>
          )}
          {form.emailLocked ? <p className="mt-1 text-xs text-gray-500">E-mail validado via Google.</p> : null}
        </div>

        <div>
          <label htmlFor="candidate-phone" className="block text-sm font-medium text-gray-700">Telefone / WhatsApp *</label>
          <input
            id="candidate-phone"
            type="tel"
            autoComplete="tel"
            value={formatPhone(form.phone)}
            onChange={(e) => onChange("phone", e.target.value.replace(/\D/g, ""))}
            placeholder="(11) 98765-4321"
            maxLength={15}
            className={`mt-1 h-12 w-full rounded-2xl border px-4 py-2 ${
              errors.phone ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
        </div>

        <div>
          <label htmlFor="candidate-state" className="block text-sm font-medium text-gray-700">UF *</label>
          <select
            id="candidate-state"
            value={form.state}
            onChange={(e) => onChange("state", e.target.value)}
            className={`mt-1 h-12 w-full rounded-2xl border px-4 py-2 ${
              errors.state ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          >
            {UF_OPTIONS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
          {errors.state && <p className="mt-1 text-sm text-red-600">{errors.state}</p>}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="candidate-city" className="block text-sm font-medium text-gray-700">Cidade *</label>
          <input
            id="candidate-city"
            type="text"
            autoComplete="address-level2"
            value={form.city}
            onChange={(e) => onChange("city", e.target.value)}
            placeholder="São Paulo"
            className={`mt-1 h-12 w-full rounded-2xl border px-4 py-2 ${
              errors.city ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          {errors.city && <p className="mt-1 text-sm text-red-600">{errors.city}</p>}
        </div>
      </div>

      {form.authMethod === "manual" ? (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="candidate-password" className="block text-sm font-medium text-gray-700">Senha *</label>
            <input
              id="candidate-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => onChange("password", e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className={`mt-1 h-12 w-full rounded-2xl border px-4 py-2 ${
                errors.password ? "border-red-500" : "border-gray-300"
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="candidate-confirm-password" className="block text-sm font-medium text-gray-700">Confirmar senha *</label>
            <input
              id="candidate-confirm-password"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => onChange("confirmPassword", e.target.value)}
              placeholder="Repita sua senha"
              className={`mt-1 h-12 w-full rounded-2xl border px-4 py-2 ${
                errors.confirmPassword ? "border-red-500" : "border-gray-300"
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label htmlFor="candidate-works-at-marajo" className="flex items-center gap-2">
          <input
            id="candidate-works-at-marajo"
            type="checkbox"
            checked={form.worksAtMarajoGroup}
            onChange={(e) => onChange("worksAtMarajoGroup", e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm font-medium text-gray-700">Trabalha em alguma empresa do Grupo Marajó?</span>
        </label>
      </div>
    </div>
  );
}

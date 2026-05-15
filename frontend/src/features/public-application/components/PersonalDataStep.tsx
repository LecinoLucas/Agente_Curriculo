import { formatPhone } from "../utils/phone";
import type { FormData, ApplicationErrors } from "../types";

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
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Dados pessoais</h2>

      {/* Nome */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome completo *</label>
        <input
          type="text"
          value={form.fullName}
          onChange={(e) => onChange("fullName", e.target.value)}
          placeholder="João Silva Santos"
          className={`mt-1 w-full rounded border px-3 py-2 ${
            errors.fullName ? "border-red-500" : "border-gray-300"
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {errors.fullName && <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>}
      </div>

      {/* CPF */}
      <div>
        <label className="block text-sm font-medium text-gray-700">CPF *</label>
        <input
          type="text"
          value={form.cpf}
          onChange={(e) => onChange("cpf", e.target.value)}
          placeholder="Digite seu CPF"
          className={`mt-1 w-full rounded border px-3 py-2 ${
            errors.cpf ? "border-red-500" : "border-gray-300"
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {errors.cpf && <p className="mt-1 text-sm text-red-600">{errors.cpf}</p>}
        <p className="mt-1 text-xs text-gray-500">
          O CPF será utilizado apenas para identificação no processo seletivo e prevenção de cadastros duplicados.
        </p>
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-gray-700">E-mail *</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder="seu.email@example.com"
          className={`mt-1 w-full rounded border px-3 py-2 ${
            errors.email ? "border-red-500" : "border-gray-300"
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
      </div>

      {/* Telefone */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Telefone *</label>
        <input
          type="tel"
          value={formatPhone(form.phone)}
          onChange={(e) => onChange("phone", e.target.value.replace(/\D/g, ""))}
          placeholder="(11) 98765-4321"
          maxLength="15"
          className={`mt-1 w-full rounded border px-3 py-2 ${
            errors.phone ? "border-red-500" : "border-gray-300"
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
      </div>

      {/* Cidade e Estado */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Cidade *</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => onChange("city", e.target.value)}
            placeholder="São Paulo"
            className={`mt-1 w-full rounded border px-3 py-2 ${
              errors.city ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          {errors.city && <p className="mt-1 text-sm text-red-600">{errors.city}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">UF *</label>
          <select
            value={form.state}
            onChange={(e) => onChange("state", e.target.value)}
            className={`mt-1 w-full rounded border px-3 py-2 ${
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
      </div>

      {/* Senha */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Senha *</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => onChange("password", e.target.value)}
          placeholder="Mínimo 8 caracteres"
          className={`mt-1 w-full rounded border px-3 py-2 ${
            errors.password ? "border-red-500" : "border-gray-300"
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
      </div>

      {/* Confirmar senha */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Confirmar senha *</label>
        <input
          type="password"
          value={form.confirmPassword}
          onChange={(e) => onChange("confirmPassword", e.target.value)}
          placeholder="Repita sua senha"
          className={`mt-1 w-full rounded border px-3 py-2 ${
            errors.confirmPassword ? "border-red-500" : "border-gray-300"
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
        )}
      </div>

      {/* Pretensão Salarial */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Pretensão salarial (opcional)</label>
        <input
          type="text"
          value={form.salaryExpectation}
          onChange={(e) => onChange("salaryExpectation", e.target.value)}
          placeholder="R$ 5.000 - 7.000 ou valores específicos"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Regime */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Regime desejado *</label>
        <div className="mt-2 flex gap-4">
          {(["CLT", "PJ", "Indiferente"] as const).map((regime) => (
            <label key={regime} className="flex items-center gap-2">
              <input
                type="radio"
                name="contract"
                value={regime}
                checked={form.desiredContractType === regime}
                onChange={(e) => onChange("desiredContractType", e.target.value)}
                className="h-4 w-4"
              />
              <span className="text-sm">{regime}</span>
            </label>
          ))}
        </div>
        {errors.desiredContractType && (
          <p className="mt-1 text-sm text-red-600">{errors.desiredContractType}</p>
        )}
      </div>

      {/* Grupo Marajó */}
      <div>
        <label className="flex items-center gap-2">
          <input
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

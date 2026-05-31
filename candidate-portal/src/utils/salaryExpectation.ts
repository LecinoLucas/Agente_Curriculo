export const SALARY_REQUIRED_MESSAGE = 'Informe sua pretensão salarial para continuar.';
export const SALARY_INVALID_MESSAGE = 'Informe uma pretensão salarial válida.';

function parseSalaryExpectationAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let cleaned = trimmed.replace(/[^\d,.\-]/g, '');
  if (!cleaned) return Number.NaN;

  if (cleaned.includes('-')) {
    if (cleaned.startsWith('-')) return -1;
    cleaned = cleaned.split('-').find(Boolean) ?? cleaned;
  }

  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if ((cleaned.match(/\./g) ?? []).length > 1) {
    const parts = cleaned.split('.');
    cleaned = `${parts.slice(0, -1).join('')}.${parts.at(-1) ?? ''}`;
  }

  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

export function formatSalaryExpectationInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  const amount = Number.parseInt(digits, 10) / 100;
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).replace(/\xA0/g, ' ');
}

export function getSalaryExpectationError(value: string): string | null {
  if (!value.trim()) return SALARY_REQUIRED_MESSAGE;

  const amount = parseSalaryExpectationAmount(value);
  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    return SALARY_INVALID_MESSAGE;
  }

  return null;
}

export function normalizeSalaryExpectationForApi(value: string): string {
  const amount = parseSalaryExpectationAmount(value);
  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(SALARY_INVALID_MESSAGE);
  }

  return amount.toFixed(2);
}

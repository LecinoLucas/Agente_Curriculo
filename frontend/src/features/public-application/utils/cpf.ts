/**
 * Valida CPF usando o algoritmo módulo 11 (Luhn-style).
 * Retorna true se o CPF é válido, false caso contrário.
 */
export function validateCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");

  // Deve ter exatamente 11 dígitos
  if (digits.length !== 11) {
    return false;
  }

  // Rejeita CPFs com todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  // Valida primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  const digit1 = (sum * 10) % 11;
  if (digit1 === 10 || digit1 === 11) {
    if (parseInt(digits[9]) !== 0) return false;
  } else {
    if (parseInt(digits[9]) !== digit1) return false;
  }

  // Valida segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  const digit2 = (sum * 10) % 11;
  if (digit2 === 10 || digit2 === 11) {
    if (parseInt(digits[10]) !== 0) return false;
  } else {
    if (parseInt(digits[10]) !== digit2) return false;
  }

  return true;
}

/**
 * Formata CPF para o padrão XXX.XXX.XXX-XX
 */
export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length < 3) return digits;
  if (digits.length < 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length < 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Remove formatação de CPF (retorna apenas dígitos)
 */
export function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

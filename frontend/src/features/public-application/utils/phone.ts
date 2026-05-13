/**
 * Valida telefone brasileiro (celular).
 * Aceita 10 ou 11 dígitos.
 */
export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

/**
 * Formata telefone brasileiro.
 * Entrada: 11987654321 → Saída: (11) 98765-4321
 * Entrada: 1133334444 → Saída: (11) 3333-4444
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length < 2) return digits;
  if (digits.length < 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  // 11 dígitos
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Remove formatação de telefone (retorna apenas dígitos)
 */
export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

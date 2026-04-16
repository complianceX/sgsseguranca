export class CpfUtil {
  static validate(cpf: string): boolean {
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cleaned)) return false;

    // Validação dos dígitos verificadores
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleaned.charAt(i)) * (10 - i);
    }
    let digit = 11 - (sum % 11);
    if (digit >= 10) digit = 0;
    if (digit !== parseInt(cleaned.charAt(9))) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cleaned.charAt(i)) * (11 - i);
    }
    digit = 11 - (sum % 11);
    if (digit >= 10) digit = 0;
    if (digit !== parseInt(cleaned.charAt(10))) return false;

    return true;
  }

  static format(cpf: string): string {
    const cleaned = cpf.replace(/\D/g, '');
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  static normalize(cpf: string): string {
    return cpf.replace(/\D/g, '');
  }

  /**
   * Retorna apenas os 3 primeiros dígitos seguidos de asteriscos.
   * Uso exclusivo em logs — nunca expõe dados identificáveis.
   * Exemplo: "12345678900" → "123********"
   */
  static mask(cpf: string): string {
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length === 0) return '[cpf]';
    return cleaned.slice(0, 3) + '*'.repeat(Math.max(0, cleaned.length - 3));
  }
}

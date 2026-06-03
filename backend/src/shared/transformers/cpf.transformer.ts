import { ValueTransformer } from 'typeorm';
import { TransformFnParams } from 'class-transformer';

export class CpfTransformer implements ValueTransformer {
  to(value: string): string {
    return value ? value.replace(/\D/g, '') : value;
  }

  from(value: string): string {
    return value;
  }

  /**
   * Remove todos os caracteres não numéricos do CPF
   */
  static normalize(params: TransformFnParams): string {
    if (typeof params.value !== 'string') return String(params.value || '');
    return params.value.replace(/\D/g, '');
  }

  /**
   * Formata o CPF para o padrão 000.000.000-00
   */
  static format(cpf: string): string {
    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) return cpf;
    return cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
}

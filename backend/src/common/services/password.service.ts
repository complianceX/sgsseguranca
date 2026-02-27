import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  private readonly SALT_ROUNDS = this.getSaltRounds();
  private readonly MIN_LENGTH = this.getMinPasswordLength();

  private getSaltRounds(): number {
    const value = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
    if (!Number.isFinite(value)) {
      return 10;
    }
    return Math.min(Math.max(Math.floor(value), 10), 14);
  }

  private getMinPasswordLength(): number {
    const value = Number(process.env.PASSWORD_MIN_LENGTH || 10);
    if (!Number.isFinite(value)) {
      return 10;
    }
    return Math.min(Math.max(Math.floor(value), 8), 32);
  }

  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  validate(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const normalized = password.trim().toLowerCase();

    if (password.length < this.MIN_LENGTH) {
      errors.push(`Senha deve ter no mínimo ${this.MIN_LENGTH} caracteres`);
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Senha deve conter ao menos uma letra maiúscula');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Senha deve conter ao menos uma letra minúscula');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Senha deve conter ao menos um número');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Senha deve conter ao menos um caractere especial');
    }
    if (/\s/.test(password)) {
      errors.push('Senha não pode conter espaços');
    }

    const blocked = [
      'password',
      'senha',
      'admin',
      '123456',
      '12345678',
      'qwerty',
      'gandra2026',
    ];
    const stripped = normalized.replace(/[^a-z0-9]/g, '');
    if (blocked.some((item) => stripped === item)) {
      errors.push('Senha contém padrões comuns e inseguros');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

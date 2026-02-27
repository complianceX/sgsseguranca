import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsCNPJ(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCNPJ',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!value) return false;
          if (typeof value !== 'string') return false;

          const cnpj = value.replace(/\D/g, '');
          if (cnpj.length !== 14) return false;

          // Elimina CNPJs invalidos conhecidos
          if (/^(\d)\1+$/.test(cnpj)) return false;

          let size = cnpj.length - 2;
          let numbers = cnpj.substring(0, size);
          const digits = cnpj.substring(size);
          let sum = 0;
          let pos = size - 7;

          for (let i = size; i >= 1; i--) {
            sum += parseInt(numbers.charAt(size - i)) * pos--;
            if (pos < 2) pos = 9;
          }

          let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
          if (result !== parseInt(digits.charAt(0))) return false;

          size = size + 1;
          numbers = cnpj.substring(0, size);
          sum = 0;
          pos = size - 7;

          for (let i = size; i >= 1; i--) {
            sum += parseInt(numbers.charAt(size - i)) * pos--;
            if (pos < 2) pos = 9;
          }

          result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
          if (result !== parseInt(digits.charAt(1))) return false;

          return true;
        },
        defaultMessage() {
          return 'CNPJ inválido';
        },
      },
    });
  };
}

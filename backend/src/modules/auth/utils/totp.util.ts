import * as crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 3;

function normalizeBase32(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, '');
}

export function encodeBase32(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }

  return output;
}

export function decodeBase32(input: string): Buffer {
  const normalized = normalizeBase32(input);
  if (!normalized) {
    throw new Error('Segredo TOTP inválido');
  }

  let bits = '';
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Segredo TOTP inválido');
    }
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(size = 20): string {
  return encodeBase32(crypto.randomBytes(size));
}

export function generateRecoveryCode(): string {
  const raw = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function hotp(
  secret: string,
  counter: number,
  digits = DEFAULT_DIGITS,
): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const key = decodeBase32(secret);
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function generateTotpCode(params: {
  secret: string;
  time?: Date;
  digits?: number;
  periodSeconds?: number;
}): string {
  const digits = params.digits ?? DEFAULT_DIGITS;
  const periodSeconds = params.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const unixTime = Math.floor((params.time ?? new Date()).getTime() / 1000);
  const counter = Math.floor(unixTime / periodSeconds);
  return hotp(params.secret, counter, digits);
}

export function verifyTotpCode(params: {
  secret: string;
  code: string;
  time?: Date;
  digits?: number;
  periodSeconds?: number;
  window?: number;
}): boolean {
  const normalizedCode = String(params.code || '').replace(/\s|-/g, '');
  if (!/^\d{6,8}$/.test(normalizedCode)) {
    return false;
  }

  const digits = params.digits ?? DEFAULT_DIGITS;
  const periodSeconds = params.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const window = params.window ?? DEFAULT_WINDOW;
  const unixTime = Math.floor((params.time ?? new Date()).getTime() / 1000);
  const counter = Math.floor(unixTime / periodSeconds);

  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = hotp(params.secret, counter + offset, digits);
    if (
      crypto.timingSafeEqual(
        Buffer.from(candidate),
        Buffer.from(normalizedCode),
      )
    ) {
      return true;
    }
  }

  return false;
}

export function buildOtpauthUri(params: {
  issuer: string;
  label: string;
  secret: string;
  digits?: number;
  periodSeconds?: number;
}): string {
  const issuer = encodeURIComponent(params.issuer);
  const label = encodeURIComponent(`${params.issuer}:${params.label}`);
  const digits = params.digits ?? DEFAULT_DIGITS;
  const periodSeconds = params.periodSeconds ?? DEFAULT_PERIOD_SECONDS;

  return `otpauth://totp/${label}?secret=${params.secret}&issuer=${issuer}&digits=${digits}&period=${periodSeconds}`;
}

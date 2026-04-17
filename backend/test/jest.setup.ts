import { ConsoleLogger, Logger } from '@nestjs/common';

// Evita poluição de saída por logs esperados em cenários negativos.
Logger.overrideLogger(false);

const swallow = (..._args: unknown[]): void => undefined;

jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation(swallow);
jest.spyOn(ConsoleLogger.prototype, 'warn').mockImplementation(swallow);
jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation(swallow);
jest.spyOn(ConsoleLogger.prototype, 'debug').mockImplementation(swallow);
jest.spyOn(ConsoleLogger.prototype, 'verbose').mockImplementation(swallow);

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

const hasNestPrefix = (chunk: string | Uint8Array): boolean => {
  if (typeof chunk === 'string') return chunk.includes('[Nest]');
  return Buffer.from(chunk).toString('utf8').includes('[Nest]');
};

const writeShim = (
  original: typeof process.stdout.write,
): typeof process.stdout.write => {
  return ((chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
    if (hasNestPrefix(chunk)) {
      const callback = rest.find(
        (value): value is (error?: Error | null) => void =>
          typeof value === 'function',
      );
      callback?.(null);
      return true;
    }

    return original(chunk, ...(rest as [never, never]));
  }) as typeof process.stdout.write;
};

process.stdout.write = writeShim(originalStdoutWrite);
process.stderr.write = writeShim(originalStderrWrite);

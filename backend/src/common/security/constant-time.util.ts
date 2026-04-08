import { timingSafeEqual } from 'crypto';

export function constantTimeEquals(
  left: string | undefined,
  right: string | undefined,
): boolean {
  const leftBuffer = Buffer.from(left || '', 'utf8');
  const rightBuffer = Buffer.from(right || '', 'utf8');
  const maxLength = Math.max(leftBuffer.length, rightBuffer.length, 1);

  const paddedLeft = Buffer.alloc(maxLength);
  const paddedRight = Buffer.alloc(maxLength);

  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);

  return (
    timingSafeEqual(paddedLeft, paddedRight) &&
    leftBuffer.length === rightBuffer.length
  );
}

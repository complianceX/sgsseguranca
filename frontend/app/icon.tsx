import { ImageResponse } from 'next/og';

export const sizes = [192, 512];
export const contentType = 'image/png';

export default function Icon() {
  const size = 512;
  const barWidth = Math.round(size * 0.18);
  const barHeight = Math.round(size * 0.86);
  const barX = (size - barWidth) / 2;
  const barY = (size - barHeight) / 2;
  const barRadius = Math.round(barWidth * 0.2);

  return new ImageResponse(
    (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="100%" height="100%" fill="#1d4ed8" />
        <rect
          x={barX}
          y={barY}
          width={barWidth}
          height={barHeight}
          rx={barRadius}
          fill="#ffffff"
          transform={`rotate(45 ${size / 2} ${size / 2})`}
        />
        <rect
          x={barX}
          y={barY}
          width={barWidth}
          height={barHeight}
          rx={barRadius}
          fill="#ffffff"
          transform={`rotate(-45 ${size / 2} ${size / 2})`}
        />
      </svg>
    ),
    {
      width: size,
      height: size,
    }
  );
}

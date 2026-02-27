import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const dimension = size.width;
  const barWidth = Math.round(dimension * 0.18);
  const barHeight = Math.round(dimension * 0.86);
  const barX = (dimension - barWidth) / 2;
  const barY = (dimension - barHeight) / 2;
  const barRadius = Math.round(barWidth * 0.2);

  return new ImageResponse(
    (
      <svg
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="100%" height="100%" fill="#2563eb" />
        <rect
          x={barX}
          y={barY}
          width={barWidth}
          height={barHeight}
          rx={barRadius}
          fill="#ffffff"
          transform={`rotate(45 ${dimension / 2} ${dimension / 2})`}
        />
        <rect
          x={barX}
          y={barY}
          width={barWidth}
          height={barHeight}
          rx={barRadius}
          fill="#ffffff"
          transform={`rotate(-45 ${dimension / 2} ${dimension / 2})`}
        />
      </svg>
    ),
    size
  );
}

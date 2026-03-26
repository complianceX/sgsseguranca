import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '36px',
        background: 'linear-gradient(135deg, #1E5EFF 0%, #081523 100%)',
      }}
    >
      <div
        style={{
          width: '68%',
          height: '68%',
          borderRadius: '36% 36% 42% 42% / 30% 30% 52% 52%',
          border: '4px solid rgba(255, 255, 255, 0.6)',
          background: 'linear-gradient(180deg, #1E5EFF 0%, #0F3F86 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F6C453',
          fontFamily: 'Inter, Segoe UI, Roboto, Arial, sans-serif',
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: '1px',
        }}
      >
        SGS
      </div>
    </div>,
    size
  );
}

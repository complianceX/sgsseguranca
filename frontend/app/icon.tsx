import { ImageResponse } from 'next/og';

export const sizes = [192, 512];
export const contentType = 'image/png';

export default function Icon() {
  const size = 512;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '112px',
        background: 'linear-gradient(135deg, #1E5EFF 0%, #081523 100%)',
      }}
    >
      <div
        style={{
          width: '68%',
          height: '68%',
          borderRadius: '36% 36% 42% 42% / 30% 30% 52% 52%',
          border: '10px solid rgba(255,255,255,0.78)',
          background: 'linear-gradient(180deg, #1E5EFF 0%, #0F3F86 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F6C453',
          fontFamily: 'Inter, Segoe UI, Roboto, Arial, sans-serif',
          fontWeight: 800,
          fontSize: 104,
          letterSpacing: '2px',
        }}
      >
        GST
      </div>
    </div>,
    {
      width: size,
      height: size,
    }
  );
}

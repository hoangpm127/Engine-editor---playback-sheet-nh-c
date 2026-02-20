import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'XPSH Piano Editor',
  description: 'Sheet music editor and player',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
        {children}
      </body>
    </html>
  );
}

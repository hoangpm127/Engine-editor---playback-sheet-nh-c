import Link from 'next/link';

export default function HomePage() {
  const pages = [
    { href: '/editor',           label: '🎹 Editor',           desc: 'Soạn nhạc – chord, tie, pedal, triplet, 2 voices' },
    { href: '/player-demo',      label: '▶️ Player Demo',       desc: 'Phát thử file XPSH' },
    { href: '/practice-demo',    label: '🎯 Practice Demo',     desc: 'Luyện tập theo bản nhạc' },
    { href: '/integration-test', label: '🧪 Integration Tests', desc: 'Phase 8: validate + render + play 3 sample files' },
  ];

  return (
    <main style={{ maxWidth: 720, margin: '60px auto', padding: '0 24px' }}>
      <h1 style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 8 }}>XPSH Piano Engine</h1>
      <p style={{ color: '#64748b', marginBottom: 40 }}>Format v1.1 · Chord · Tie · Pedal · Triplet · 2 Voices</p>

      <div style={{ display: 'grid', gap: 16 }}>
        {pages.map(p => (
          <Link key={p.href} href={p.href} style={{
            display: 'block', padding: '20px 24px',
            background: '#fff', borderRadius: 12,
            border: '1px solid #e2e8f0', textDecoration: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            transition: 'box-shadow 0.15s',
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>{p.label}</div>
            <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{p.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

const APP_STORE_URL = 'https://apps.apple.com/us/app/beautiful-game-iq/id6814654300'

export default function AppInstallGate() {
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px 20px',
        boxSizing: 'border-box',
        color: '#f7faf9',
        background: 'radial-gradient(ellipse at top right, #164b42 0%, #0b1b20 48%, #070d11 100%)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section style={{ width: '100%', maxWidth: 520, textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 76,
            height: 76,
            margin: '0 auto 24px',
            display: 'grid',
            placeItems: 'center',
            borderRadius: 22,
            border: '1px solid rgba(74, 240, 177, .55)',
            background: 'linear-gradient(145deg, #153d35, #071b19)',
            boxShadow: '0 16px 48px rgba(0,0,0,.3)',
            color: '#4af0b1',
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: '-1.5px',
          }}
        >
          BG<span style={{ color: '#f7faf9' }}>iQ</span>
        </div>

        <p style={{ margin: '0 0 12px', color: '#4af0b1', fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>
          KNOW THE GAME. COACH THE MOMENT.
        </p>
        <h1 style={{ margin: '0 auto 16px', maxWidth: 480, fontSize: 'clamp(32px, 7vw, 48px)', lineHeight: 1.08, letterSpacing: '-1.8px' }}>
          Your coaching tools belong on the touchline.
        </h1>
        <p style={{ margin: '0 auto 28px', maxWidth: 430, color: '#c3d0d1', fontSize: 17, lineHeight: 1.65 }}>
          Beautiful Game IQ is available in the mobile app. Download it to manage your roster, build lineups, plan rotations, and run game day.
        </p>

        {isAndroid ? (
          <div style={{ margin: '0 auto 18px', padding: '16px 18px', maxWidth: 360, borderRadius: 14, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)' }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>Android app coming soon</strong>
            <span style={{ color: '#c3d0d1', fontSize: 14, lineHeight: 1.5 }}>The Android app is not available to download yet. Please check back soon.</span>
          </div>
        ) : (
          <a
            href={APP_STORE_URL}
            style={{
              display: 'inline-flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 54,
              padding: '0 24px',
              borderRadius: 14,
              background: '#4af0b1',
              color: '#062119',
              fontWeight: 800,
              fontSize: 16,
              textDecoration: 'none',
              boxShadow: '0 10px 28px rgba(0,0,0,.25)',
            }}
          >
            Download on the App Store
          </a>
        )}

        <p style={{ margin: '24px 0 0', color: '#91a5a7', fontSize: 13, lineHeight: 1.6 }}>
          Already installed? Open Beautiful Game IQ on your device to continue.
        </p>
        <nav style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 28, fontSize: 13 }}>
          <a href="/privacy.html" style={{ color: '#b5c6c7' }}>Privacy</a>
          <a href="/terms.html" style={{ color: '#b5c6c7' }}>Terms</a>
          <a href="/support.html" style={{ color: '#b5c6c7' }}>Support</a>
        </nav>
      </section>
    </main>
  )
}

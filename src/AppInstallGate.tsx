import './AppInstallGate.css'
import appIcon from '../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
import { useState } from 'react'

const APP_STORE_URL = 'https://apps.apple.com/us/app/beautiful-game-iq/id6814654300'
const features = [
  { number: '01', image: '/Gemini_Generated_Image_3kluzw3kluzw3klu%20(4).jfif', alt: 'Complete Game Lineups — four-quarter lineup planning' },
  { number: '02', image: '/Gemini_Generated_Image_3kluzw3kluzw3klu%20(2).jfif', alt: 'Plan Smarter Matchdays — player availability and formations' },
  { number: '03', image: '/Gemini_Generated_Image_3kluzw3kluzw3klu%20(3).jfif', alt: 'Live Game Control — real-time match tracking' },
  { number: '04', image: '/Gemini_Generated_Image_3kluzw3kluzw3klu%20(1).jfif', alt: 'Deep Season Analytics — team and player performance' },
]

function AppStoreButton() {
  return (
    <a className="install-gate-store-button" href={APP_STORE_URL} aria-label="Download on the App Store">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="25" height="25" fill="currentColor">
        <path d="M16.37 12.57c.02 2.14 1.88 2.85 1.9 2.86-.02.05-.3 1.04-.98 2.06-.59.88-1.2 1.76-2.16 1.78-.94.02-1.25-.57-2.33-.57-1.08 0-1.42.55-2.3.59-.92.03-1.62-.95-2.22-1.83-1.22-1.77-2.15-5-.9-7.18.62-1.08 1.73-1.77 2.93-1.79.91-.02 1.76.62 2.32.62.56 0 1.6-.77 2.7-.66.46.02 1.75.19 2.58 1.43-.07.04-1.54.9-1.53 2.69ZM14.6 6.34c.49-.6.82-1.44.73-2.27-.71.03-1.57.47-2.08 1.07-.46.53-.86 1.38-.75 2.19.79.06 1.61-.4 2.1-.99Z" />
      </svg>
      <span><small>Download on the</small><strong>App Store</strong></span>
    </a>
  )
}

export default function AppInstallGate() {
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
  const [imageErrors, setImageErrors] = useState<string[]>([])
  const hideImage = (src: string) => setImageErrors((current) => [...current, src])

  return (
    <main className="install-gate">
      <div className="install-gate-glow install-gate-glow-one" aria-hidden="true" />
      <div className="install-gate-glow install-gate-glow-two" aria-hidden="true" />
      <div className="install-gate-glow install-gate-glow-three" aria-hidden="true" />
      
      <header className="install-gate-header">
        <a className="install-gate-brand" href="/" aria-label="Beautiful Game IQ home">
          <span className="install-gate-mark"><img src={appIcon} alt="" /></span>
          <span className="install-gate-brand-name">Beautiful Game <b>IQ</b></span>
        </a>
        <span className="install-gate-header-note">THE SOCCER COACHING COPILOT</span>
      </header>

      <section className="install-gate-hero">
        <div className="install-gate-hero-copy">
          <p className="install-gate-eyebrow"><span /> KNOW THE GAME. COACH THE MOMENT.</p>
          <h1>Your coaching tools belong <em>on the touchline.</em></h1>
          <p className="install-gate-intro">Plan your lineup, balance playing time across all four quarters, and make smarter game-day decisions. Beautiful Game IQ brings your youth soccer coaching toolkit together in one mobile app.</p>
          <div className="install-gate-cta-row">
            {isAndroid ? (
              <div className="install-gate-android-note">
                <strong>Android app coming soon</strong>
                <span>We're working on bringing Beautiful Game IQ to Android. The iPhone app is available now.</span>
              </div>
            ) : (
              <AppStoreButton />
            )}
            <span className="install-gate-cta-caption">Built for youth soccer coaches. Ready for matchday.</span>
          </div>
          <div className="install-gate-proof-row">
            <span><i>✓</i> Four-quarter lineups</span>
            <span><i>✓</i> Matchday availability</span>
            <span><i>✓</i> Live game control</span>
          </div>
        </div>
        <div className="install-gate-hero-visual">
          <img
            className="install-gate-hero-artwork"
            src="/screen.png"
            alt="Beautiful Game IQ on three phones: lineup planning, live game control, and matchday availability"
            fetchPriority="high"
          />
        </div>
      </section>

      <section className="install-gate-features">
        <div className="install-gate-section-heading">
          <p className="install-gate-eyebrow">MADE FOR THE MOMENTS THAT MATTER</p>
          <h2>Less managing. <em>More coaching.</em></h2>
          <p>From lineup planning to the final whistle, keep your player rotations and tactical formations organized so you can focus on your team.</p>
        </div>
        <div className="install-gate-feature-grid">
          {features.map((feature) => (
            <article className="install-gate-feature-card" key={feature.number}>
              {!imageErrors.includes(feature.image) ? (
                <img src={feature.image} alt={feature.alt} loading="lazy" onError={() => hideImage(feature.image)} />
              ) : (
                <div className="install-gate-feature-fallback">
                  <span>{feature.number}</span>
                  <strong>{feature.alt.split(' — ')[0]}</strong>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="install-gate-bottom-cta">
        <div>
          <p className="install-gate-eyebrow">YOUR TEAM. YOUR TACTICS. YOUR GAME.</p>
          <h2>Make matchday <em>your advantage.</em></h2>
          <p>Get Beautiful Game IQ on your iPhone and take your coaching toolkit straight to the sideline.</p>
        </div>
        {isAndroid ? (
          <div className="install-gate-android-note">
            <strong>Android app coming soon</strong>
            <span>Beautiful Game IQ is currently available on iPhone.</span>
          </div>
        ) : (
          <AppStoreButton />
        )}
      </section>

      <footer className="install-gate-footer">
        <a className="install-gate-footer-brand" href="/">Beautiful Game <b>IQ</b></a>
        <span>PLAN. COACH. ADJUST. <strong>WIN TOGETHER.</strong></span>
        <nav aria-label="Legal and support">
          <a href="/privacy.html">Privacy</a>
          <a href="/terms.html">Terms</a>
          <a href="/support.html">Support</a>
        </nav>
      </footer>
    </main>
  )
}
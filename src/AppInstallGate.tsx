import './AppInstallGate.css'
import appIcon from '../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
import { useState } from 'react'

const APP_STORE_URL = 'https://apps.apple.com/us/app/beautiful-game-iq/id6814654300'
const SCREENSHOT_BASE = 'https://raw.githubusercontent.com/codysowa/beautiful-game-iq/staging%2Fclose-web-coaching-access/public'
const LINEUP = `${SCREENSHOT_BASE}/v2-full-game-lineup.jpg`
const AVAILABILITY = `${SCREENSHOT_BASE}/v2-matchday-availability.jpg`
const LIVE_GAME = `${SCREENSHOT_BASE}/v2-live-game-control.jpg`
const ANALYTICS = `${SCREENSHOT_BASE}/v2-season-analytics.jpg`

const features = [
  { number: '01', title: 'Build the Full-Game Lineup', description: 'Plan your formation and substitutions across the entire match.', image: LINEUP, alt: 'Beautiful Game IQ full-game lineup screen' },
  { number: '02', title: 'Manage Matchday Availability', description: 'See player availability and make informed rotation decisions.', image: AVAILABILITY, alt: 'Beautiful Game IQ matchday availability screen' },
  { number: '03', title: 'Control the Live Game', description: 'Follow match events and make adjustments as the game unfolds.', image: LIVE_GAME, alt: 'Beautiful Game IQ live game control screen' },
  { number: '04', title: 'Deep Season Analytics', description: 'Understand player and team performance over the season.', image: ANALYTICS, alt: 'Beautiful Game IQ season analytics screen' },
]

function AppStoreButton() {
  return (
    <a className="install-gate-store-button" href={APP_STORE_URL}>
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
          <p className="install-gate-intro">Plan your lineup. Balance playing time. Make smarter game-day decisions. Beautiful Game IQ brings your youth soccer coaching toolkit together in one mobile app.</p>
          <div className="install-gate-cta-row">
            {isAndroid ? <div className="install-gate-android-note"><strong>Android app coming soon</strong><span>We're working on bringing Beautiful Game IQ to Android. The iPhone app is available now.</span></div> : <AppStoreButton />}
            <span className="install-gate-cta-caption">Built for youth soccer coaches. Ready for game day.</span>
          </div>
          <div className="install-gate-proof-row">
            <span><i>✓</i> Four-quarter lineups</span><span><i>✓</i> Matchday availability</span><span><i>✓</i> Live game control</span>
          </div>
        </div>
        <div className="install-gate-hero-visual" aria-label="Preview of Beautiful Game IQ coaching tools">
          <div className="install-gate-orbit install-gate-orbit-one" />
          <div className="install-gate-phone install-gate-phone-back">
            <div className="install-gate-phone-top"><span /><span>LIVE GAME CONTROL</span><span>•••</span></div>
            {!imageErrors.includes(LIVE_GAME) && <img src={LIVE_GAME} alt="Beautiful Game IQ live game control" onError={() => hideImage(LIVE_GAME)} />}
          </div>
          <div className="install-gate-phone install-gate-phone-front">
            <div className="install-gate-phone-top"><span /><span>FULL-GAME LINEUP</span><span>•••</span></div>
            {!imageErrors.includes(LINEUP) && <img src={LINEUP} alt="Beautiful Game IQ full-game lineup" onError={() => hideImage(LINEUP)} />}
          </div>
          <div className="install-gate-visual-label"><span className="install-gate-live-dot" /><span><strong>Plan. Coach. Adjust.</strong><small>Everything you need for game day.</small></span></div>
        </div>
      </section>

      <section className="install-gate-features">
        <div className="install-gate-section-heading">
          <p className="install-gate-eyebrow">MADE FOR THE MOMENTS THAT MATTER</p>
          <h2>Less managing. <em>More coaching.</em></h2>
          <p>From lineup planning to the final whistle, keep the details organized so you can focus on your players.</p>
        </div>
        <div className="install-gate-feature-grid">
          {features.map((feature) => (
            <article className="install-gate-feature-card" key={feature.number}>
              <div className="install-gate-feature-image">
                {!imageErrors.includes(feature.image) ? <img src={feature.image} alt={feature.alt} loading="lazy" onError={() => hideImage(feature.image)} /> : <div className="install-gate-feature-fallback"><span>{feature.number}</span><strong>Beautiful Game IQ</strong></div>}
              </div>
              <div className="install-gate-feature-copy">
                <span className="install-gate-feature-number">{feature.number}</span><h3>{feature.title}</h3><p>{feature.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="install-gate-bottom-cta">
        <div><p className="install-gate-eyebrow">YOUR TEAM. YOUR TACTICS. YOUR GAME.</p><h2>Make game day <em>your advantage.</em></h2><p>Get Beautiful Game IQ on your iPhone and take your coaching toolkit to the sideline.</p></div>
        {isAndroid ? <div className="install-gate-android-note"><strong>Android app coming soon</strong><span>Beautiful Game IQ is currently available on iPhone.</span></div> : <AppStoreButton />}
      </section>

      <footer className="install-gate-footer">
        <a className="install-gate-footer-brand" href="/">Beautiful Game <b>IQ</b></a><span>PLAN. COACH. ADJUST. <strong>WIN TOGETHER.</strong></span>
        <nav aria-label="Legal and support"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/support.html">Support</a></nav>
      </footer>
    </main>
  )
}

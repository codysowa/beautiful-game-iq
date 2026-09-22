export default function Marketing() {
  return (
    <div className="marketing-page">
      <header className="marketing-header">
        <div className="marketing-nav">
          <div className="marketing-logo">BEAUTIFUL GAME IQ</div>
          <a className="marketing-login" href="/login">Coach Sign In</a>
        </div>
      </header>

      <main>
        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">YOUR AI COPILOT FOR GAME DAY</p>
            <h1>Know the game.<br />Coach the moment.</h1>
            <p className="marketing-lead">
              Beautiful Game IQ gives youth soccer coaches the tools to organize
              their team, build lineups, manage game day, and make smarter
              coaching decisions.
            </p>
            <div className="marketing-actions">
              <span className="app-store-button app-store-button-disabled">
                App Store — Coming Soon
              </span>
              <a className="marketing-secondary-button" href="/support/">
                Get Support
              </a>
            </div>
          </div>

          <div className="marketing-visual" aria-label="Beautiful Game IQ game day dashboard preview">
            <div className="marketing-device">
              <div className="marketing-device-bar">BEAUTIFUL GAME IQ</div>
              <div className="marketing-device-body">
                <p className="marketing-mini-label">NEXT GAME</p>
                <h2>Game Day</h2>
                <div className="marketing-game-card">
                  <strong>Your Team</strong>
                  <span>vs. Saturday's opponent</span>
                  <span>Lineup ready • 7v7</span>
                </div>
                <div className="marketing-mini-grid">
                  <div><strong>Roster</strong><span>Manage players</span></div>
                  <div><strong>Lineup</strong><span>Set formation</span></div>
                  <div><strong>Game Day</strong><span>Track live</span></div>
                  <div><strong>Analytics</strong><span>Review results</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-section">
          <p className="marketing-kicker">BUILT FOR COACHES</p>
          <h2>Spend less time managing. More time coaching.</h2>
          <p className="marketing-section-lead">
            Everything you need to keep your team organized before kickoff and
            stay focused when the game starts.
          </p>

          <div className="marketing-feature-grid">
            <article>
              <div className="marketing-feature-number">01</div>
              <h3>Team & Roster</h3>
              <p>Keep your team, players, availability, and season information organized in one place.</p>
            </article>
            <article>
              <div className="marketing-feature-number">02</div>
              <h3>Lineups & Formations</h3>
              <p>Build lineups, choose formations, and make changes without juggling paper or spreadsheets.</p>
            </article>
            <article>
              <div className="marketing-feature-number">03</div>
              <h3>Game Day</h3>
              <p>Track the lineup during the match and keep the information you need right at your fingertips.</p>
            </article>
            <article>
              <div className="marketing-feature-number">04</div>
              <h3>Coaching Assistance</h3>
              <p>Use AI-powered coaching assistance to help you think through the moments that matter.</p>
            </article>
          </div>
        </section>

        <section className="marketing-callout">
          <div>
            <p className="marketing-kicker">THE BEAUTIFUL GAME</p>
            <h2>Built for the sideline.</h2>
            <p>
              Whether you're the head coach or the assistant coach, Beautiful
              Game IQ is designed around the realities of youth soccer game day.
            </p>
          </div>
          <div className="marketing-callout-points">
            <span>✓ Team management</span>
            <span>✓ Player availability</span>
            <span>✓ Lineup tracking</span>
            <span>✓ Formation management</span>
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div>© 2026 Beautiful Game IQ</div>
        <div className="marketing-footer-links">
          <a href="/support/">Support</a>
          <a href="/privacy/">Privacy</a>
          <a href="/login">Coach Sign In</a>
        </div>
      </footer>
    </div>
  )
}

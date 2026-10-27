import './LandingPage.css'

const features = [
  { number: '01', title: 'Build smarter lineups', text: 'Set your formation, assign positions, and plan all four quarters before kickoff.' },
  { number: '02', title: 'Keep rotations fair', text: 'Use team playing-time rules and rotation guidance to help every player get their opportunity.' },
  { number: '03', title: 'Track the match live', text: 'Record goals, assists, shots, and saves while keeping your attention on the game.' },
  { number: '04', title: 'Know your team', text: 'Keep your roster, attendance, game history, and player stats together in one place.' },
]

export default function LandingPage() {
  return (
    <div className="marketing-site">
      <header className="marketing-nav">
        <a className="marketing-brand" href="/" aria-label="Beautiful Game IQ home">
          <img src="/bgiq-app-icon.png" alt="" />
          <span>BEAUTIFUL GAME <b>IQ</b></span>
        </a>
        <nav>
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a className="marketing-login" href="/login">Coach sign in</a>
        </nav>
      </header>

      <main>
        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <div className="marketing-eyebrow"><span /> BUILT FOR THE SIDELINE</div>
            <h1>Coach the game.<br /><em>Not the paperwork.</em></h1>
            <p className="marketing-lede">Your youth soccer season, organized in one place. Plan lineups, manage player rotations, track match events, and keep team rules in view—so you can focus on the kids and the game.</p>
            <div className="marketing-actions">
              <a className="marketing-primary" href="/login">Get started <span aria-hidden="true">→</span></a>
              <a className="marketing-secondary" href="#features">Explore the tools</a>
            </div>
            <div className="marketing-proof"><span>LINEUPS</span><i /> <span>ROTATIONS</span><i /> <span>LIVE MATCH TRACKING</span></div>
          </div>
          <div className="marketing-visual" aria-label="Beautiful Game IQ coaching tools preview">
            <div className="marketing-orbit orbit-one" /><div className="marketing-orbit orbit-two" />
            <div className="marketing-preview">
              <div className="preview-top"><span className="preview-dot" /> MATCH DAY <span className="preview-live">READY</span></div>
              <div className="preview-match"><div><small>YOUR TEAM</small><strong>BLUE KNIGHTS</strong></div><div className="preview-score">VS</div><div><small>NEXT OPPONENT</small><strong>RIVAL FC</strong></div></div>
              <div className="preview-pitch">
                <div className="pitch-line pitch-mid" /><div className="pitch-circle" />
                <span className="player p1">LW</span><span className="player p2">ST</span><span className="player p3">RW</span>
                <span className="player p4">LM</span><span className="player p5">CM</span><span className="player p6">RM</span>
                <span className="player p7">LB</span><span className="player p8">CB</span><span className="player p9">RB</span><span className="player p10">GK</span>
              </div>
              <div className="preview-bottom"><span>FORMATION</span><strong>3 – 3 – 1</strong><span className="preview-chip">LINEUP PLANNED</span></div>
            </div>
            <div className="marketing-float float-rotation"><span className="float-check">✓</span><div><strong>Rotations in view</strong><small>Keep playing time on track</small></div></div>
            <div className="marketing-float float-live"><span className="float-live-dot" /><div><strong>Match day tools</strong><small>Events, stats, and history</small></div></div>
          </div>
        </section>

        <section className="marketing-stats" aria-label="Product benefits">
          <div><strong>One place</strong><span>for your coaching workflow</span></div>
          <div><strong>Every quarter</strong><span>planned before kickoff</span></div>
          <div><strong>More game time</strong><span>less sideline admin</span></div>
        </section>

        <section className="marketing-features" id="features">
          <div className="marketing-section-heading"><div className="marketing-eyebrow"><span /> THE COACHING TOOLKIT</div><h2>More prepared before kickoff.<br /><em>More present during the game.</em></h2><p>Practical tools for the real work of coaching youth soccer.</p></div>
          <div className="marketing-feature-grid">
            {features.map((feature) => <article className="marketing-feature-card" key={feature.number}><span>{feature.number}</span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}
          </div>
        </section>

        <section className="marketing-how" id="how-it-works">
          <div><div className="marketing-eyebrow"><span /> A SIMPLER GAME DAY</div><h2>Get organized.<br /><em>Then get out there.</em></h2></div>
          <div className="marketing-steps"><p><b>01</b><span><strong>Set up your team</strong><small>Add your roster, format, and team rules.</small></span></p><p><b>02</b><span><strong>Plan the match</strong><small>Build a lineup and map out player rotations.</small></span></p><p><b>03</b><span><strong>Coach in the moment</strong><small>Track the game and review your team’s history afterward.</small></span></p></div>
        </section>

        <section className="marketing-cta"><div><div className="marketing-eyebrow"><span /> YOUR NEXT MATCH STARTS HERE</div><h2>Bring a little more IQ<br />to game day.</h2><p>Spend less time juggling notes. Spend more time coaching.</p></div><a className="marketing-primary" href="/login">Open Beautiful Game IQ <span aria-hidden="true">→</span></a></section>
      </main>
      <footer className="marketing-footer"><a className="marketing-brand" href="/"><img src="/bgiq-app-icon.png" alt="" /><span>BEAUTIFUL GAME <b>IQ</b></span></a><span>Know the game. Coach the moment.</span><div><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/support.html">Support</a><a href="/login">Coach sign in</a></div></footer>
    </div>
  )
}

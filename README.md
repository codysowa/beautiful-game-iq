# Beautiful Game IQ

**Know the game. Coach the moment.**

Your AI copilot for game day. Beautiful Game IQ is a soccer-first coaching assistant built for youth coaches who need practical help before, during, and after the match.

## App store positioning

Beautiful Game IQ helps youth soccer coaches plan lineups, manage rotations, track attendance and playing time, prepare for game day, and use Coach Assist to make better decisions on the sideline.

**Short description:** Soccer coaching help when you need it most.

**Promotional text:** Plan the game. Run the game. Keep your focus on the players.

**Long description:**
Beautiful Game IQ is a practical AI-powered assistant for youth soccer coaches. Build your roster, set team rules, manage attendance, create game plans, organize rotations, track what happens during the match, and get Coach Assist recommendations without taking your eyes off the game.

It is designed for real youth soccer coaching—not complicated analytics for analysts. Beautiful Game IQ puts the information you need on the sideline, where decisions happen.

## Current formats

6v6, 7v7, 9v9, and 11v11.

## Bug reports

The app includes Report a Bug. Reports are addressed to the team owner and include useful diagnostic context so issues can be reproduced and fixed quickly.

## Website design state — preserve these decisions

The public marketing/install homepage is implemented in `src/AppInstallGate.tsx` and `src/AppInstallGate.css`. Treat the current deployed layout as the approved baseline; do not replace or redesign the lower sections when making a targeted hero change.

- **Hero:** dark teal/black background, left-side headline and copy, green App Store CTA, short benefit checklist, and the single `/screen.png` three-phone stadium hero artwork on the right. Keep the image blended into the background with the existing soft-edge treatment; do not substitute analytics screenshots or build overlapping phone cards in CSS.
- **Feature section:** retain the “Less managing. More coaching.” heading and all four full feature-art cards below the hero.
- **Feature artwork:** the four existing assets in `public/` are referenced by `src/AppInstallGate.tsx`. Preserve their full image content. Do not force a fixed aspect ratio or use `object-fit: cover` on the feature-card artwork, because that crops the screenshots. Keep the natural image proportions / no-crop behavior that was fixed in commit `43fd662`.
- **CTA destinations:** the App Store buttons should continue to link to the existing App Store listing. The Android message is intentional until an Android release exists.
- **When editing:** make the smallest targeted change possible, preserve both hero and feature section, run `npm run build` before deploying, and verify the deployed page at desktop and mobile sizes. Avoid reverting the lower section when changing the hero.


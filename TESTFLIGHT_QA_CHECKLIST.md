# Beautiful Game IQ 2.0.0 — TestFlight QA checklist

Use this checklist on a real iPhone through TestFlight before submitting the release to App Review. Test on both a smaller iPhone and a current larger model if possible. Record device/iOS version and screenshots for any defect.

## Account and navigation
- [ ] Sign in with an existing coach account.
- [ ] Sign out and sign back in.
- [ ] Test forgot-password and account creation flows without using a production coach account for destructive tests.
- [ ] Confirm Home, Roster, Games, and Help navigation works and the selected tab is clear.
- [ ] Check the app icon, launch, status bar/safe areas, keyboard behavior, and scrolling.

## Team and roster
- [ ] Create a test team and verify the details persist after leaving and reopening the page.
- [ ] Add, edit, and remove a test player.
- [ ] Confirm jersey numbers and player names appear consistently in roster, lineup, and live game.
- [ ] Edit Coach Knowledge and verify saved values persist.
- [ ] Check empty states and long player/team names on mobile.

## Games and lineup
- [ ] Schedule a test game, edit it, and confirm it appears in the right section.
- [ ] Open the lineup builder and confirm the selected formation and player positions are correct.
- [ ] Move/swap players and bench a player; confirm there are no duplicate players or missing roster members.
- [ ] Set captains and verify the captain indicator appears only on the selected captain(s), consistently in lineup and live game.
- [ ] Verify the goalkeeper, player count, and formation positions for the team's game format.
- [ ] Save, leave, reopen, and verify lineup changes persist.

## Live game
- [ ] Start a test game and move through quarters/periods.
- [ ] Record a goal for each side and a shot; confirm score and event history.
- [ ] Test substitutions/rotations and confirm player availability and playing-time tracking update correctly.
- [ ] Navigate away and back, then confirm the game state is retained.
- [ ] Complete a test game and verify it appears under completed games with the expected result.

## Help and analytics
- [ ] Open each Getting Started lesson and move backward/forward through lessons.
- [ ] Confirm help content, screenshots, and action links fit the screen and do not cover navigation.
- [ ] Review analytics for the test game and confirm there are no crashes, blank screens, or unreadable labels.

## Visual and reliability checks
- [ ] Check every page in portrait orientation and with the keyboard open.
- [ ] Confirm dark BGIQ styling is consistent; look for any unexpected white legacy panels, clipped text, horizontal overflow, or inconsistent buttons.
- [ ] Test with a weak or interrupted connection and confirm errors are understandable and recoverable.
- [ ] Force-quit and relaunch; confirm saved data remains intact.
- [ ] Confirm there is no accidental navigation to production-only or staging/debug screens.
- [ ] Remove test data or use a dedicated test team/account before broader testing.

## Before App Store submission
- [ ] No crash, data loss, or blocker remains open.
- [ ] Verify the app's privacy details, subscription/ad behavior, and permissions match the actual build.
- [ ] Complete App Store Connect's version metadata and export-compliance questions as applicable.
- [ ] Review Apple's TestFlight feedback and crash reports before submitting.

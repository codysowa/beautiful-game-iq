# Native iOS configuration notes

These settings are intentionally kept out of the web app and applied by Capacitor/Xcode when the iOS project is generated.

## Identity
- App name: Beautiful Game IQ
- Bundle ID: com.beautifulgameiq.app
- URL scheme: beautifulgameiq
- Version: 1.0.0

## Required iOS settings
- Add the AdMob iOS application identifier to the generated iOS app's Info.plist.
- Add NSUserTrackingUsageDescription with a clear explanation that tracking permission is requested to support personalized advertising.
- Confirm the generated URL scheme is beautifulgameiq so Supabase password-reset links can return to the app.
- Set the App Store privacy/age-rating metadata in App Store Connect.
- Use the production RevenueCat iOS public SDK key and the production AdMob iOS banner ad-unit ID only after those products are created.
- Never put RevenueCat secret keys or other server credentials in the app.

## Subscription
- RevenueCat entitlement: premium_no_ads
- Premium removes advertising only.
- All existing coaching features remain available to free users.

## Before archive
1. Run npm install.
2. Run npm run build.
3. Run npx cap sync ios.
4. Open the generated iOS project in Xcode.
5. Confirm signing/team, bundle ID, version/build, URL scheme, AdMob Info.plist values, and tracking permission text.
6. Test sign-in, password reset, bug reporting, ads/consent, Premium purchase, Restore Purchases, and logout/login before App Store submission.

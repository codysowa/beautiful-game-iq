# Beautiful Game IQ — App Store submission notes

## App identity
- App name: Beautiful Game IQ
- Bundle ID: com.beautifulgameiq.app
- Version: 1.0.0
- Tagline: Know the game. Coach the moment.
- Description: Your AI copilot for game day. Manage teams, build lineups, track games live, review playing time, and use Coach Assist to make game-day decisions easier.
- Support URL: https://beautifulgameiq.com/support.html
- Privacy Policy URL: https://beautifulgameiq.com/privacy.html
- Terms URL: https://beautifulgameiq.com/terms.html

## Business model
- Free app: all core features included, advertising supported.
- Premium subscription: removes ads; does not lock core coaching features.
- Apple subscription product should be configured in App Store Connect and connected to the RevenueCat entitlement named premium_no_ads.

## App Store Connect setup still required
1. Create the app record using bundle ID com.beautifulgameiq.app.
2. Create the Premium subscription product and set its duration/price.
3. Configure the subscription in RevenueCat and place it in the current Offering.
4. Configure the RevenueCat entitlement exactly as premium_no_ads.
5. Create the iOS AdMob app and banner ad unit.
6. Add the AdMob iOS App ID to the native iOS configuration when Xcode is available.
7. Add the RevenueCat iOS public SDK key through the native build environment.
8. Complete App Store Connect App Privacy answers.
9. Complete age rating and content questionnaire.
10. Add screenshots for the required iPhone/iPad display sizes.
11. Add review notes explaining that Premium removes ads and that the free version retains the full feature set.
12. Provide demo/test account credentials for App Review if required for account-gated functionality.

## Privacy / consent
The app requests applicable AdMob consent and, where applicable, Apple's App Tracking Transparency authorization before requesting ads. The final App Store privacy answers must match the actual configured AdMob/RevenueCat behavior.

## Native configuration
The repository's Capacitor config already defines appId com.beautifulgameiq.app, appName Beautiful Game IQ, and webDir dist. The native iOS project itself must be generated/synchronized on a Mac with Xcode.

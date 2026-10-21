# TestFlight release candidate — Beautiful Game IQ 2.0.0

This release pipeline is restricted to the staging branch `dev/v2-backoffice-redesign-20261021`. It does not merge, deploy, or write to `main` or production.

## What the workflow does

1. Runs `npm ci`, `npm run build`, and `npx cap sync ios`.
2. Signs the iOS app using the Apple Distribution certificate and App Store provisioning profile stored as GitHub Actions secrets.
3. Exports an IPA for App Store Connect.
4. Uploads the IPA as a downloadable Actions artifact and submits the same build to TestFlight.
5. Increments the iOS build number for each workflow run. The marketing version is 2.0.0.

Run **Actions → Build BGIQ TestFlight Release → Run workflow** on the staging branch only after configuring the secrets below.

## Required GitHub Actions secrets

Add these under the repository's **Settings → Secrets and variables → Actions**. Never commit signing keys, certificates, passwords, or profiles to the repository.

| Secret | Value |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64-encoded Apple Distribution `.p12` certificate |
| `IOS_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64-encoded App Store provisioning profile for `com.beautifulgameiq.app` |
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect API key ID |
| `APP_STORE_CONNECT_API_ISSUER_ID` | App Store Connect API issuer ID |
| `APP_STORE_CONNECT_API_KEY_BASE64` | Base64-encoded private key file `AuthKey_XXXXXXXXXX.p8` |

Create the distribution certificate and App Store provisioning profile in the Apple Developer account. The profile must match bundle ID `com.beautifulgameiq.app`, the Team ID, and the distribution certificate. The App Store Connect API key must have permission to upload builds (App Manager or an appropriate higher role).

On macOS, base64-encode the binary files without changing them:

```sh
base64 -i distribution.p12 | pbcopy
base64 -i profile.mobileprovision | pbcopy
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

Paste each output into its matching GitHub secret. Keep the private key and certificate secure.

## TestFlight checklist

- Confirm the app record exists in App Store Connect for bundle ID `com.beautifulgameiq.app`.
- Confirm the app's agreements and TestFlight setup are complete.
- Configure all seven secrets above.
- Run the workflow from `dev/v2-backoffice-redesign-20261021`.
- Watch **Actions** for build/sign/upload status. Download the IPA from the successful run's **Artifacts** section if you want to retain a copy.
- After Apple's processing finishes, invite internal testers in App Store Connect → TestFlight. External testing may require Beta App Review.

A successful upload does not mean Apple has finished processing the build. TestFlight processing and tester availability happen afterward.

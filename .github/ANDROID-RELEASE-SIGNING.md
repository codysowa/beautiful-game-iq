# Android release signing (Windows)

Keep the upload keystore and its passwords private. Never commit the keystore or put passwords in source files or chat. Back up the keystore securely; losing it can complicate future updates.

## 1. Create the upload key on your PC

Install a JDK if `keytool` is not available. In PowerShell, run this in a private folder where you want to store the key:

```powershell
keytool -genkeypair -v -keystore upload-keystore.jks -alias bgiq-upload -keyalg RSA -keysize 2048 -validity 10000
```

Choose a strong keystore password and key password and store both securely. The prompts ask for certificate details. Keep the resulting `upload-keystore.jks` file in a safe backup location. Do not upload it to the repository.

## 2. Add repository Actions secrets

In GitHub, open the repository's **Settings → Secrets and variables → Actions → New repository secret**. Add these four secrets:

- `ANDROID_KEYSTORE_BASE64`: In PowerShell, run the following command from the folder containing the keystore, then paste the clipboard contents into this secret:
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("upload-keystore.jks")) | Set-Clipboard
  ```
- `ANDROID_KEYSTORE_PASSWORD`: the keystore password
- `ANDROID_KEY_ALIAS`: `bgiq-upload`
- `ANDROID_KEY_PASSWORD`: the key password

Treat these values as credentials. Do not share them in issues, logs, or chat.

## 3. Build the signed bundle

Open **Actions → Android Release Bundle Build → Run workflow**, select `android/google-play-prep`, and run it. Download the `beautiful-game-iq-android-release` artifact only after the run succeeds. If the four secrets are absent, the workflow intentionally builds an unsigned validation bundle instead.

The generated bundle is an upload-key-signed Android App Bundle for Play Console. Complete Play App Signing setup in Play Console when prompted.

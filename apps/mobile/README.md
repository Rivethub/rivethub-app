# RivetHub phone app

One Expo app for Android and iOS. It is a memory manager for a RivetHub hub: Today, Review, Library, and Search, plus entity, topic, and session screens.

Android is the build that this tree produces. iOS needs a Mac.

## Install the debug APK

The debug APK is:

`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

On a computer with `adb` in `PATH`:

```bash
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

The APK is debug-signed. It is not published to a store.

## Trust the Rivet CA

Phil's hub uses a private certificate authority. Android trusts that CA only after two steps:

1. Copy `$HOME/.rivetos/mesh/ca-chain.pem` onto the phone.
2. Install it as a CA certificate: Settings → Security → Encryption & credentials → Install a certificate → CA certificate.

The app's network security config trusts user-installed CAs. A system CA is not required.

The emulator reaches this machine at `https://10.0.2.2:5174`. A phone on the LAN must use the machine's LAN URL. `127.0.0.1` on the phone is the phone itself. <!-- secret-scan-allow: Android Emulator host loopback alias -->

Pair by typing that URL, or scan a QR whose contents are `rivethub://pair?d=<base64url JSON {url, name, token?}>`. Hubs are stored in the platform secure store, one hub per key.

Requests time out after 15 seconds. The screen shows saved memory when it has some, otherwise sample memory, and says which.

## Rebuild

Java is Temurin 25 from mise. Put that JDK's `bin` on `PATH`, because the `java` shim does not pick a version on its own. The Android SDK is under `~/Android/Sdk`: command-line tools, platform-tools, platforms android-35, android-36 and android-37, build-tools 35.0.0, 36.0.0 and 37.0.0, and NDK 27.1.12297006. This app compiles with SDK 37, build-tools 37.0.0 and that NDK. Gradle 9.4.1 accepts Temurin 25.

```bash
export JAVA_HOME="$(mise where java@temurin-25.0.5+8.0.LTS)"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="$HOME/Android/Sdk"
cd apps/mobile
pnpm exec expo prebuild --platform android --no-install
cd android && ./gradlew assembleDebug
```

## iOS

This session did not prebuild or sign iOS. On a Mac, `pnpm exec expo prebuild --platform ios` and an Xcode build are still required. The pairing scheme `rivethub` is already in `app.json`. Secure storage uses the Keychain. iOS must fully trust the Rivet root in Settings before the hub URL will load.

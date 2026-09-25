# Lunara Lens for Android

A Trusted Web Activity: the Android package that opens
`https://lunarasociety.com/lens/app.html` full screen in Chrome, with the
camera and microphone permissions Chrome grants the site. There is no
second copy of the app to keep in step; updating the web app updates the
Android app.

## Build

    export ANDROID_HOME=/path/to/android-sdk
    export LENS_KEYSTORE=/secure/path/lunara-lens-release.jks
    export LENS_KEYSTORE_PASSWORD=...
    gradle assembleRelease
    cp app/build/outputs/apk/release/app-release.apk ../lens/lunara-lens.apk

Raise `versionCode` in `app/build.gradle` for every release.

## The signing key

The release key is **not** in this repository and never should be. Its
SHA-256 certificate fingerprint is published in
`/.well-known/assetlinks.json`, which is what lets Android open the app
without a browser bar. Losing the key means the next version cannot be
installed over the current one, so keep it and its password somewhere
safe and backed up.

    C9:B6:F4:80:51:C7:60:4F:7B:2E:3D:F3:B1:BF:93:29:EC:D9:BA:F8:93:3F:54:27:2E:C8:69:3D:23:6D:73:2F

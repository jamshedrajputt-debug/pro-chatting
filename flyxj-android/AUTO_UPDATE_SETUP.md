# FLYXJ Android app updates — live release channel

**Live release:** https://github.com/jamshedrajputt-debug/pro-chatting/releases/tag/flyxj-android-v4

**Android package:** `com.flyxj.orders.downloadfix`

The permanent signing certificate SHA-256 is:
`94bf144083c49a37f9e74ae40541fabc9372aabc01ac9c20e58ba94d7d9e0825`.

The **private** signing key is NOT in GitHub. It is kept offline in the private `FLYXJ_Permanent_Signing_Backup_PRIVATE.zip` given to the owner. Keep it backed up. Without that same key future APKs cannot update the installed app in place.

## App behavior

- The native `UpdateManager` checks `https://api.github.com/repos/jamshedrajputt-debug/pro-chatting/releases/latest` when the Android app starts.
- If the latest tag is `flyxj-android-vN` and N > installed `versionCode`, the app offers **Update Now** and **Later**.
- Update Now downloads the official release APK using Android DownloadManager and opens Android's installer. Android asks for installation approval, which cannot be bypassed.
- Changes to the hosted website/Render application load automatically in the existing APK; they do not require a new Android APK release.

## Updating the native Android APK

1. Edit Java/manifest code, increment `versionCode` in `flyxj-android/app/build.gradle`.
2. Run `.github/workflows/flyxj-android-apk.yml` on branch `flyxj-android-apk-build-20261123`. It builds an **unsigned release APK**.
3. Sign the unsigned APK offline with `apksigner` and the **same private FLYXJ permanent JKS signing key**, enabling v1/v2/v3. Run `apksigner verify --verbose --print-certs` and check that the certificate digest equals the value shown above.
4. Gzip and Base64-encode the signed APK; add `flyxj-android/releases/FLYXJ-vN.apk.gz.b64.part01` (split into multiple `partNN` files only if needed).
5. Commit `flyxj-android/releases/FLYXJ-vN.ready` to trigger `.github/workflows/flyxj-publish-offline-signed-apk.yml`, which verifies APK signature, expected package/version and publishes the GitHub Release.
6. Verify the public GitHub release and test in-app update on a real Android phone. Never republish an existing versionCode; increment it.

**One-time migration:** The original v3 APK used a different debug signing certificate. To install the permanent-key v4 baseline, Android may require uninstalling v3 **once**. This can clear the app's local login/session; the live hosted orders remain on the server. Once v4 is installed, future updates use the same signing certificate and should update over the installed app.

**Security:** Do not commit/publish the private JKS, passwords or Base64-encoded keystore. Only the already-signed APK is public. Never accept update APKs from unexpected hosts.


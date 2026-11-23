# FlyXJ Android in-app updates

- APK package: `com.flyxj.orders.downloadfix`.
- On app launch: `UpdateManager` reads the GitHub latest Release, requires a tag of the form `flyxj-android-vN`, and compares N to the installed Android `versionCode`.
- If newer: shows **Update Now** / **Later**, downloads the APK with Android DownloadManager, and launches the Android installer. Android user approval is required.
- App release files are published by `.github/workflows/flyxj-android-signed-release.yml` with a **permanent signing key**.
- Website updates continue to be loaded from the existing Render server and do not need an APK release.

## One-time secure signing configuration

In GitHub repository Settings > Secrets and variables > Actions, set these private secrets from the offline signing backup:

- `FLYXJ_KEYSTORE_B64`: Base64 contents of the permanent signing JKS keystore
- `FLYXJ_STORE_PASSWORD`: password for that key store
- `FLYXJ_KEY_PASSWORD`: key password
- Alias is fixed to `flyxj`.

Do not commit the key, passwords or Base64 to the public GitHub repository.

Run the **Publish signed FlyXJ Android APK update** workflow. It creates `flyxj-android-v4` release and a signed APK. Install **this signed v4 once**. The existing v3 debug APK has a different certificate and may require uninstalling first (app-local storage may reset). Future Android releases signed with this same key and higher versionCode can be installed in place by tapping Update Now, without uninstalling.

A debug `assembleDebug` APK from the separate CI workflow **must not** be used as production baseline because its debug signing certificate may change.

## Future changes

1. Edit `flyxj-android` source and increment `versionCode` (5, 6, 7...).
2. Push to `flyxj-android-apk-build-20261123`; the signed-release workflow builds and publishes the new signed APK.
3. Users opening their installed release see the update prompt automatically.

Keep a secure offline backup of the permanent JKS and passwords. If the key is lost, updates will require reinstalling the app under a different key.

# FlyXJ — Safe data migration plan (NOT LIVE YET)

## Do this before any Render redeploy

1. Log into the live FlyXJ dashboard as User B.
2. Open Staff & Backup and select Download private backup.
3. Store the backup JSON offline and keep an extra copy. It contains private customer files, chat, and staff password hashes.
4. Verify that the JSON includes orders, directChat, photos, pdfs, chat_photos and staff accounts. A missing binary data field cannot be magically restored later.

## Set up Supabase

The Supabase account is connected but its project list is currently empty. Choose the target Supabase organization and obtain the project cost quote first.
Create a free project if available. Execute the staged schema.sql only when the project is active and the user has approved the organization.
The schema uses a private bucket and table access limited to the trusted service role. Keep the privileged key on the Render backend only.

## Migration and safe cutover

Develop an asynchronous durable data store for orders, messages and staff, plus a private file store for the dress photographs and PDFs.
Import the complete backed-up order data and binary attachments. Compare item counts and open example files for User A and User B.
Only after verifying migration and permissions, change the server storage setting and deploy a tested build. Check that a second redeploy preserves all records.

Creating the schema does not import legacy JSON files or protect current temporary Render storage. The live server must not be redeployed before a verified backup.

## Android

The previously distributed tiny test APK did not include native Android Back behavior. A separate new Android wrapper is being built from the flyxj-android-native source.
Order Sheet improvements are staged under flyxj-v4-safe-migration; they must not be called live until an explicitly authorized safe cutover.
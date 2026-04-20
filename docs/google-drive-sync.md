# Google Drive Sync Setup

MetisNote supports Google Drive sync through the hidden `appDataFolder` space.

## Authentication model

- Authorization uses Google desktop OAuth with PKCE.
- The desktop client stores a public OAuth client ID, but does not require a client secret.
- The browser flow opens in the system browser and returns to the app through a local loopback callback.

## Google Cloud preparation

1. Open Google Cloud Console and enable the Drive API for your project.
2. Create an OAuth client with the `Desktop app` application type.
3. Copy the generated OAuth client ID.

## In-app configuration

1. Open Settings > Sync.
2. Select `Google Drive` as the sync method.
3. Paste the OAuth client ID.
4. Click the authorization button and complete the browser flow.
5. Save the sync settings.

## Storage behavior

- Sync data is stored inside Google Drive `appDataFolder`.
- Files are hidden from the normal Drive file list.
- MetisNote uses the fixed namespace `metis-note` inside that hidden storage space.
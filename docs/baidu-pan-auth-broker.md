# Baidu Pan Auth Broker

Metis Note now assumes a brokered Baidu Pan authorization flow instead of storing the Baidu app secret in the desktop client.

## Why

- The documented Baidu OAuth flow requires `client_secret` both when exchanging the authorization code and when refreshing the token.
- The public Baidu OAuth docs currently describe `authorization_code` with `client_id`, `client_secret`, and `redirect_uri`, plus refresh with `client_secret` again.
- The same docs do not document `code_challenge`, `code_challenge_method`, `code_verifier`, or PKCE-style public-client parameters.
- Based on the current published docs, PKCE should be treated as unsupported.

## Runtime Layout

The desktop app opens a browser to the broker.

The broker:

1. Redirects the browser to Baidu OAuth.
2. Receives Baidu's callback on the broker callback URL.
3. Exchanges the authorization code using the broker-held app secret.
4. Redirects the browser back to the local app callback with a one-time `broker_code`.
5. Lets the desktop app exchange that one-time code for tokens.
6. Refreshes Baidu access tokens later without exposing the app secret to the desktop app.

## Local Development

Set these environment variables before starting the broker:

```bash
export BAIDU_PAN_APP_KEY="your-app-key"
export BAIDU_PAN_APP_SECRET="your-app-secret"
export PORT=62900
export HOST=127.0.0.1
export METIS_BAIDU_PAN_BROKER_PUBLIC_URL="http://127.0.0.1:62900"
```

Run the broker:

```bash
npm run dev:baidu-pan-broker
```

Register this callback URL in Baidu Open Platform:

```text
http://127.0.0.1:62900/oauth/baidu-pan/callback
```

The desktop app expects the broker base URL from:

- `METIS_BAIDU_PAN_AUTH_BROKER_URL`
- default fallback: `http://127.0.0.1:62900`

## Production Notes

- Put the broker behind HTTPS.
- Keep `BAIDU_PAN_APP_SECRET` only on the broker.
- Persist pending auth sessions and one-time exchange records in a shared store if you run multiple broker instances.
- Restrict the local callback redirect target to loopback addresses only.
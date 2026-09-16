# ADR-020: Signing in with Google, and uploaded avatars

- Status: Accepted
- Date: 2026-09-16

## Context

The redesigned sign-in page offers SSO, and people want to change their profile picture from the
app. Two facts shape both features:

- Registration does not verify email addresses. Anyone can register any address.
- The object storage bucket is private (ADR-017): its URLs are presigned and short-lived, and an
  `<img>` tag cannot send credentials.

## Decision

1. **The OAuth code flow runs in the web server (BFF), not in the browser.** It keeps `state`, the
   PKCE verifier and the `nonce` in a short-lived httpOnly cookie, exchanges the code with Google
   using the client secret, and sends only the resulting ID token to the API. The API never sees
   the client secret, and the browser never sees any token but its own session.

2. **The API verifies the ID token itself** with jose against Google's published keys: signature,
   issuer, audience (`GOOGLE_CLIENT_ID`), expiry, and the `nonce` of that sign-in request. Without
   `GOOGLE_CLIENT_ID` the endpoint answers 404 `SSO_NOT_CONFIGURED`, so the feature is off by
   default.

3. **Identities live in `user_identities`**, unique per (provider, subject). Three paths:
   - the identity is already connected: sign in;
   - the email is unknown: create the account (it joins the default organization like any
     registration) with a password nobody knows;
   - the email already has an account: answer 409 `ACCOUNT_LINK_REQUIRED` with a ten-minute link
     token. `/auth/oauth/link` connects the identity once that account's password is confirmed.

   The third path is the security decision. Linking by verified email alone would let someone
   register a colleague's address first and then inherit the account when that colleague signs in
   with Google (pre-hijacking). Confirming the password proves the account is theirs.

4. **Avatars are ordinary uploads.** `users.avatar_file_id` points at the file and `avatar_url`
   points at `/api/v1/avatars/{id}`, which redirects to a presigned URL, is cacheable for an hour
   and carries `Cross-Origin-Resource-Policy: cross-origin` so the web app can show it. Only files
   that are someone's avatar are served there; every other upload stays private. The route sits
   outside the global rate limit because one directory page shows dozens of pictures.

5. **Cleanup knows about avatars.** The orphan job skips files used as an avatar, so a picture in
   use is never purged; replacing an avatar leaves the old picture unreferenced and the job
   removes it later. The foreign key is `ON DELETE SET NULL`, so deleting an organization (which
   cascades to its files) stays possible.

## Consequences

- Accounts created through Google have no usable password. They sign in with Google; a "set a
  password" flow can be added later.
- Avatar URLs are unguessable but public: anyone with the link can fetch that picture while it is
  someone's avatar.
- `PUBLIC_API_URL` must be set in production, otherwise avatar URLs point at localhost.
- The web app needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and the redirect URI must be
  registered in the Google Cloud console.

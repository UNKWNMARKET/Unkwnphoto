# Unkwnphoto

A photography portfolio: public albums for visitors, a private page for you to
add and name them.

- **Front end** — React + TypeScript + Vite, one hand-written stylesheet, no UI
  framework. The whole site is ~240 KB.
- **Back end** — Vercel Serverless Functions in `api/`, with Vercel Blob for
  both the image files and the album index. No database.

## Setting it up

Two environment variables, both set in the Vercel dashboard under
**Settings → Environment Variables**:

| Variable | Required | What it does |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | yes | Added automatically when you connect a Blob store to the project. |
| `ADMIN_PASSWORD` | yes | The password you sign in with. Make it long — it is the only thing standing between the internet and your storage. |
| `SESSION_SECRET` | no | Signing key for the login cookie. If unset, one is derived from `ADMIN_PASSWORD` by a slow key-derivation function. Setting it to a long random string is slightly better: it's faster on cold starts, and changing your password won't sign you out everywhere. |

Add them, then redeploy so the running functions can see them.

`GET /api/health` tells you whether a password is configured. Signed in, it
also reports which commit is live and whether storage reached the runtime —
never the values themselves.

## Using it

Go to **/admin** and sign in. There is no link to it anywhere on the public
site; visitors never see that the page exists.

- **Create an album**, then drag photos onto it — or tap to pick them. As many
  at once as you like.
- Photos are **named from their filenames** on upload (`old-truck_1.jpg`
  becomes "Old Truck 1"); click any name to change it.
- Rename an album by editing its name field. Set any photo as the album's
  cover, reorder with the arrows, delete what you don't want.

Uploads go straight from your browser to Blob storage, so they aren't capped by
the 4.5 MB serverless request limit — a full-resolution photo is fine (up to
25 MB each).

## How the login works

There is no session store, because serverless functions don't have one. Signing
in sets an `HttpOnly`, `Secure`, `SameSite=Strict` cookie holding an expiry
signed with HMAC-SHA256. Every protected route re-verifies that signature on
every request, so editing anything in devtools achieves nothing. Passwords are
compared in constant time after a deliberately slow key derivation, which makes
guessing at scale impractical.

The cookie's signing key is itself derived through that same slow function
rather than from the password directly. That matters more than it looks:
anyone holding a cookie can check a signature offline, so a cheap key would
turn the cookie into a password-cracking oracle and the slow login hashing
would buy nothing. `npm test` covers this and 26 other cases — forged
payloads, tampered signatures, expired-but-validly-signed cookies, and that
everything fails closed when `ADMIN_PASSWORD` is unset.

Everything that changes data — uploading, creating, renaming, deleting — is
gated, with a same-origin check on top of `SameSite`. `GET /api/library` is
the only public endpoint.

## How the data is stored

Albums and photos live in one JSON file in Blob storage. Writes are a single
atomic overwrite guarded by the file's ETag, so two overlapping edits can't
silently clobber one another — the second is told to reload rather than
winning. Reads distinguish "there is no library yet" from "storage is
unreachable", and only the first is treated as an empty portfolio; a read
failure never becomes a write that erases everything.

## Local development

```bash
npm install
npm run dev        # front end only, on :5173
npx vercel dev     # front end + the API together, if you have the Vercel CLI
npm run check      # typecheck + tests + build
```

Without the API running, the site loads and shows an empty portfolio rather
than an error.

## Credits

In-scene typeface: [Archivo](https://fonts.google.com/specimen/Archivo),
SIL Open Font License 1.1, self-hosted in `public/fonts`.

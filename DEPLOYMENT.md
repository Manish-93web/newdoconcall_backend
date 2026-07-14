# Deploying `newdoconcall_backend` to Render

This is the Node/Express/Socket.IO API, connecting to MongoDB Atlas. It must be deployed
**before** the frontend, since the frontend needs this service's URL as an env var.

> **Deploy order**: Backend (this doc) → Frontend (`newdoconcall_frontend/DEPLOYMENT.md`) →
> come back here and update `CORS_ORIGINS` / `SOCKET_CORS_ORIGINS` with the final Vercel URL.

## 0. Prerequisites

- A GitHub (or GitLab/Bitbucket) repo containing this folder. This directory isn't a git
  repo yet, so first:
  ```bash
  cd newdoconcall_backend
  git init
  git add .
  git commit -m "Initial commit"
  git branch -M main
  git remote add origin <your-github-repo-url>
  git push -u origin main
  ```
  Make sure `.env` is **not** committed — check `.gitignore` includes it (it already does;
  only `.env.example` should be tracked).
- A MongoDB Atlas cluster (you're already using one for local dev — the same
  `MONGODB_URI` can point at it, or create a separate production cluster/database).
- A [Render](https://render.com) account.

## 1. Create the Web Service

1. Render dashboard → **New** → **Web Service** → connect the GitHub repo above.
2. If this repo contains only the backend, leave **Root Directory** blank. If you instead
   pushed a monorepo containing all three project folders, set **Root Directory** to
   `newdoconcall_backend`.
3. Settings:
   | Field | Value |
   |---|---|
   | Environment | `Node` |
   | Build Command | `npm install` |
   | Start Command | `npm start` (runs `node server.js`) |
   | Node version | 18+ (matches `engines.node` in `package.json`) — Render auto-detects, or set `NODE_VERSION=20` env var to pin one |
   | Instance Type | See note below |

**Free tier note**: Render's free web services spin down after 15 minutes of no traffic
and cold-start on the next request (several seconds), which also drops any open Socket.IO
connections (live calls, chat). Fine for testing; for real usage pick a paid **Starter**
instance or above so the process — and its WebSocket connections — stay alive.

## 2. Environment variables

Add these under the service's **Environment** tab. Values map 1:1 to `.env.example` in
this repo.

**Required:**
| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Your Atlas connection string |
| `JWT_ACCESS_SECRET` | Random secret — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Same command, a **different** value than the one above |
| `CORS_ORIGINS` | Your Vercel URL(s), comma-separated, e.g. `https://doconcall.vercel.app` — placeholder OK for now, update after Part 2 |
| `SOCKET_CORS_ORIGINS` | Same as `CORS_ORIGINS` |
| `API_BASE_URL` | Your Render URL once known, e.g. `https://doconcall-backend.onrender.com` |

Do **not** set `PORT` — Render injects it automatically and `server.js` already reads
`process.env.PORT` with a fallback.

**Optional** (each feature silently degrades to a console-log/no-op stub if left blank —
add only the ones you're actually using):
| Key | Enables |
|---|---|
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Token TTL overrides (defaults `30m` / `30d`) |
| `GOOGLE_MAPS_SERVER_KEY` | Server-side geocoding |
| `ANTHROPIC_API_KEY` | LLM-based symptom checker (blank = deterministic keyword heuristic) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google sign-in |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments — see step 5 below |
| `STUN_URLS`, `TURN_URLS`, `TURN_STATIC_SECRET` | WebRTC ICE servers (blank = public Google STUN only, calls may fail behind strict NATs) |
| `NOTIFICATION_PROVIDER` | Leave `console` unless wiring real SMS/email/push |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM` | SMS/WhatsApp |
| `SMS_APP_HASH` | Android SMS auto-read |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | Email |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Push notifications — paste the full service-account JSON as one line |
| `UPLOAD_STORAGE_PROVIDER` | Leave `local` (see disk note below) |

## 3. MongoDB Atlas network access

Render's outbound IPs are dynamic on standard plans. In Atlas → **Network Access**, either:
- Add `0.0.0.0/0` (simplest; the DB user's password is still the real access control), or
- Pay for Render's **Static Outbound IP** add-on and allowlist those specific IPs instead.

## 4. File uploads — persistent disk

`src/middleware/upload.middleware.js` writes to a local `uploads/` folder on disk
(`UPLOAD_STORAGE_PROVIDER=local`). Render's default filesystem is **ephemeral** — anything
written there is wiped on every deploy/restart. If prescriptions/attachments need to
survive deploys:
- Render dashboard → your service → **Disks** → add a persistent disk mounted at
  `uploads` (relative to the service's working directory).
- Without this, uploaded files will disappear on the next deploy — acceptable for a demo,
  not for production.

## 5. Stripe webhook (if using payments)

1. Deploy first so you have the live URL (e.g. `https://doconcall-backend.onrender.com`).
2. Stripe Dashboard → **Developers → Webhooks → Add endpoint**:
   `https://<your-render-url>/api/v1/payments/webhook`
3. Copy the generated **signing secret** into the `STRIPE_WEBHOOK_SECRET` env var on Render
   and save (Render redeploys automatically on env var changes).
4. `app.js` already mounts this route with `express.raw()` ahead of the JSON body parser,
   so no code changes are needed for signature verification to work.

## 6. Health check

Render dashboard → **Settings → Health Check Path** → set to `/api/v1/health`. This repo
already exposes it (`GET /api/v1/health`), no code change needed.

## 7. Deploy and verify

Trigger the first deploy (push to the connected branch, or **Manual Deploy** in the
dashboard), then from your machine:

```bash
curl https://<your-render-url>/api/v1/health
# {"success":true,"data":{"status":"ok","time":"..."}}

curl -X POST https://<your-render-url>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"you@example.com","password":"..."}'
```

Check the Render **Logs** tab for `[server] DoconCall API listening on ...` and
`[db] connected to MongoDB (...)` to confirm both the process and the Atlas connection
came up cleanly.

## 8. Seeding QA/demo accounts (optional)

Render dashboard → your service → **Shell**, then:
```bash
node src/seed/seedQaAccounts.js   # idempotent — safe to re-run
```

## 9. After the frontend is deployed

Come back and update on Render:
- `CORS_ORIGINS` and `SOCKET_CORS_ORIGINS` → your real Vercel production URL (and any
  preview-deployment domain pattern you want to allow)
- `API_BASE_URL` → your final Render URL, if you used a placeholder earlier

Both trigger an automatic redeploy when saved.

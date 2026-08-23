# P-099 Security & Reliability Review

Scope: full repo (`backend/`, `frontend/`, `new_frontend/`, `supabase/`, deploy configs) on branch `mock`, plus passive checks against the live deployment (`https://t099.vercel.app`, its EC2 API host, Supabase). No active scanning, fuzzing, or exploitation was performed against the live systems — only read-only requests identical to normal browser traffic. Findings below are backed by exact file/line references or verified live responses, not generic checklist output.

Legend: 🔴 Critical (fix now) · 🟠 High (fix this week) · 🟡 Medium (fix soon) · 🟢 Info/hardening

---

## 1. Vulnerabilities

### 🔴 1.1 — Private SSH key committed to git history
`recruiitment-portal-backend-keys.pem` (RSA private key, almost certainly the EC2 SSH keypair) is tracked in git, added in commit `626154b "prepare for cloud services"`. `.gitignore` has a `*.pem` rule, but it was added *after* the file, so it doesn't retroactively remove it — the key is still in history and still checked out on disk today.
- The GitHub repo (`AI20K-Build-Phase-Cohort-3/P-099`) returns 404 to unauthenticated API requests, i.e. it's private — but every collaborator/cohort member with repo access already has the key, and it stays in history even if you delete the file.
- **Fix now:**
  1. Rotate the EC2 keypair (create a new keypair, update the instance / launch a new one, revoke the old public key from `~/.ssh/authorized_keys`).
  2. Remove the file from git history (`git filter-repo --path recruiitment-portal-backend-keys.pem --invert-paths`, then force-push and have every collaborator re-clone).
  3. Never store deploy keys in the repo — use GitHub Actions secrets, AWS Systems Manager Parameter Store, or a local-only path outside the repo.

### 🔴 1.2 — Production API is served over plain HTTP, directly by IP — very likely your "operational errors"
The deployed frontend bundle (`/assets/index-*.js` on t099.vercel.app) has `VITE_API_BASE_URL` baked in as `http://13.251.102.247:8000` — no TLS, no domain. Verified live:
```
curl http://13.251.102.247:8000/health   → 200 OK, server: uvicorn
curl https://13.251.102.247:8000/health  → connection fails, no TLS listener on the box at all
```
- Your frontend is served over **HTTPS** (Vercel). A page loaded over HTTPS calling an `http://` endpoint is **active mixed content**, which Chrome/Firefox/Safari block by default. This means any feature that calls the FastAPI backend (login profile sync, chat, matching, applications) is likely failing or intermittently failing for real users right now, depending on browser/settings — this is a strong candidate for the "operational errors" you mentioned.
- Even where it isn't blocked, every request — including the `Authorization: Bearer <supabase-jwt>` header — travels in cleartext, interceptable by anyone on-path (public wifi, ISP, compromised router).
- **Fix:** put a real reverse proxy in front of uvicorn on the EC2 box (nginx or Caddy) with a TLS cert (Let's Encrypt via a real subdomain like `api.yourdomain.com`, or an AWS ALB + ACM cert). Lock the EC2 security group to allow only 443 (and 22 from your IP) inbound; keep 8000 bound to `localhost` only. Point `VITE_API_BASE_URL` at the HTTPS domain.

### 🟠 1.3 — No infra-level protection in front of the API (defense in depth)
The backend is directly reachable on the internet with no WAF, no reverse-proxy rate limiting, and a single uvicorn process (`docker-compose.yml`, no `--workers`, no gunicorn). Good news: the app *does* already gate the expensive/LLM-backed routes with auth + app-level rate limiting (`enforce_chat_rate_limit`, `enforce_ingest_rate_limit` in [resumes.py](backend/app/api/routes/resumes.py) and [chat.py](backend/app/api/routes/chat.py)), and admin routes require `get_current_admin` ([admin.py](backend/app/api/routes/admin.py)) — that part is solid. What's missing is infra-level backstop: a crash or a slow-loris-style flood takes the single process down with nothing in front to absorb it. Add nginx/Caddy (also solves 1.2) with connection limits, and consider `uvicorn --workers N` or gunicorn+uvicorn workers behind it.

### 🟡 1.4 — Missing browser security headers on the frontend
`curl -I https://t099.vercel.app/` shows no `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. Neither [frontend/vercel.json](frontend/vercel.json) nor [new_frontend/vercel.json](new_frontend/vercel.json) declares a `headers` block. This widens blast radius if any XSS vector is ever found (no CSP to contain it) and allows clickjacking (no frame-ancestors). Add a `headers` block to `vercel.json`.

### 🟡 1.5 — Unpinned dependencies, no lockfile for `new_frontend`
[requirements.txt](requirements.txt) uses `>=` everywhere (no upper bounds, no lockfile/hashes) — a fresh `pip install` on redeploy can silently pull a newer, untested, or vulnerable transitive package. `frontend/` has a committed `package-lock.json`, but `new_frontend/` has **no lockfile committed at all** (and an untracked `pnpm-workspace.yaml` just appeared locally), so its dependency tree isn't reproducible between your machine, CI, and Vercel's build. Recommend: `pip-compile`/`uv lock` for the backend, commit `new_frontend`'s lockfile (pnpm or npm, pick one and stick to it).

### 🟢 1.6 — Two parallel frontend apps increase deploy-drift risk
`frontend/` and `new_frontend/` are separate React apps with duplicated `env.ts`/`supabase.ts`/`vercel.json`. Confirm which one Vercel's project root actually builds — the live bundle I inspected matches `new_frontend` (has `AppContext.tsx` dark-mode, `JobCard`, `Skeleton`, `ToastContext` from your latest pull). If `frontend/` is legacy, consider archiving it so nobody accidentally ships from the wrong directory.

### 🟢 1.7 — Loose local hygiene
`.env.old-design` sits untracked in the repo root. It's covered by `.gitignore`'s `.env*` pattern so it won't get committed by a plain `git add`, but stray env-shaped files in a repo root are exactly what gets swept up by a careless `git add -A -f` later. Move it outside the repo (or delete it once you've confirmed it holds no live secrets you still need).

### What's already solid (no action needed)
- **Supabase RLS**: [20260813104500_harden_rls_and_storage.sql](supabase/migrations/20260813104500_harden_rls_and_storage.sql) is genuinely well-built — `SECURITY DEFINER` helpers isolated in `app_private`, triggers blocking self-promotion to admin/verified/published, storage policies scoped per-user folder. Better than most production apps I review.
- **Prod config validation**: [backend/app/config/env.py](backend/app/config/env.py) hard-fails startup if `APP_ENV=production` and the JWT secret is still the dev default, CORS is wildcarded, or the service-role key is missing — and it's actually unit-tested ([test_config_security.py](tests/unit/test_config_security.py)).
- **`/docs`, `/redoc`, `/openapi.json` correctly return 404 on the live API** — confirmed live — so `APP_ENV=production` is genuinely set on EC2 and Swagger isn't leaking your API surface.
- **CORS isn't wildcarded in prod** — verified live: sending `Origin: https://evil-site.example` gets no `Access-Control-Allow-Origin` back.
- Frontend env handling only ships the Supabase **anon** key to the client (service-role key stays backend-only) — correct split.
- Dockerfile runs as non-root `appuser` with a real `HEALTHCHECK`.

---

## 2. Edge cases affecting UX

| Scenario | Effect today |
|---|---|
| User on a network/browser that enforces strict mixed-content blocking (most current Chrome/Firefox/Safari) | All backend-dependent features (chat, matching, applications, profile save) silently fail or hang — likely your top support complaint right now (see 1.2). |
| EC2 instance reboots or the docker container OOMs | `restart: unless-stopped` brings it back, but single-process/no-orchestration means real downtime in between with no alerting to tell you it happened. |
| Two people edit `application_stages` concurrently (recruiter moves a candidate while they withdraw) | RLS allows both inserts independently — worth checking the service layer for a race where a withdrawal is silently overwritten by a recruiter's stage change written a moment later. |
| Resume upload exceeds 10MB or wrong mime type | Storage policy in `harden_rls_and_storage.sql` rejects it at the bucket level — but confirm the frontend surfaces a clear error rather than a generic "upload failed." |
| Vercel preview deployments (`t099-git-*` branch URLs, visible in the bundle) | Point at the same hardcoded `http://13.251.102.247:8000` — no per-environment API host, so preview branches hit production data/rate limits with no isolation. |
| `new_frontend` build without a committed lockfile | A Vercel rebuild weeks from now can silently resolve different dependency versions than what you tested locally — "works on my machine" deploy failures. |
| JWT expiry mid-session | Confirm the frontend refreshes the Supabase session and retries the failed request rather than just showing a raw 401/"API error" (the generic `throw new Error('API error')` in [api.ts](new_frontend/src/lib/api.ts) suggests users currently just see "API error" with no recovery path). |

---

## 3. Fix priority (do in this order)

1. Rotate the EC2 SSH keypair; strip the `.pem` from git history. (1.1)
2. Put nginx/Caddy + a real TLS cert in front of the FastAPI backend; repoint `VITE_API_BASE_URL` at `https://` and redeploy the frontend. This one change plausibly fixes most of your "operational errors." (1.2)
3. Restrict the EC2 security group to 443 (+22 from your admin IP only); bind uvicorn to localhost behind the proxy. (1.3)
4. Add a `headers` block to both `vercel.json`s (CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`). (1.4)
5. Pin backend deps with a lockfile; commit a lockfile for `new_frontend`. (1.5)
6. Decide `frontend/` vs `new_frontend/` and archive the loser. (1.6)
7. Delete/relocate `.env.old-design`. (1.7)

## 4. Methodology note (honest version, not a sales pitch)

This was a manual static review of the repo (env/config, CORS, RLS/migrations, Dockerfile, CI, dependency manifests) cross-checked against a handful of read-only, passive requests to your already-public live endpoints (HTML/JS fetch, `/health`, `/docs`, a CORS-header check) — no credentials were used, nothing was written or modified, and no automated scanner (ZAP/Burp/nuclei) was run. I'm not going to hand you a fabricated multi-week timeline or invented benchmark numbers for work I haven't done — items 1–3 above are a few hours of infra work (mostly the nginx/TLS setup), items 4–7 are under an hour combined. If you want an active scan of the live endpoints (auth fuzzing, injection probing) or a walkthrough of the actual EC2/nginx setup, say so explicitly and I'll do that as a separate, scoped step.

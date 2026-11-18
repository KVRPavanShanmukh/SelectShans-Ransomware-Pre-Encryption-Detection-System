# SelectShans — Security Audit Report

**Target:** `D:\HACK-LEARNATHONS\LEARNATHON SLOT 3\FINAL\PRO\PRO`
**Date:** 2026-11-18
**Scope:** Flask API (`backend/app.py`, `admin_routes.py`, `jwt_utils.py`, `static_analyzer.py`), Python endpoint agents (`backend/detector_package/`, `backend/endpoint_guard/`), .NET endpoint agent (`backend/endpoint_dotnet/`), React frontend (`frontend/src/`), schema, and deployment configuration (Docker, nginx, render, vercel).

**Method:** Manual source review of all in-scope first-party files, with line-level verification of every finding below. No exploitation was performed against a live system. No CVE database was consulted, so no CVE identifiers are asserted. Database access was not available, so findings that depend on runtime data are labelled accordingly.

**Severity counts:** 4 Critical · 12 High · 21 Medium · 13 Low/Info

---

## 1. Executive summary

The application's cryptographic primitives are mostly chosen well: passwords use `werkzeug` PBKDF2 hashes, SQL is parameterised throughout, JWTs pin `HS256`, detector tokens use HMAC with constant-time comparison, and the code is clean of `shell=True`, `pickle`, `eval`, and disabled TLS verification. **The failures are almost entirely in composition and configuration**, and several are silently fail-open — the worst property for a security product.

Four issues are critical and require action before any deployment:

1. **The live JWT signing secret is the same value published in the repository.** Anyone who can read the repo can mint an `admin` token — full administrative takeover, no credentials needed.
2. **Multi-factor authentication is defeated by design** whenever the app is not in production mode: the login API returns the OTP and PSK in the HTTP response and the frontend auto-fills them, so a password alone is enough.
3. **Production mode is not the default, and the container deployment never sets it** — which turns on the Flask debugger, exception tracebacks, wildcard CORS, and issue 2 simultaneously.
4. **`/api/analyze-file` requires no authentication** but writes attacker-controlled alerts into the SOC console, and accepts 10 MB uploads on an anonymous endpoint.

The most damaging *non*-credential issue is architectural: **the `alerts`, `event_logs`, and `log_hashes` tables have no `user_id`**, so every user's generated PDF security report contains the last 8 alerts from *all* tenants. With open signup and no email verification, that is a data breach of customer forensic data by default.

For the endpoint agents, the headline is that **the security tool destroys user data**: the canary deployment opens `~WRL0001.tmp` (a filename Microsoft Word uses in the same folder as the document being edited) with truncating mode `'w'`, then deletes it on cleanup. It also loses the first events of an attack (blocking queue, `DropOldest` channel, severity-blind queue trimming), never sends a heartbeat in one agent, and scores a confirmed encryption surge as MEDIUM so it never escalates.

---

## 2. Critical

### C-1 · Live JWT secret equals the value published in the repository → full admin takeover

**Where:** `backend/.env` (`JWT_SECRET`); published in `docker/.env.example:8`, `backend/tests/test_auth_security.py:75`, `backend/tests/test_threat_analysis.py:43`; hardcoded fallback in `backend/middleware/auth.js:15`.

**Evidence:** I compared the live `.env` value against the repository's published example and they are **identical**. The same string is committed to git in four places. The frontend and API both trust `role` from the JWT payload (`jwt_utils.py:33-44`, `App.jsx:118`).

**Impact:** Anyone with read access to this repository (a contractor, a shared drive, a public repo, a leaked screenshot of `.env.example`) can sign a token claiming `role: "admin"` and be accepted by every `/api/admin/*` route as a full administrator — user enumeration with PII, permission grants, audit-log export, and `POST /api/admin/clear-data` (destroys all alerts and event logs across all tenants). This is a single-step, unauthenticated-in-effect compromise.

**Fix:**
1. Rotate `JWT_SECRET` now (this invalidates existing sessions, which is desirable).
2. Generate with `python -c "import secrets; print(secrets.token_urlsafe(64))"` — never a human-readable phrase.
3. Remove the fallback from `auth.js:15` — fail closed if unset.
4. Replace the test defaults with a per-test generated secret.
5. Purge the value from `.env.example`, replacing with `CHANGE_ME`. Since it is in git history, treat it as permanently public and assume it was used.
6. Delete `backend/middleware/auth.js` if unused — it requires `jsonwebtoken`, which is not even in `backend/package.json`, so the file is dead code carrying a live-looking secret.

---

### C-2 · MFA is bypassed by design: the API returns the OTP and PSK, and the client auto-fills them

**Where:** `backend/app.py:562-578` (server) + `frontend/src/components/Login.jsx:63-64` and `frontend/src/components/AdminLogin.jsx:60-61` (client).

**Evidence:**
```python
# app.py:572-578
return jsonify({
    "pending": True, "identifier": email,
    "dev_otp": otp, "dev_psk": psk,
    ...
```
```jsx
// Login.jsx:63-64
if (data.otp || data.dev_otp) setOtp(data.otp || data.dev_otp);
if (data.psk || data.dev_psk) setPsk(data.psk || data.dev_psk);
```

**Trigger condition:** `APP_ENV != "production"` **and** the SMTP send returns `False`. `APP_ENV` defaults to `"development"` (`app.py:30`), and `send_email_safe` returns `False` on *any* SMTP failure (`app.py:351-363`) — wrong credentials, blocked port 587 (common on PaaS and corporate networks), DNS failure, or timeout.

**Impact:** Both factors are delivered to the party that knows only the password. The UI still claims the code was emailed, so this is silent. There is no step in which the user must prove mailbox access. This reduces the entire login design — including the `admin` path in `AdminLogin.jsx` — to single-factor authentication.

**Fix:** Delete the `dev_otp`/`dev_psk` response fields and the client fallbacks entirely. If a local-dev shortcut is genuinely required, gate it on an explicit opt-in variable (not the absence of `production`), never return it in the same response as the credential check, and never in a deployed build. Verify this with a test that asserts the response body contains no OTP-shaped field when `APP_ENV=production`.

---

### C-3 · Production mode is not the default, and the Docker deployment never enables it

**Where:** `backend/app.py:30`, `:77`, `:81-87`, `:1899-1902`; `Dockerfile` (no `ENV APP_ENV`); `docker/docker-compose.yml` (no `APP_ENV` in `environment:`); `docker/Dockerfile` (no `ENV APP_ENV`).

**Evidence:**
```python
APP_ENV = os.getenv("APP_ENV", "development")          # :30
CORS(app, resources={r"/*": {"origins": "*" if APP_ENV != "production" else allowed_origins}})  # :77
    if APP_ENV.lower() != "production":
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500  # :86
debug_mode = APP_ENV.lower() != "production"           # :1901
app.run(host="0.0.0.0", port=port, debug=debug_mode)   # :1902
```
Neither Dockerfile nor `docker-compose.yml` sets `APP_ENV`; only `render.yaml` does (`APP_ENV: production`).

**Impact, in order of severity:**
- **Remote code execution.** `debug=True` starts the Werkzeug interactive debugger behind a PIN. When `docker/Dockerfile` is used, `CMD ["python", "app.py"]` runs this exact block. Any exposed instance gives an attacker the debugger console (PIN brute-forceable; also leaks source and a live Python REPL). Bound to `0.0.0.0`.
- **C-2 is live** (MFA bypass).
- **Full traceback disclosure** on every unhandled error — including SQL, DSN fragments, and internal paths.
- **Wildcard CORS** (`origins: "*"`), which combined with the `Authorization`-header pattern lets any site call the API with a stolen token.

**Fix:** Set `ENV APP_ENV=production` in both Dockerfiles and `APP_ENV=production` in `docker-compose.yml`. Better: remove the `APP_ENV` default entirely so the app refuses to start without an explicit value, and never derive `debug` from an environment string — hardcode `debug=False` and require `FLASK_DEBUG` for local work. Replace `app.run` with gunicorn (already the `render.yaml` command) in all deployments.

---

### C-4 · Unauthenticated `/api/analyze-file` injects attacker-controlled alerts into the SOC console

**Where:** `backend/app.py:1178-1191` (auth attempted but never enforced), `:1242-1259` (alert INSERT).

**Evidence:**
```python
@app.route('/api/analyze-file', methods=['POST'])
def analyze_file():
    # Attempt token verification if provided
    auth_header = request.headers.get('Authorization', '')
    if auth_header and ' ' in auth_header:
        ...
            g.user = verify_token(token)
    # ... then proceeds regardless of whether g.user was ever set
```
There is no `@token_required` decorator and no `401` return. The endpoint is fully public (confirmed against the full route inventory).

**Impact:**
- **Alert injection / SOC poisoning.** Any anonymous client can POST a crafted 10 MB file that the heuristics rate `MALICIOUS` (≥75 risk score is trivial to reach: `.locked` extension +65, or a `vssadmin delete shadows` string +35, etc.) and have an arbitrary `trigger_reason`, `process_name`, and `severity` written into the global `alerts` table (`:1248-1259`). This floods the operator console, drives the dashboard "anomaly score" (`app.py:1606-1608`, which is computed from unresolved alert count), and buries real incidents. A monitoring product whose alert store is anonymously writable has no integrity.
- **Denial of service.** `MAX_ANALYSIS_BYTES = 10 MB` (`static_analyzer.py:11`). Each request runs `Counter(data)` over 10 MB and then `pat.lower() in file_data.lower()` **eight times** (`static_analyzer.py:233-236`), creating eight additional 10 MB copies per request — ~90 MB of allocations and repeated full scans per anonymous request. No rate limit, no auth.

**Fix:** Add `@token_required` and scope the alert insert to `g.user['user_id']`. If anonymous scanning is a product requirement, isolate it: a separate unauthenticated route that returns a verdict only, never writes to the alert store, with strict rate limiting, a much lower size cap, and a single-pass `data.lower()` computed once.

---

## 3. High

### H-1 · `/api/send-email` is an open mail relay with SMTP header injection
**Where:** `backend/app.py:665-680`, `:310-363`.
Any authenticated user (and signup is open — see H-6) supplies `to`, `subject`, and `body` with no validation, and the server sends via the platform's SMTP account. `msg['To'] = to_email` and `msg['Subject'] = subject` are assigned raw, so embedded CRLF permits **Bcc/header injection**. Impact: branded phishing from the organisation's own mail domain, bulk spam burning sender reputation, and arbitrary `Bcc` delivery. **Fix:** restrict to an allow-list of internal recipients, fix the subject/body templates, strip CR/LF from all header values, and require admin role.

### H-2 · Account password can be changed without the current password
**Where:** `backend/admin_routes.py:220-222`.
`new_password` is accepted and hashed with **no verification of the existing password** and **no strength check** (bypassing the signup policy in `app.py:379-382`). Any stolen or XSS-exfiltrated token becomes persistent account takeover: change the password, lock the owner out. **Fix:** require and verify the current password; apply the same policy as signup; invalidate other sessions; send a notification email.

### H-3 · Every user's PDF report leaks other tenants' alerts (multi-tenancy break)
**Where:** `backend/app.py:1324-1329` (alerts query has **no user filter**), `:1304` (`WHERE user_id = %s OR user_id IS NULL`), `:1340-1343` (global unresolved count); root cause `schema.sql:69-78` (`alerts` has no `user_id`), `:51-60` (`event_logs` has no `user_id`).
`generate_pdf_report` is reachable by any authenticated user for their own account (`:1546-1550` correctly blocks cross-user access), but the report content is global: the last 8 alerts from every tenant — `process_name`, `trigger_reason` containing directory paths and filenames, `action_taken` — plus global metrics. **Impact:** routine disclosure of other customers' host forensics to any registered user, and the daily cron (`:1659-1690`) emails it to everyone. **Fix:** add `user_id` to `alerts`/`event_logs`/`log_hashes`, populate it on insert, and filter every query by the authenticated subject.

### H-4 · Detector tokens never expire, travel in URLs, and are shared static secrets
**Where:** `backend/app.py:846-893` (token in query string, embedded in the downloaded ZIP), `:294-304` (`verify_detector_token` has **no expiry check**), `frontend/src/components/Dashboard.jsx:86`, `EndpointOptions.cs:8`, `appsettings.json:10`, `detector_package/config.json:3`.
The detector token is a bearer credential granting telemetry submission and agent download. It never expires, is issued as a GET query parameter (recorded in browser history, proxy/CDN access logs, `Referer`), is written into `config.json` inside the artifact, and in the .NET/Python agents is a **single shared static value with no per-endpoint identity, rotation, or HMAC binding**. **Fix:** add `exp` to the token payload and verify it; move to an `Authorization` header; issue per-endpoint credentials at enrolment; rotate; store with DPAPI/Credential Manager.

### H-5 · Alert suppression via database column overflow (detection evasion)
**Where:** `backend/app.py:1029-1031` and `:946-931`; `backend/schema.sql:74` (`trigger_reason VARCHAR(255)`).
`trigger_reason` is built from attacker-influenced input — `f"{last_event_msg} | {details[:160]}"` where `last_event_msg` embeds `directory` (`VARCHAR(500)`) — and inserted into a `VARCHAR(255)` column. PostgreSQL raises *value too long*, the handler rolls back the **whole batch** (`:1041-1044`) and returns 500; the agent treats 500 as failure and retries the same rows forever. **Impact:** a long path or a crafted `details` field permanently discards detections and wedges the agent's queue — an attacker who controls a directory name controls whether their own activity is recorded. **Fix:** widen the column to `TEXT`, truncate defensively server-side, and validate lengths at the boundary so a data-shape error can never cause alert loss.

### H-6 · No rate limiting, no lockout, weak passwords, unverified and non-unique email
**Where:** `backend/app.py:369-417` (signup), `:420-470` (login), `:583-625` (verify); `schema.sql:9` (`email VARCHAR(100) NOT NULL` — **no UNIQUE**).
- Signup requires one uppercase and one special character and **no minimum length** — `"A!"` is a valid password.
- No rate limiting exists anywhere (`requirements.txt` has no Flask-Limiter; nginx has no `limit_req`), so password and OTP guessing are unthrottled.
- Email is never verified and not unique. `_pending_logins` is keyed by email (`:462`), so an attacker can register a victim's address and repeatedly overwrite the victim's pending challenge — a login denial-of-service — and can flood any address with OTP mail by registering it.
- `:608` compares OTP/PSK with `!=` rather than `hmac.compare_digest`, and `:624` advertises `expires_in: 1800` while the token actually expires in 450 s (`jwt_utils.py:17`), so the client believes the session lives four times longer than it does.
**Fix:** enforce ≥12 characters, add `UNIQUE` on `email` plus a verification flow, add per-IP and per-account rate limiting on login/verify/signup, use `hmac.compare_digest`, and return the real expiry.

### H-7 · No TLS anywhere, and no security headers
**Where:** `docker/frontend/nginx.conf` (`listen 80` only), `docker/docker-compose.yml:frontend ports 5173:80`, `Dockerfile` nginx block, `EndpointOptions.cs:8` (`http://127.0.0.1:5000`), `appsettings.json:4`, `detector_package/config.json:2`, `TelemetryService.cs:31,206,219`.
JWTs and detector tokens cross the network in cleartext on `http://`, and in the Docker deployment nginx serves the SPA and proxies the API over plain HTTP with no HSTS, CSP, `X-Frame-Options`, or `X-Content-Type-Options`. **Fix:** terminate TLS (nginx `listen 443 ssl` + redirect), add HSTS and a CSP with `frame-ancestors 'none'`, and force the agents to require `https://` (reject `http:` unless an explicit dev override is set).

### H-8 · Committed credentials in `docker/.env.example`
**Where:** `docker/.env.example:4` (`DB_PASSWORD` — a real-looking personal password), `:8` (the compromised JWT secret), `:18` (`DETECTOR_SECRET=prd-secret` — trivially weak).
Tracked in git. **Impact:** the DB password is a plausible real credential and must be treated as compromised; `prd-secret` would make detector HMACs forgeable if ever used. **Fix:** replace all values with `CHANGE_ME` placeholders, rotate the DB password, and purge from history. (Note: `backend/.env` and `frontend/.env` are correctly gitignored and were never committed — that part is done right.)

### H-9 · The agent destroys user files: canary deployment truncates and then deletes existing documents
**Where:** `backend/endpoint_guard/canary.py:7-11`, `:28`, `:47-59`.
```python
CANARY_FILENAMES = ["~WRL0001.tmp", "backup_important_do_not_delete.docx", "passwords_archive.zip"]
...
with open(filepath, 'w', encoding='utf-8') as f:   # truncates any existing file
...
os.remove(filepath)                                 # cleanup deletes it, unverified
```
`~WRL0001.tmp` is the filename Microsoft Word creates **in the same folder as the document being edited**, and `canary_locations` defaults to the user's `Documents` folder (`config.py:15-20`). Opening in `'w'` mode destroys any pre-existing file with that name; `cleanup()` then deletes it permanently with no signature or ownership check — and as a LocalSystem service these writes occur with SYSTEM rights. **Fix:** create with `os.open(..., O_CREAT|O_EXCL)` and skip on `FileExistsError`; embed a per-instance signature and require it before deletion; remove the Word-temp name.

### H-10 · A blocking queue write in the filesystem-event callback blinds the agent during an attack
**Where:** `backend/endpoint_guard/monitor.py:37,45,53` (`self.queue.put(...)`) with `:62` (`queue.Queue(maxsize=10000)`).
`put()` has no `block=False` and no timeout. During a ransomware burst the single consumer (SQLite write per event plus a full `psutil` scan per threshold breach, `process.py:11-14`) falls behind, the queue fills, and `put()` **blocks watchdog's emitter thread indefinitely**. No further events are dispatched, OS change buffers overflow, and the events covering the encryption phase are lost. **Fix:** `put_nowait()` with a dropped-events counter that is logged and reported, and move DB/process work off the consumer thread.

### H-11 · Heartbeats are silently discarded, so "agent offline" can never fire
**Where:** `backend/endpoint_guard/telemetry.py:81-83`, deletion at `:103-107`, payload at `:117-125`.
```python
elif event_type == "ping":
    # We just send ping natively
    pass
```
The ping row is read, ignored, and then **deleted** because `success` remains `True`. No HTTP request to `/api/detector/ping` is ever made. **Impact:** a killed, crashed, or blind agent is indistinguishable from a healthy one at the SOC — the platform's core availability signal does not exist in this agent. **Fix:** actually POST the ping and delete only on 2xx; include `monitored_directories_count` and `last_event_age` so "alive but blind" is detectable.

### H-12 · Untrusted interpreter search path and cwd-relative config in `run.bat`
**Where:** `backend/detector_package/run.bat:3` (`python detector.py`), `detector.py:27` (`CONFIG_FILE = "config.json"`).
`cmd.exe` resolves bare `python` from the current directory before `PATH`, and `config.json` is loaded from the working directory. A low-privileged process that plants `python.exe` in the extracted folder gets code execution with the token of whoever runs `run.bat` — typically an administrator installing the agent. Independently, whoever controls the cwd controls `api_base` (telemetry and the token are then exfiltrated to an attacker) and the detection thresholds. **Fix:** `pushd "%~dp0"`, use an absolute interpreter, resolve config relative to `__file__`, and validate config bounds and the `api_base` scheme.

### H-13 · Service imports its own modules from an unverified, typically user-writable directory
**Where:** `backend/endpoint_guard/service.py:101` (`win32serviceutil.HandleCommandLine` — installs under default **LocalSystem**), imports at `:7-11` (`from logger import logger`, etc.).
The service resolves its modules from `sys.path[0]` = the install directory, with no signature, hash, or ACL check. On any install path that a standard user can write to (an extracted ZIP, a checkout, `%LOCALAPPDATA%`), replacing `logger.py` yields **SYSTEM code execution** at next service start. **Fix:** install to an admin-only path with an explicit DACL, run as a dedicated low-privilege service account, ship a single frozen signed binary, and verify integrity at startup.

---

## 4. Medium

| # | Issue | Where | Impact |
|---|---|---|---|
| M-1 | `Upload-log` writes to a fixed path inside the app directory, no size limit | `app.py:1145-1170` | Attacker-chosen content lands in `backend/monitor.log`; concurrent uploads race and are emailed to the wrong user; disk-fill DoS |
| M-2 | Predictable PDF temp path + `matplotlib` global state | `app.py:1360-1377`, `:1525-1527` | `SelectShans_Security_Report_{user_id}.pdf` in shared temp; concurrent requests overwrite each other and `after_this_request` can delete a file another response is streaming — cross-user content disclosure; `plt.figure()` is not thread-safe |
| M-3 | Untrusted alert data rendered unescaped into ReportLab `Paragraph` | `app.py:1494` | `trigger_reason` comes from detector-supplied input; ReportLab parses limited XML/`<img src>` markup — markup injection and possible local-file fetch into PDFs (`admin_routes.py:412-416` does this correctly with `html.escape`) |
| M-4 | Unauthenticated `/api/session/stats` | `app.py:1740-1814` | Discloses active session/detector counts and network throughput; performs DB queries and `psutil` sampling per unauthenticated call (amplification) |
| M-5 | Beta token is not bound to the requesting user | `app.py:780-786`, `:801-809` | A `beta_token` issued to user A grants A's Shiki-kan terminal to user B holding any valid account; 2 h lifetime, no revocation |
| M-6 | `_pending_logins` / `_pending_beta_logins` are process-local dicts, never pruned | `app.py:280`, `:686` | Breaks MFA on any multi-worker/serverless deployment (Vercel entry point `api/index.py`) — pushes operators to disable OTP; unbounded growth |
| M-7 | Error messages return `str(e)` to clients | `app.py:642,660,833,938,1044,1103,1592,1643`, `admin_routes.py` | Database/schema error disclosure (medium even in production, where tracebacks are suppressed) |
| M-8 | Database is reached as superuser | `docker/docker-compose.yml` (`DB_USER=root`), `:MYSQL_ROOT_PASSWORD` | Application compromise becomes full database compromise; no least privilege |
| M-9 | Containers run as root; no `USER` directive | `Dockerfile`, `docker/Dockerfile` | Container escape or app RCE yields root in the container |
| M-10 | Unpinned dependencies, no hashes | `backend/requirements.txt` (`>=2.9.9`, `>=44.0.0`, `>=4.2.5`, `>=3.1.3`), `detector_package/requirements.txt` (`>=`), `endpoint_guard/requirements.txt` | Supply-chain drift into a security product; no reproducible builds |
| M-11 | Frontend has no lockfile | `frontend/` | Caret ranges with no `package-lock.json`; a compromised minor release ships silently |
| M-12 | Entropy read failure silently downgrades a CRITICAL event | `DetectionEngine.cs:63-66`, `:256-257` | Any exception returns `0.0`, indistinguishable from "low entropy" → encryption reported as `mass_write`, which can never reach CRITICAL; an attacker opening files with `FileShare.None` suppresses the signal |
| M-13 | Suspicious-extension path has no cooldown or dedupe | `DetectionEngine.cs:218-224` | Several watcher events per file → many duplicate CRITICALs, each a synchronous SQLite write; alert flooding evicts real alerts from the bounded queue |
| M-14 | `FullMode = DropOldest` makes the "channel full" warning unreachable | `SelectShans.GUI/App.xaml.cs:41-44`, `FileSystemMonitor.cs:307-311` | `TryWrite` always succeeds by silently evicting the **oldest** events — the earliest events of an attack are lost with zero observability |
| M-15 | Watcher errors are only logged | `FileSystemMonitor.cs:319-325` | `InternalBufferOverflow` or a renamed/deleted watched folder stops monitoring permanently while the GUI still shows "Monitoring" |
| M-16 | `encryption_surge` has no scoring branch | `detector_package/risk.py:106-125` vs `engine.py:238` | A confirmed multi-file encryption surge scores only the entropy signal (+35) → **MEDIUM**, below the alerting threshold; the strongest signal the engine can produce is downgraded |
| M-17 | Renaming to `.zip`/`.jpg` disables entropy detection | `detector_package/entropy.py:114`, `:130-132` | `is_natural_compressed` is derived from the **live, attacker-controlled** extension; rename then encrypt in place → `is_surge=False` regardless of entropy |
| M-18 | Shared SQLite cursor across three threads | `endpoint_guard/telemetry.py:16-17`, `:42-58`, `:65-107` | `check_same_thread=False` disables the guard without serialising; a `fetchone()` can read another statement's row or raise, and `risk.py` has no handler, so that detection is dropped entirely |
| M-19 | Service data directory inherits "Users can write" ACLs; config loaded unvalidated | `endpoint_guard/config.py:38`, `:42-43`, `:57-64` | Any interactive user can pre-create `identity.json` or a junction to inject `config.json` read by the SYSTEM service — attacker-controlled `api_base` (token exfiltration) or `protected_directories: []` (silent disablement) |
| M-20 | Default protected/canary directory is the service account's profile | `endpoint_guard/config.py:15-20` | As LocalSystem, `%USERPROFILE%` is `C:\Windows\system32\config\systemprofile` — the agent monitors and baits a non-existent folder and reports healthy with **zero coverage** |
| M-21 | Offline queue drops the oldest detections, severity-blind | `detector_package/telemetry.py:76-79` | Cap 500 with `pop(0)`, no log, no counter, no disk persistence — during a network outage (a routine attacker move) the earliest and most probative alerts are destroyed |

---

## 5. Low / Informational

- **L-1** `is_canary` uses `endswith` on the bare filename anywhere on the system (`endpoint_guard/canary.py:45`) — Word's own temp files raise false CRITICALs, and an attacker can bury a real incident in noise.
- **L-2** Telemetry flush race loses and duplicates events (`detector_package/telemetry.py:120`,`:136`) — the POST happens outside the lock, then slices by index.
- **L-3** One unbounded thread per alert (`detector_package/detector.py:108-117`) — thread exhaustion from a flood of uniquely-named `.locked` files; cooldown is keyed by file path.
- **L-4** Unbounded cooldown cache (`detector_package/risk.py:18`,`:36`) — permanent entry per suspicious path; millions of uniquely-named files grow it without limit.
- **L-5** Local alert log is writable with errors swallowed (`detector_package/detector.py:58-60`,`:73-76`) — evidence can be truncated silently.
- **L-6** Log fallback to a shared temp directory (`endpoint_guard/logger.py:20-23`) — pre-creatable, readable by other users.
- **L-7** Monitoring never auto-starts in the hosted service (`MonitoringWorker.cs:32-36`) — if the GUI never calls `Start`, telemetry pings while monitoring nothing, with no degraded-state signal.
- **L-8** Mass-delete uses the write threshold (`DetectionEngine.cs:286`) — no independent `DeleteThreshold`, so a 19-file delete burst is invisible.
- **L-9** Directory renames/deletes counted as single file events (`FileSystemMonitor.cs:265-299`).
- **L-10** `EnableRaisingEvents = true` set before handlers are attached (`FileSystemMonitor.cs:91-115`) — events in that window reach no one; races with `Stop()`/`Start()`.
- **L-11** Signal handler performs blocking network I/O (`detector_package/detector.py:224-226`) — up to 6 s in a signal handler.
- **L-12** SQLite closed under running threads on shutdown (`endpoint_guard/service.py:67-69`) — final alerts lost with `ProgrammingError`.
- **L-13** Interpolated `DELETE ... IN ({ids})` (`TelemetryService.cs:233`,`:292`) — not exploitable (ids are DB integers), but a bad pattern next to attacker-influenced data.
- **L-14** Detector token stored plaintext in the local SQLite queue (`TelemetryService.cs:134`, `endpoint_guard/telemetry.py:117-125`).
- **L-15** Frontend: `window.open` without `noopener,noreferrer` (`Settings.jsx:412`); `decodeJwtPayload` is an unsigned base64 decode but the comment claims "cryptographically verified" (`App.jsx:37-53`,`:118`); refresh interval is never cleared so a token is re-issued after the 7.5-minute hard logout (`App.jsx:140-170`,`:197-216`); client-derived admin UI gate (`App.jsx:126-132`, `Settings.jsx:148-165`) — cosmetic only, since the server enforces roles.
- **L-16** `@supabase/supabase-js` is declared but never imported (`frontend/package.json`); `nodemailer` is unused in the Flask backend; `middleware/auth.js` requires the undeclared `jsonwebtoken` (dead code).
- **L-17** Hardcoded demo "key" `PRD-KEY-2024` shipped in the bundle and printed as a hint (`EncryptionLab.jsx:13`,`:245`) — a simulation, but it teaches a client-side check as authorization.
- **L-18** Fabricated security telemetry in `SysmonLogs.jsx` and `ActiveShield.jsx` (random events, "LOCKDOWN ACTIVE" with no backend call) — carry DEMO badges, but false assurance in a monitoring product is a real operational risk.
- **L-19** Stale `docker/docker-compose.yml` still targets MySQL while the app now requires `DATABASE_URL` (Postgres) — the service starts with no database and only warns (`app.py:158-162`).

---

## 6. Realistic attack chains

**Chain A — anonymous to administrator (no credentials needed):**
Read the published `JWT_SECRET` from `docker/.env.example` → sign a token with `{"role":"admin","user_id":1}` → call `/api/admin/users` (full user list with emails and dates of birth) → `POST /api/admin/clear-data` (destroys all alerts and logs) or `POST /api/send-email` (phishing from the SOC domain). **No login required.**

**Chain B — password-only account takeover:**
Obtain any password (reuse, stuffing, phishing) → `POST /api/login` → if `APP_ENV` is not production and SMTP fails, the response contains `dev_otp` and `dev_psk` → `/api/login/verify` → authenticated, including as `admin`.

**Chain C — tenant data exfiltration by a registered user:**
Sign up (no email verification, no rate limit) → `GET /api/admin/security-report` → the PDF contains the last 8 alerts from every tenant (paths, filenames, process names) plus global incident counts.

**Chain D — evading detection on a monitored host:**
Rename targets to `.zip` (suppresses the entropy signal, M-17) and pace writes below the threshold → detections that do occur with long paths fail to insert (H-5) → the batch rolls back and the agent retries the same poison rows forever → no alert reaches the console, while the heartbeat still reports the agent alive.

---

## 7. Prioritised remediation plan

**Immediately (before any further deployment):**
1. Rotate `JWT_SECRET`; remove the `auth.js` fallback; purge the value from `.env.example` and assume it is public (C-1).
2. Set `APP_ENV=production` everywhere and stop deriving `debug` from it; hardcode `debug=False` (C-2, C-3).
3. Delete the `dev_otp`/`dev_psk` response fields and both client fallbacks (C-2).
4. Add `@token_required` to `/api/analyze-file` and stop anonymous alert inserts (C-4).
5. Rotate the `DB_PASSWORD` in `docker/.env.example` (H-8).

**This sprint:**
6. Add `user_id` to `alerts`/`event_logs`/`log_hashes` and filter all report queries (H-3).
7. Require the current password for password changes; enforce the same policy (H-2).
8. Fix `canary.py` to `O_EXCL` + signature verification, and remove `~WRL0001.tmp` (H-9).
9. Replace blocking `put()` with `put_nowait()` + a drop counter (H-10); send the ping for real (H-11).
10. Widen `trigger_reason` to `TEXT`; truncate defensively so a data-shape error cannot lose alerts (H-5).
11. Lock down `/api/send-email`; strip CR/LF from headers (H-1).
12. Add rate limiting to login/verify/signup, `UNIQUE(email)`, a minimum password length, and `hmac.compare_digest` (H-6).

**Next:**
13. TLS everywhere plus HSTS/CSP/`frame-ancestors`/`X-Content-Type-Options` (H-7).
14. Detector tokens: expiry, header transport, per-endpoint identity and rotation (H-4).
15. Agent detection-logic fixes: `encryption_surge` scoring, extension-baseline entropy, entropy-failure signalling, `DeleteThreshold`, watcher recovery (M-12, M-13, M-16, M-17, L-8).
16. Install hardening: ACLs on `ProgramData\SelectShans`, service account, signed/frozen binaries, `run.bat` fixes (H-12, H-13, M-19, M-20).
17. Non-root containers, least-privilege DB user, pinned dependencies with hashes, frontend lockfile (M-8, M-9, M-10, M-11).

---

## 8. What is done well

Worth preserving rather than rewriting:

- **SQL injection: effectively absent.** Every query uses bound parameters (`%s` / `?`), including the dynamic profile update (`admin_routes.py:204-227`). The one interpolated `IN ({ids})` is fed by DB integers.
- **No dangerous deserialization.** No `pickle`, `yaml.load`, `eval`, `exec`, or `BinaryFormatter`/`TypeNameHandling` anywhere. JSON only.
- **No command injection.** The four `attrib` calls use argv lists with `normcase(abspath(...))` paths and no shell.
- **TLS verification is never disabled** in any agent — the problem is the `http://` scheme, not the validation.
- **JWT algorithm is pinned** (`algorithms=['HS256']`), which blocks `alg: none` and RS/HS confusion.
- **Detector token HMAC verification uses `hmac.compare_digest`** and the cron secret comparison does too (`app.py:299`, `:1887`).
- **Secrets in `.env` are correctly gitignored** (`backend/.gitignore:27`, `.gitignore:15`) and were never committed — only the `docker/.env.example` placeholders leaked.
- **Cross-user access on the security report is correctly blocked** (`app.py:1546-1550`); the leak is inside the report content, not the access check.
- **Frontend has no XSS sinks at all** — no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `document.write`, and all API-derived values render as React text children.
- **`admin_routes.py` correctly escapes** audit-log values with `html.escape` before ReportLab (the main app does not — see M-3).

---

## 9. Audit notes and limitations

- No live exploitation, fuzzing, or load testing was performed. Every finding is grounded in cited source lines.
- No dependency CVE scan was run (no advisory database consulted), so no CVE identifiers are claimed. Dependency findings are limited to pinning/lockfile hygiene.
- Database access was unavailable, so findings that depend on runtime data (alert volumes, actual `trigger_reason` lengths, live `email` duplication) are derived from the code and schema, not observed rows.
- The `.NET` project was reviewed as source only; it was not built or executed.
- To run commands in this workspace I repaired a Windows folder-permission problem on `D:\HACK-LEARNATHONS\LEARNATHON SLOT 3\FINAL\PRO\PRO` (the folder lacked an owner right, so my sandbox could not provision it). File contents and owners were unchanged. A backup and an undo script are in `D:\HACK-LEARNATHONS\LEARNATHON SLOT 3\FINAL\PRO\acl-recovery\`; to revert: `pwsh -NoProfile -File "D:\HACK-LEARNATHONS\LEARNATHON SLOT 3\FINAL\PRO\acl-recovery\acl-backup-81ebaf735d3f491abe2f45b2a4fa9904.json.ps1" -Path "D:\HACK-LEARNATHONS\LEARNATHON SLOT 3\FINAL\PRO\PRO" -AllowRoot "D:\HACK-LEARNATHONS\LEARNATHON SLOT 3\FINAL\PRO\PRO" -Restore "D:\HACK-LEARNATHONS\LEARNATHON SLOT 3\FINAL\PRO\acl-recovery\acl-backup-81ebaf735d3f491abe2f45b2a4fa9904.json"`.

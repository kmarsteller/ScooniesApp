# Scoonies Infrastructure Overview

A plain-English explanation of every service involved in running scoonies.com and how they connect.

---

## The Big Picture

When someone visits scoonies.com, types in their bracket, and receives a confirmation email, here is the chain of things that happen — and the companies involved at each step.

```
User's browser
     ↓
GoDaddy (owns the domain name "scoonies.com")
     ↓
Cloudflare (handles DNS + HTTPS)
     ↓
DigitalOcean (the actual server running the app)
     ↓
Node.js / Express (the app itself)
     ↓
SQLite (the database living on the server)
     ↓
Brevo (sends emails)
```

---

## GoDaddy — Domain Registrar

**What it does:** GoDaddy is where the domain name `scoonies.com` is *owned and registered*. Think of it like paying rent on the name itself. GoDaddy doesn't actually handle any web traffic or DNS anymore — it just holds the registration and renews it each year.

**What you need to do there:** Almost nothing day-to-day. Just make sure the annual renewal doesn't lapse. The nameservers are pointed at Cloudflare, so GoDaddy is essentially just the landlord who holds the deed.

---

## Cloudflare — DNS + HTTPS

**What it does:** Cloudflare is the traffic cop for scoonies.com. When anyone types `scoonies.com` into a browser, their computer asks Cloudflare "where is this?" and Cloudflare answers with the IP address of the DigitalOcean server. It also:

- **Provides HTTPS** — the padlock in the browser. Cloudflare issues and renews the SSL certificate automatically so your site is served over `https://`.
- **Hosts DNS records** — all the settings that tell the internet where scoonies.com lives, where its email comes from, etc.

**DNS records currently configured in Cloudflare:**
| Type | Name | Purpose |
|------|------|---------|
| A | scoonies.com | Points the domain to the DigitalOcean server's IP address |
| TXT | scoonies.com | SPF record — tells email servers that Brevo is allowed to send on your behalf |
| TXT | brevo._domainkey | DKIM record — a cryptographic signature proving emails are really from you |
| TXT | _dmarc | DMARC record — instructs email providers what to do with fake/spoofed emails |

The SPF/DKIM/DMARC records are what allow emails to be sent *from* `thescoonies@scoonies.com` without being flagged as spam.

**What you need to do there:** Nothing regularly. If the DigitalOcean server ever gets a new IP address, you'd update the A record here.

---

## DigitalOcean — The Server (Droplet)

**What it does:** DigitalOcean hosts the actual computer ("droplet") that runs the Scoonies app 24/7. It's a Linux server sitting in a data center. When Cloudflare directs someone to scoonies.com, the request lands here.

**What's running on it:**
- **Nginx** — a web server that receives incoming traffic on ports 80 (HTTP) and 443 (HTTPS) and forwards it to the Node.js app
- **Node.js / Express** — the Scoonies app itself, running on port 3000
- **pm2** — a process manager that keeps the Node.js app running. If the app crashes, pm2 restarts it automatically. This is also how the app survives server reboots.
- **SQLite** — the database, stored as a single file (`scoonies.db`) directly on the droplet's disk

**How Nginx and Node.js work together:** Nginx sits in front and handles the public-facing connection. It passes requests through to Node.js on port 3000 (this is called a "reverse proxy"). Users never connect directly to port 3000.

**Key commands on the droplet:**
```bash
pm2 list              # see if the app is running
pm2 restart all       # restart the app (e.g. after deploying new code)
pm2 logs --lines 50   # see recent server output / errors
npm install --production  # install/update dependencies after a deploy
```

---

## Node.js / Express — The Application

**What it does:** This is the Scoonies app itself — the code in this repository. Express is the web framework that handles incoming requests and routes them to the right place.

**Key parts:**
- `server.js` — the entry point, wires everything together
- `routes/admin.js` — all admin functionality (login, bracket management, scoring)
- `routes/entries.js` — handles bracket submissions from participants
- `routes/standings.js` — serves the public standings page data
- `routes/communications.js` — admin email sending (all participants, payment reminders, scoring updates)
- `routes/bracket.js` — serves bracket data for the public bracket page
- `services/email-service.js` — the bridge between the app and Brevo
- `utils/scoring.js` — the points calculation logic
- `utils/filename.js` — converts team names to logo filenames
- `db/database.js` — sets up and manages the SQLite database

---

## SQLite — The Database

**What it does:** SQLite stores all of the Scoonies data. Unlike most databases that run as a separate service, SQLite is just a single file on disk. Simple, fast, and zero maintenance.

**What's stored in it:**
| Table | Contents |
|-------|----------|
| `entries` | Every bracket submission — player name, email, entry name, payment status |
| `team_selections` | Each team picked per entry, and points earned |
| `tournament_progress` | The 64 teams, their seeds/regions, and how far they advanced |
| `admin_users` | Admin login credentials (passwords are bcrypt-hashed) |
| `system_settings` | App-wide toggles (entries open/closed, team visibility) |

**Important:** The database file lives on the DigitalOcean droplet. It is NOT in this Git repository and is NOT backed up automatically. If the droplet is destroyed, the data is gone. Consider periodically downloading a backup copy of `scoonies.db`.

---

## Brevo — Transactional Email

**What it does:** Brevo (formerly Sendinblue) is the service that actually sends emails. The app never sends email directly — it calls Brevo's API and Brevo does the delivery.

**Why Brevo instead of Gmail:** Gmail's security policies (DMARC) block third-party apps from sending email that claims to be from a `@gmail.com` address. Brevo is an authenticated sending service, and because `scoonies.com` has SPF/DKIM/DMARC records in Cloudflare, emails sent via Brevo from `thescoonies@scoonies.com` are fully trusted by Gmail, Yahoo, Outlook, etc.

**Emails the app sends:**
1. **Confirmation email** — sent automatically when a participant submits a bracket. Shows their full entry with team picks by region, and payment instructions.
2. **Custom blast** — admin can write a message and send it to specific recipients or all participants.
3. **Payment reminder** — sent to all unpaid participants, with Venmo/PayPal links.
4. **Scoring update** — sends the full current leaderboard to all participants.

**Credentials:** The Brevo API key lives in the `.env` file on the server (not in Git). It is never committed to the repository.

**Where to manage it:** `app.brevo.com` — you can see sent email history, check delivery status, and manage the API key here.

---

## The `.env` File — Secrets

**What it does:** Stores sensitive configuration that should never be in the code or Git history. The app reads this file at startup.

**Current contents (structure — not the actual values):**
```
BREVO_API_KEY=         # Brevo API key for sending email
FROM_EMAIL=            # thescoonies@scoonies.com
REPLY_TO=              # thescoonies.basketball@gmail.com
SESSION_SECRET=        # Random secret for securing admin login sessions
SITE_URL=              # https://scoonies.com (used for email image URLs)
```

This file exists in two places: on your local machine and on the DigitalOcean droplet. It is listed in `.gitignore` and is never pushed to any repository.

---

## Selection Sunday Workflow

When the 2026 bracket is announced, here's the full process to update the site:

1. **Update `public/teams.csv`** with the real 64 teams, seeds, regions, and ESPN logo URLs
2. **Run `node scripts/download-logos.js`** on the droplet — downloads all 64 team logos from ESPN into `public/images/logos/`
3. **Deploy the new code** to the droplet via Git pull
4. **Run `npm install --production`** on the droplet if dependencies changed
5. **Use the Admin → Tournament Bracket → Re-seed the Field** UI to upload the CSV and replace the bracket (this also clears any test entries)
6. **Run `npm test`** locally first to make sure nothing is broken before deploying

---

## Summary — Who Does What

| Service | Role | You log in at |
|---------|------|---------------|
| GoDaddy | Owns the domain name | godaddy.com |
| Cloudflare | DNS + HTTPS + email auth records | cloudflare.com |
| DigitalOcean | Runs the server | digitalocean.com |
| Brevo | Sends all emails | app.brevo.com |
| GitHub (optional) | Stores the code | github.com |

The app itself, the database, and the logo images all live on the DigitalOcean droplet.

---

## Backing Up the Database

The SQLite database (`scoonies.db`) is the only thing that can't be recreated from code — it holds every entry, payment status, and tournament result. It lives exclusively on the DigitalOcean droplet and is not backed up automatically.

**When to back up:**
- Before Selection Sunday (before you reseed the bracket and open entries)
- Once entries are rolling in (every few days during entry week)
- Before any major admin action like clearing entries or reseeding

**How to back up — run this from your local machine:**

```bash
# Replace YOUR_DROPLET_IP with the actual IP address from DigitalOcean
scp root@YOUR_DROPLET_IP:/root/ScooniesApp/scoonies.db ~/Desktop/scoonies-backup-$(date +%Y-%m-%d).db
```

This copies the database file to your Desktop with today's date in the filename, e.g. `scoonies-backup-2026-03-20.db`.

**How to find your droplet IP:** Log into digitalocean.com → Droplets — the IP address is listed right there.

**How to restore from a backup if something goes wrong:**

```bash
# Copy the backup back up to the server (replace filename and IP as needed)
scp ~/Desktop/scoonies-backup-2026-03-20.db root@YOUR_DROPLET_IP:/root/ScooniesApp/scoonies.db

# Then restart the app on the droplet
ssh root@YOUR_DROPLET_IP
pm2 restart all
```

**To verify a backup is readable** (optional, but reassuring):

```bash
sqlite3 ~/Desktop/scoonies-backup-2026-03-20.db "SELECT COUNT(*) FROM entries;"
```

This should print the number of entries in the backup. If it prints a number, the file is intact. (`sqlite3` is built into macOS.)

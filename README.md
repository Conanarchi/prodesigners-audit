# ProDesigners: Pre-Construction Audit portal

This is one small Node.js app that runs three things:

| Address | What it is |
|---|---|
| `/` | Public website (also published to GitHub Pages) for the service, with the 4-step request form and file upload. This is the link you share on LinkedIn and Instagram. |
| `/admin` | Team dashboard. See requests, open the client's Nextcloud folder, and send the price by email and WhatsApp. |
| `/q/AS-26-0001?t=…` | Quotation page the client receives. It shows the price and has an **Accept quotation** button. |

## What happens when a client applies

1. The client fills in the form on their phone or computer and uploads their PDF/DWG/RVT/IFC/ZIP files.
2. The server creates a folder in your Nextcloud and streams the files straight into it:
   ```
   AS-26-0001 - Mohammed Al-Kuwari - Al-Kuwari Villa/
     01 Client Drawings/     ← uploaded files
     02 BIM Model/
     03 Clash Detection/
     04 Audit Report/
     Project Info.txt        ← every answer from the form
     _submission.json
   ```
   Reference numbers count up (`AS-26-0001`, `AS-26-0002`, …), so folders sort in the order requests arrive.
3. The team gets an email with every detail, a link to the folder and a link to the dashboard. The client gets a confirmation email.
4. In `/admin`, open the request, type the price, and press **Send quotation**.
   - **Email** goes out automatically: a branded quote with an Accept button.
   - **WhatsApp** is sent automatically if the WhatsApp Cloud API is set up (see below). Without it, WhatsApp opens with the quote already written and you just press Send.
   - A copy, `Quotation AS-26-0001.html`, is saved in the client's Nextcloud folder.
5. When the client presses **Accept**, the status changes to *accepted* and the team gets an email.

---

## Free hosting: GitHub Pages + Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Conanarchi/prodesigners-audit)

**1. Upload server (Render, free):** click the button above and sign in with GitHub. Render reads `render.yaml` and asks for:

| Setting | What to enter |
|---|---|
| `NEXTCLOUD_SHARE_URL` | Your Nextcloud share link. Turn on **"Allow upload and editing"** on it first. |
| `NEXTCLOUD_SHARE_PASSWORD` | Only if the link has a password; otherwise leave it empty. |
| `ADMIN_PASSWORD` | The password for the team dashboard. |
| `COMPANY_WHATSAPP` | WhatsApp number, digits only, e.g. `97455551234`. |
| `BREVO_API_KEY` | For emails (see section 3). |

Your server will be at `https://prodesigners-audit.onrender.com`, and the dashboard at `/admin`.
If Render gives a different address, update `apiBase` in `public/site-config.js`, and `PUBLIC_URL` in Render.

**2. Website (GitHub Pages, free):** published automatically from the `gh-pages` branch (Settings → Pages → Branch: `gh-pages` / root).
Every push to `main` publishes the site to `https://conanarchi.github.io/prodesigners-audit/`. This is the link to share.

**Limits of the free plan:**
- The server sleeps after 15 minutes without visitors, and wakes in about 1 minute. The page wakes it as soon as someone opens it.
- 5 GB of transfer per month.
- Email must go through Brevo, because SMTP ports are blocked.

For no limits, run it on your own server (below), or switch Render to the "Starter" plan.

**Never commit `.env` or your Nextcloud link.** This repo is public. All secrets live in Render → Environment.

## Own server (no limits)

```bash
git clone https://github.com/Conanarchi/prodesigners-audit /opt/prodesigners-audit
cd /opt/prodesigners-audit
cp .env.example .env && nano .env
docker compose up -d --build
```
Point `audit.prodesigners-qatar.com` at the server and use `nginx-audit.conf` as the reverse proxy, then run `sudo certbot --nginx -d audit.prodesigners-qatar.com`.
Set `PUBLIC_URL=https://audit.prodesigners-qatar.com`. The website, dashboard and quote pages are then all served from there.
Without Docker: install Node 18 or later, then run `npm ci --omit=dev && node server.js`.

After deploying, sign in at `/admin` → **Setup** to test the Nextcloud upload and send a test email.

## 3. Email

**Brevo (free, 300 emails/day, works on Render free):**
1. Sign up at brevo.com.
2. Go to **Senders, domains & dedicated IPs → Add a sender**, enter Contact@prodesigners-qatar.com, and click the confirmation link Brevo emails you.
3. Go to **SMTP & API → API keys → Generate**, then paste the key into `BREVO_API_KEY`.

**Or SMTP (own server only).** Use the mailbox you want quotes to come from:

| Provider | SMTP_HOST | SMTP_PORT | SMTP_SECURE |
|---|---|---|---|
| Microsoft 365 / Outlook | smtp.office365.com | 587 | false |
| Google Workspace | smtp.gmail.com | 465 | true (use an App Password) |
| cPanel hosting | mail.prodesigners-qatar.com | 465 | true |

Until SMTP is set, emails are saved in `data/outbox/` instead of being sent, so nothing is lost.

## 4. WhatsApp: fully automatic sending (optional)

Out of the box, the dashboard opens WhatsApp Web or the app with the quotation ready to send. That takes one tap and needs no setup.

For true automatic sending:
1. Create a Meta Business account, then go to **WhatsApp → API Setup** at developers.facebook.com. Add your business number. That number can't stay on the normal WhatsApp app at the same time.
2. Create a permanent access token (System User) → `WHATSAPP_TOKEN`, and copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
3. Create a **message template** named `audit_quotation` (category *Utility*, language English) with this body:
   ```
   Hello {{1}}, your Pre-Construction Audit quotation for {{2}} is ready: {{3}} (ref {{4}}). Tap below to view the details and accept.
   ```
   Add a **URL button** labelled "View quotation" with the dynamic URL `https://audit.prodesigners-qatar.com/q/{{1}}`.
4. After Meta approves the template, restart the app. Quotes are then sent automatically on WhatsApp as well as by email.

## Files

```
server.js            routes: form API, streamed uploads, dashboard, quotations
lib/config.js        all settings (from .env)
lib/webdav.js        Nextcloud connection (share link or user)
lib/templates.js     emails, Project Info.txt, quotation document
lib/notify.js        SMTP email + WhatsApp Cloud API
lib/store.js         small JSON index in data/ (mirrored to Nextcloud)
public/              website, form, dashboard, quote page, images
```

To change texts on the website, edit `public/index.html`. Phone, email and WhatsApp for the buttons come from `.env`.

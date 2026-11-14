# FORGCV GROWTH COMMAND CENTER — Deployment Guide
## Production Setup: Vercel + Supabase (Free Tier)

---

## Step 1 — Create Supabase Project (Free)

1. Go to **supabase.com** → Sign up (free)
2. Create new project → name it `forgcv-growth`
3. Note your **Project URL** and **anon key** (Settings → API)
4. Note your **service_role key** (Settings → API → Service Role)
5. Go to **SQL Editor** → paste the content of `supabase/migrations/001_initial_schema.sql` → Run

---

## Step 2 — Create Telegram Bot (Free)

1. Open Telegram → search **@BotFather**
2. Type `/newbot` → follow instructions → name it `ForgCV Growth Bot`
3. Copy the **Bot Token**
4. Start a chat with the bot (send `/start`)
5. Get your **Chat ID**: visit `https://api.telegram.org/bot{TOKEN}/getUpdates` → find `"chat":{"id":...}`

---

## Step 3 — Configure Claude API

1. Go to **console.anthropic.com** → API Keys → Create new key
2. Note the key (starts with `sk-ant-...`)

---

## Step 4 — Social Accounts Setup

### Instagram
1. Convert your Instagram account to **Professional Account** (Instagram app → Settings → Account)
2. Go to **developers.facebook.com** → Create app → Business type
3. Add **Instagram Graph API** product
4. Add Instagram account → get **Business Account ID** and **Access Token**
5. Required permissions: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`

### LinkedIn
1. Go to **linkedin.com/developers** → Create app
2. Add **Share on LinkedIn** and **Sign In with LinkedIn** products
3. Required OAuth permission: `w_member_social`
4. Get Access Token via OAuth flow

### Reddit
1. Go to **reddit.com/prefs/apps** → Create App → type: **script**
2. Set redirect URI to `http://localhost` (not used but required)
3. Note **client_id** (under app name) and **secret**
4. Use your Reddit username/password for authentication

### TikTok
1. Go to **developers.tiktok.com** → Create app
2. Add **Content Posting API** permission
3. Submit for platform audit (**this takes 2-4 weeks, cannot be bypassed**)
4. Until approved: system will prepare videos for manual upload

### X (Twitter)
1. Go to **developer.twitter.com** → Apply for Elevated Access (free)
2. Create app → get API keys and access tokens
3. Required: Read + Write permissions on OAuth 1.0a

---

## Step 5 — Set Up GitHub Repository

```bash
cd /Users/halimbelkacem/Desktop/forgcv-growth
git init
git add .
git commit -m "Initial: ForgCV Growth Command Center"
git remote add origin https://github.com/YOUR_USERNAME/forgcv-growth.git
git push -u origin main
```

---

## Step 6 — Deploy to Vercel (Free)

1. Go to **vercel.com** → Import Project → GitHub → select `forgcv-growth`
2. Framework: **Next.js** (auto-detected)
3. Add Environment Variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` |
| `CRON_SECRET` | Generate: `openssl rand -base64 32` |
| `INSTAGRAM_ACCESS_TOKEN` | (when ready) |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | (when ready) |
| `LINKEDIN_ACCESS_TOKEN` | (when ready) |
| `REDDIT_CLIENT_ID` | (when ready) |
| `REDDIT_CLIENT_SECRET` | (when ready) |
| `REDDIT_USERNAME` | (when ready) |
| `REDDIT_PASSWORD` | (when ready) |
| `TWITTER_ACCESS_TOKEN` | (when ready) |

4. Deploy → note your production URL

---

## Step 7 — Configure Vercel Cron Jobs

Vercel automatically reads `vercel.json` for cron configuration.
The file is already set up with:
- `0 6 * * *` = Every day at 06:00 UTC (= 07:00 Amsterdam) → generates daily campaign
- `*/15 * * * *` = Every 15 minutes → publishes scheduled posts

**Cron jobs require Vercel Hobby plan or higher** (free for hobby projects with limits).

---

## Step 8 — Add .gitignore

Create `.env.local` with your actual values (NEVER commit this):
```bash
cp .env.example .env.local
# Edit .env.local with your real values
```

---

## Daily Operation Flow

1. **06:00 UTC (07:00 Amsterdam)**: Vercel Cron triggers `/api/briefing/generate`
2. AI agents (Researcher → CMO → Specialists → QC) generate the campaign
3. Telegram notification sent to your iPhone with campaign summary + dashboard link
4. You open the dashboard on your phone
5. Review posts, edit if needed
6. Tap **"Approve & Schedule"** — one click
7. Vercel Cron publishes posts at their scheduled times throughout the day
8. Failed publications are reported via Telegram

---

## Cost Estimate

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Hobby | Free |
| Supabase | Free Tier | Free |
| Claude API | Pay per use | ~$0.50-2/day depending on content volume |
| Telegram Bot | Free | Free |
| Instagram API | Free | Free |
| LinkedIn API | Free | Free |
| Reddit API | Free | Free |

**Monthly estimated cost: $15-60/month in Claude API usage depending on activity.**

---

## Production Checklist

- [ ] Supabase project created + schema migrated
- [ ] Telegram bot created and verified
- [ ] Claude API key added
- [ ] GitHub repo initialized
- [ ] Vercel deployed with all env variables
- [ ] Dashboard accessible from phone
- [ ] At least one social account connected
- [ ] Test campaign generated manually from dashboard
- [ ] Telegram notification received
- [ ] Cron jobs active (check Vercel → Project → Cron Jobs)

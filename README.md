# Period Tracker Telegram Bot

* 🇺🇸 [English](https://github.com/kiaashkan/period-tracker-bot/blob/main/README.md)
* 🇮🇷 [فارسی](https://github.com/kiaashkan/period-tracker-bot/blob/main/README-FA.md)


A Cloudflare Worker Telegram bot that predicts the next period start date based on a fixed cycle length, and sends automatic reminders as it approaches (7, 3, 2, 1 days before, and the day of). Bilingual — English and Persian, chosen from within Telegram.

## How it works

- You tell the bot the last period start date once (`/setstart`).
- The bot assumes a fixed cycle length (default 28 days) and automatically keeps predicting forward — no need to update it every month.
- A scheduled job (Cron Trigger) runs once a day and checks how many days are left until the next predicted date, sending a Telegram message at 7, 3, 2, 1 days before, and on the day itself.
- Data (start date, cycle length, period length, language) is stored in a Cloudflare D1 database.

## Setup — Cloudflare Dashboard only (no terminal needed)

### 1. Create a Telegram bot
- Open Telegram, search for **@BotFather**, send `/newbot`, follow the prompts.
- BotFather gives you a **token** (looks like `123456:ABC-...`) — save it, you'll need it later.
- Send any message to your new bot once (so Telegram has a chat with you).
- To get your **chat ID**, open this URL in your browser (replace `<TOKEN>`):
  `https://api.telegram.org/bot<TOKEN>/getUpdates`
  Look for `"chat":{"id": ...}` in the response — that number is your `CHAT_ID`.

### 2. Create the Worker
- Go to the [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**.
- Give it a name (e.g. `period-tracker-bot`) → **Deploy** (this deploys a placeholder — that's fine, we'll replace the code next).

### 3. Add the code
- Open your new Worker → look for a button like **Edit code** (sometimes on the Overview tab).
- Delete everything in the editor and paste the full contents of `Worker.js` from this repo.
- Click **Save and Deploy**.

### 4. Create the D1 database
- In the Cloudflare dashboard sidebar, find **Storage & Databases** → **D1 SQL Database** → **Create**.
- Name it (e.g. `period-db`) → **Create**.
- Open the new database → go to the **Console** tab → paste and run:
  ```sql
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  ```
  (this is also in `Schema.sql` in this repo)

### 5. Connect the database to the Worker
- Go back to your Worker → **Bindings** tab → **Add** → choose **D1 database**.
- Select the database you just created.
- Set the **Variable name** to exactly `DB` (the code expects this name).
- Save.

### 6. Add secrets
- In your Worker → **Settings** → **Variables and secrets** → **Add**.
- Add two **Secret** type variables:
  - `BOT_TOKEN` — the token from BotFather
  - `CHAT_ID` — the chat ID you found earlier

### 7. Add the daily Cron Trigger
- In your Worker → **Settings** → **Trigger events** (Cron Triggers) → **Add**.
- Switch to the **Cron expression** tab and enter:
  ```
  0 9 * * *
  ```
  (runs every day at 9:00 AM UTC — adjust the hour if you want a different time)
- Click **Add**.

### 8. Connect Telegram to the Worker (webhook)
- Open this URL in your browser (replace `<TOKEN>` with your bot token and `<your-worker>` with your Worker's actual subdomain, shown on the Worker's Overview page):
  ```
  https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev
  ```
- You should see `{"ok":true,"description":"Webhook was set"}`.

### 9. Configure the bot from Telegram
Open a chat with your bot and send, in order:
```
/start          → pick a language (English or فارسی)
/setstart YYYY-MM-DD   → the last known period start date
/setcycle 28    → cycle length in days (optional, 28 is the default)
/setlength 5    → period length in days (optional, 5 is the default)
/next           → check that the prediction looks right
```

That's it — from now on the bot checks automatically every day and messages you when the next period is approaching.

## Setup — Wrangler CLI (alternative, if you prefer a terminal)

```bash
wrangler d1 create period-db
# copy the database_id it prints into Wrangler.toml

wrangler d1 execute period-db --file=./Schema.sql --remote

wrangler secret put BOT_TOKEN
wrangler secret put CHAT_ID

wrangler deploy

curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev"
```

## Bot commands

| Command | Description |
|---|---|
| `/start` | Pick a language |
| `/setlang` | Change language later |
| `/setstart YYYY-MM-DD` | Record the last period start date (required once) |
| `/setcycle N` | Set cycle length in days (default 28) |
| `/setlength N` | Set period length in days (default 5) |
| `/next` | Show the next predicted start date, or days left if currently in a period |

Persian-digit input (e.g. `۵`) is also accepted for numeric commands.

## Files

- `Worker.js` — the Worker code
- `Wrangler.toml` — Worker configuration (fill in your `database_id`)
- `Schema.sql` — the D1 table schema

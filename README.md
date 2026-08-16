# Period Tracker Telegram Bot

* 🇺🇸 [English](https://github.com/kiaashkan/period-tracker-bot/blob/main/README.md)
* 🇮🇷 [فارسی](https://github.com/kiaashkan/period-tracker-bot/blob/main/README-FA.md)


A Cloudflare Worker Telegram bot that predicts the next period start date based on cycle length, and sends automatic reminders as it approaches (7, 3, 2, 1 days before, and the day of). Supports two people sharing one cycle: one person tracks it, the other follows along via an invite link and gets the same predictions and reminders.

## How it works

- **Owner** — the person actually tracking: they send `/setstart` (or `/today`) once, and the bot keeps predicting forward automatically from a fixed cycle length. No need to update it every month unless the real date drifts.
- **Viewer** — anyone the owner invites (`/invite`): they follow the owner's data without entering anything themselves, and get the exact same reminders.
- A daily scheduled job (Cron Trigger) checks how many days are left until the next predicted date and messages everyone involved — the owner and all their viewers — at 7, 3, 2, 1 days before, and on the day itself. Each alert includes a **"How's today?"** button for an instant status check.
- `/history` shows the real length of past cycles (computed from every date you've actually recorded), not just the fixed number you set with `/setcycle`.
- All data is stored in a Cloudflare D1 database.

## Setup — Cloudflare Dashboard only (no terminal needed)

### 1. Create a Telegram bot
- Open Telegram, search for **@BotFather**, send `/newbot`, follow the prompts.
- BotFather gives you a **token** (looks like `123456:ABC-...`) and a **username** (e.g. `mybot`, without the `@`) — save both.
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
- Open the new database → go to the **Console** tab → paste and run the full contents of `Schema.sql` from this repo (creates the `profiles`, `links`, and `cycle_history` tables).

### 5. Connect the database to the Worker
- Go back to your Worker → **Bindings** tab → **Add** → choose **D1 database**.
- Select the database you just created.
- Set the **Variable name** to exactly `DB` (the code expects this name).
- Save.

### 6. Add secrets and variables
- In your Worker → **Settings** → **Variables and secrets** → **Add**.
- Add two **Secret** type variables:
  - `BOT_TOKEN` — the token from BotFather
  - `CHAT_ID` — your chat ID from step 1
- Add one plain **Text** variable:
  - `BOT_USERNAME` — your bot's username from step 1 (without `@`) — used to build clickable invite links

### 7. Add the daily Cron Trigger
- In your Worker → **Settings** → **Trigger events** (Cron Triggers) → **Add**.
- Switch to the **Cron expression** tab and enter:
  ```
  0 21 * * *
  ```
  (runs once a day; adjust the hour to whenever you'd like reminders to arrive)
- Click **Add**.

### 8. Connect Telegram to the Worker (webhook)
- Open this URL in your browser (replace `<TOKEN>` with your bot token and `<your-worker>` with your Worker's actual subdomain, shown on the Worker's Overview page):
  ```
  https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev
  ```
- You should see `{"ok":true,"description":"Webhook was set"}`.

### 9. Start using it
Open a chat with your bot and send `/start`. You'll be asked to choose:
- **Track for myself** — then send `/setstart YYYY-MM-DD` (or `/today`) to begin.
- **I have an invite code** — then send `/link CODE` using a code your partner shared.

Once set up, the owner can send `/invite` to get a code and a tappable link — sharing that link with a partner lets them join with one tap, no typing required.

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

Set `BOT_USERNAME` as a plain variable in `Wrangler.toml` under `[vars]`, or add it from the dashboard as described above.

## Bot commands

| Command | Description |
|---|---|
| `/start` | Choose how to use the bot (track for yourself, or follow someone via invite) |
| `/next` | Predicted next start date, or days left if currently in a period |
| `/today` | Mark today as the period start date (shortcut for `/setstart` with today's date) |
| `/setstart YYYY-MM-DD` | Record your last period start date |
| `/setcycle N` | Set cycle length in days (default 28) |
| `/setlength N` | Set period length in days (default 5) |
| `/history` | Show recent cycles and their actual length |
| `/invite` | Get a code and link to share with your partner |
| `/link CODE` | Follow someone else's cycle using their invite code |
| `/unlink` | Stop following someone else's cycle |
| `/removeprofile` | Remove your own tracking data (useful if you only want to follow someone else) |

Every alert message also comes with a **"How's today?"** button for a one-tap status check.

## Files

- `Worker.js` — the Worker code
- `Wrangler.toml` — Worker configuration (fill in your `database_id`)
- `Schema.sql` — the D1 table schema

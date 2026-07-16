# Period Tracker Telegram Bot

* 🇺🇸 [English](https://github.com/kiaashkan/period-tracker-bot/blob/main/README.md)
* 🇮🇷 [فارسی](https://github.com/kiaashkan/period-tracker-bot/blob/main/README-FA.md)


Cloudflare Worker that predicts the next period date based on a fixed cycle length and sends Telegram alerts as it approaches (7, 3, 2, 1 days before, and the day of).

## Setup

1. Create a D1 database:
   ```
   wrangler d1 create period-db
   ```
   Copy the `database_id` into `wrangler.toml`.

2. Create the table:
   ```
   wrangler d1 execute period-db --file=./schema.sql --remote
   ```

3. Set secrets:
   ```
   wrangler secret put BOT_TOKEN
   wrangler secret put CHAT_ID
   ```

4. Deploy:
   ```
   wrangler deploy
   ```

5. Point your Telegram bot's webhook at the deployed URL:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev
   ```

## Bot commands

- `/setstart YYYY-MM-DD` — record the last period start date (required once, before anything else works)
- `/setcycle N` — set cycle length in days (default 28)
- `/setlength N` — set period length in days (default 5)
- `/next` — show the predicted next start date

Once `/setstart` is set, predictions roll forward automatically based on the cycle length — no need to update it every month unless the actual date drifts.

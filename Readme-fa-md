# ربات تلگرامی پیش‌بینی سیکل قاعدگی

یه Cloudflare Worker که بر اساس طول سیکل، تاریخ شروع پریود بعدی رو پیش‌بینی می‌کنه و قبل از رسیدنش (۷، ۳، ۲، ۱ روز مونده و روز خودش) تو تلگرام یادآوری خودکار می‌فرسته.

## نصب و راه‌اندازی

۱. ساخت دیتابیس D1:
   ```
   wrangler d1 create period-db
   ```
   مقدار `database_id` که برمی‌گرده رو تو فایل `wrangler.toml` جایگزین کن.

۲. ساخت جدول:
   ```
   wrangler d1 execute period-db --file=./schema.sql --remote
   ```

۳. تنظیم Secrets:
   ```
   wrangler secret put BOT_TOKEN
   wrangler secret put CHAT_ID
   ```

۴. دیپلوی:
   ```
   wrangler deploy
   ```

۵. وصل کردن Webhook ربات تلگرام به آدرس دیپلوی‌شده:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev
   ```

## دستورات ربات

- `/setstart YYYY-MM-DD` — ثبت تاریخ آخرین شروع پریود (اول کار لازمه، بعدش خودکار جلو می‌ره)
- `/setcycle N` — تنظیم طول سیکل به روز (پیش‌فرض ۲۸)
- `/setlength N` — تنظیم طول پریود به روز (پیش‌فرض ۵)
- `/next` — نمایش تاریخ پیش‌بینی‌شده‌ی شروع پریود بعدی

بعد از یک بار ثبت `/setstart`، پیش‌بینی‌ها خودکار بر اساس طول سیکل جلو می‌رن — نیازی نیست هر ماه دستی آپدیتش کنی، مگر اینکه تاریخ واقعی فرق کنه.

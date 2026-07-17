// Period Tracker Telegram Bot - Cloudflare Worker (D1 version)
// D1 binding required: DB (database: period-db)
// Secrets required: BOT_TOKEN, CHAT_ID

const DAY_MS = 24 * 60 * 60 * 1000;

function todayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

async function getSetting(env, key, fallback) {
  const row = await env.DB.prepare("SELECT value FROM config WHERE key = ?").bind(key).first();
  return row ? row.value : fallback;
}

async function setSetting(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(key, value)
    .run();
}

async function getConfig(env) {
  const lastStart = await getSetting(env, "lastStart", null);
  const cycleLength = parseInt(await getSetting(env, "cycleLength", "28"), 10);
  const periodLength = parseInt(await getSetting(env, "periodLength", "5"), 10);
  return { lastStart: lastStart ? parseDate(lastStart) : null, cycleLength, periodLength };
}

function predictNext(lastStart, cycleLength, today) {
  // Automatically rolls forward using the fixed cycle length, no manual update needed.
  const daysSince = Math.floor((today.getTime() - lastStart.getTime()) / DAY_MS);
  const mod = ((daysSince % cycleLength) + cycleLength) % cycleLength;
  const daysUntilNext = mod === 0 ? 0 : cycleLength - mod;
  return new Date(today.getTime() + daysUntilNext * DAY_MS);
}

function getCycleStatus(lastStart, cycleLength, periodLength, today) {
  const daysSince = Math.floor((today.getTime() - lastStart.getTime()) / DAY_MS);
  const mod = ((daysSince % cycleLength) + cycleLength) % cycleLength;
  if (mod < periodLength) {
    return { inPeriod: true, dayOfPeriod: mod + 1, daysLeft: periodLength - mod - 1 };
  }
  return { inPeriod: false };
}

async function sendMessage(env, text) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.CHAT_ID, text, parse_mode: "HTML" }),
  });
}

async function handleScheduled(env) {
  const { lastStart, cycleLength, periodLength } = await getConfig(env);
  if (!lastStart) return; // not configured yet
  const today = todayUTC();
  const next = predictNext(lastStart, cycleLength, today);
  const daysUntil = Math.round((next.getTime() - today.getTime()) / DAY_MS);

  const messages = {
    7: `📅 یه هفته دیگه (${fmt(next)}) پریودش می‌شه.`,
    3: `⏳ ۳ روز تا پریود احتمالی دوست دخترت مونده (تقریبا ${fmt(next)}).`,
    2: `⏳ ۲ روز تا پریود احتمالی مونده (تقریبا ${fmt(next)}).`,
    1: `⏳ فردا احتمال شروع پریودشه.`,
    0: `🔴 امروز احتمالا روز شروع پریودشه. تقریبا ${periodLength} روز طول می‌کشه .`,
  };

  if (messages[daysUntil]) {
    await sendMessage(env, messages[daysUntil]);
  }
}

function toEnglishDigits(str) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return str.replace(/[۰-۹٠-٩]/g, (ch) => {
    const p = persian.indexOf(ch);
    if (p !== -1) return String(p);
    const a = arabic.indexOf(ch);
    if (a !== -1) return String(a);
    return ch;
  });
}

async function handleCommand(env, text) {
  const [cmd, ...rawArgs] = text.trim().split(/\s+/);
  const args = rawArgs.map(toEnglishDigits);
  const { lastStart, cycleLength, periodLength } = await getConfig(env);
  const today = todayUTC();
  const next = lastStart ? predictNext(lastStart, cycleLength, today) : null;
  const daysUntil = next ? Math.round((next.getTime() - today.getTime()) / DAY_MS) : null;
  const status = lastStart ? getCycleStatus(lastStart, cycleLength, periodLength, today) : null;

  switch (cmd) {
    case "/start":
    case "/help":
      return (
        "دستورات:\n" +
        "/next - تاریخ پیش‌بینی پریود بعدی (یا اگه الان تو پریوده، چند روز مونده تموم بشه)\n" +
        "/setstart YYYY-MM-DD - ثبت تاریخ آخرین شروع پریود (اول کار لازمه، بعدش خودکار جلو می‌ره)\n" +
        "/setcycle N - تنظیم طول سیکل (روز، پیش‌فرض ۲۸)\n" +
        "/setlength N - تنظیم طول پریود (روز، پیش‌فرض ۵)"
      );

    case "/next":
      if (!next) return "هنوز تاریخ شروع ثبت نشده. اول بزن: /setstart YYYY-MM-DD";
      if (status.inPeriod) {
        return status.daysLeft > 0
          ? `الان تو پریوده، روز ${status.dayOfPeriod} از ${periodLength}. حدود ${status.daysLeft} روز دیگه تموم می‌شه.`
          : `الان تو پریوده، روز ${status.dayOfPeriod} از ${periodLength} - احتمالا امروز آخرین روزشه.`;
      }
      return `پیش‌بینی شروع پریود بعدی: ${fmt(next)} (${daysUntil} روز دیگه)`;

    case "/setstart": {
      if (!args[0] || !/^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
        return "فرمت درست: /setstart 2026-08-11";
      }
      await setSetting(env, "lastStart", args[0]);
      return `ثبت شد. تاریخ شروع پریود روی ${args[0]} تنظیم شد.`;
    }

    case "/setcycle": {
      const n = parseInt(args[0], 10);
      if (!n || n < 15 || n > 45) return "یه عدد معقول بین ۱۵ تا ۴۵ بده.";
      await setSetting(env, "cycleLength", String(n));
      return `طول سیکل روی ${n} روز تنظیم شد.`;
    }

    case "/setlength": {
      const n = parseInt(args[0], 10);
      if (!n || n < 2 || n > 10) return "یه عدد معقول بین ۲ تا ۱۰ بده.";
      await setSetting(env, "periodLength", String(n));
      return `طول پریود روی ${n} روز تنظیم شد.`;
    }

    default:
      return "دستور ناشناخته. /help رو بزن.";
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK");
    }
    try {
      const update = await request.json();
      const text = update.message?.text;
      if (text) {
        const reply = await handleCommand(env, text);
        await sendMessage(env, reply);
      }
    } catch (e) {
      // ignore malformed updates
    }
    return new Response("OK");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },
};

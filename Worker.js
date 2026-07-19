// Period Tracker Telegram Bot - Cloudflare Worker (D1 version, bilingual EN/FA)
// D1 binding required: DB (database: period-db)
// Secrets required: BOT_TOKEN, CHAT_ID

const DAY_MS = 24 * 60 * 60 * 1000;

const T = {
  en: {
    pickLang: "Please choose a language:",
    langSet: "Language set to English.",
    help:
      "Commands:\n" +
      "/next - predicted next period start date (or days left if currently in a period)\n" +
      "/setstart YYYY-MM-DD - record the last period start date (required once, then it auto-advances)\n" +
      "/setcycle N - set cycle length in days (default 28)\n" +
      "/setlength N - set period length in days (default 5)\n" +
      "/setlang - change language",
    notConfigured: "Start date not set yet. First send: /setstart YYYY-MM-DD",
    inPeriod: (day, total, left) =>
      left > 0
        ? `Currently in a period, day ${day} of ${total}. About ${left} more day(s) left.`
        : `Currently in a period, day ${day} of ${total} - today is likely the last day.`,
    nextPrediction: (date, days) => `Predicted next period start: ${date} (${days} day(s) away)`,
    setstartFormat: "Correct format: /setstart 2026-08-11",
    setstartDone: (d) => `Saved. Period start date set to ${d}.`,
    setcycleRange: "Please give a reasonable number between 15 and 45.",
    setcycleDone: (n) => `Cycle length set to ${n} days.`,
    setlengthRange: "Please give a reasonable number between 2 and 10.",
    setlengthDone: (n) => `Period length set to ${n} days.`,
    unknown: "Unknown command. Send /help.",
    alert7: (d) => `📅 One week from now (${d}) the next period is likely to start.`,
    alert3: (d) => `⏳ About 3 days until the next period (around ${d}).`,
    alert2: (d) => `⏳ About 2 days until the next period (around ${d}).`,
    alert1: `⏳ The period will likely start tomorrow.`,
    alert0: (n) => `🔴 The period likely starts today. It usually lasts about ${n} days.`,
  },
  fa: {
    pickLang: "لطفا زبان رو انتخاب کن:",
    langSet: "زبان روی فارسی تنظیم شد.",
    help:
      "دستورات:\n" +
      "/next - تاریخ پیش‌بینی شروع دوره بعدی (یا اگه الان تو دوره‌ای، چند روز مونده تموم بشه)\n" +
      "/setstart YYYY-MM-DD - ثبت تاریخ آخرین شروع دوره (اول کار لازمه، بعدش خودکار جلو می‌ره)\n" +
      "/setcycle N - تنظیم طول سیکل (روز، پیش‌فرض ۲۸)\n" +
      "/setlength N - تنظیم طول دوره (روز، پیش‌فرض ۵)\n" +
      "/setlang - تغییر زبان",
    notConfigured: "هنوز تاریخ شروع ثبت نشده. اول بزن: /setstart YYYY-MM-DD",
    inPeriod: (day, total, left) =>
      left > 0
        ? `الان تو دوره‌ای، روز ${day} از ${total}. حدود ${left} روز دیگه تموم می‌شه.`
        : `الان تو دوره‌ای، روز ${day} از ${total} - احتمالا امروز آخرین روزشه.`,
    nextPrediction: (date, days) => `پیش‌بینی شروع دوره بعدی: ${date} (${days} روز دیگه)`,
    setstartFormat: "فرمت درست: /setstart 2026-08-11",
    setstartDone: (d) => `ثبت شد. تاریخ شروع دوره روی ${d} تنظیم شد.`,
    setcycleRange: "یه عدد معقول بین ۱۵ تا ۴۵ بده.",
    setcycleDone: (n) => `طول سیکل روی ${n} روز تنظیم شد.`,
    setlengthRange: "یه عدد معقول بین ۲ تا ۱۰ بده.",
    setlengthDone: (n) => `طول دوره روی ${n} روز تنظیم شد.`,
    unknown: "دستور ناشناخته. /help رو بزن.",
    alert7: (d) => `📅 یه هفته دیگه (${d}) دوره‌ی بعدی شروع می‌شه.`,
    alert3: (d) => `⏳ حدود ۳ روز تا شروع دوره‌ی بعدی مونده (تقریبا ${d}).`,
    alert2: (d) => `⏳ حدود ۲ روز تا شروع دوره‌ی بعدی مونده (تقریبا ${d}).`,
    alert1: `⏳ احتمالا فردا دوره شروع می‌شه.`,
    alert0: (n) => `🔴 احتمالا امروز دوره شروع می‌شه. معمولا حدود ${n} روز طول می‌کشه.`,
  },
};

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
  const lang = await getSetting(env, "lang", null);
  return { lastStart: lastStart ? parseDate(lastStart) : null, cycleLength, periodLength, lang };
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

async function sendMessage(env, text, replyMarkup) {
  const body = { chat_id: env.CHAT_ID, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function answerCallbackQuery(env, id) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id }),
  });
}

async function sendLangPicker(env) {
  await sendMessage(env, "Please choose a language / لطفا زبان رو انتخاب کن:", {
    inline_keyboard: [
      [
        { text: "English", callback_data: "lang_en" },
        { text: "فارسی", callback_data: "lang_fa" },
      ],
    ],
  });
}

async function handleScheduled(env) {
  const { lastStart, cycleLength, periodLength, lang } = await getConfig(env);
  if (!lastStart || !lang) return; // not fully configured yet
  const t = T[lang];
  const today = todayUTC();
  const next = predictNext(lastStart, cycleLength, today);
  const daysUntil = Math.round((next.getTime() - today.getTime()) / DAY_MS);
  const nextStr = fmt(next);

  const messages = {
    7: t.alert7(nextStr),
    3: t.alert3(nextStr),
    2: t.alert2(nextStr),
    1: t.alert1,
    0: t.alert0(periodLength),
  };

  if (messages[daysUntil]) {
    await sendMessage(env, messages[daysUntil]);
  }
}

async function handleCommand(env, text) {
  const [cmd, ...rawArgs] = text.trim().split(/\s+/);
  const args = rawArgs.map(toEnglishDigits);
  const { lastStart, cycleLength, periodLength, lang } = await getConfig(env);

  if (!lang && cmd !== "/start" && cmd !== "/setlang") {
    await sendLangPicker(env);
    return null;
  }

  const t = lang ? T[lang] : null;
  const today = todayUTC();
  const next = lastStart ? predictNext(lastStart, cycleLength, today) : null;
  const daysUntil = next ? Math.round((next.getTime() - today.getTime()) / DAY_MS) : null;
  const status = lastStart ? getCycleStatus(lastStart, cycleLength, periodLength, today) : null;

  switch (cmd) {
    case "/start":
    case "/setlang":
      await sendLangPicker(env);
      return null;

    case "/help":
      return t.help;

    case "/next":
      if (!next) return t.notConfigured;
      if (status.inPeriod) return t.inPeriod(status.dayOfPeriod, periodLength, status.daysLeft);
      return t.nextPrediction(fmt(next), daysUntil);

    case "/setstart": {
      if (!args[0] || !/^\d{4}-\d{2}-\d{2}$/.test(args[0])) return t.setstartFormat;
      await setSetting(env, "lastStart", args[0]);
      return t.setstartDone(args[0]);
    }

    case "/setcycle": {
      const n = parseInt(args[0], 10);
      if (!n || n < 15 || n > 45) return t.setcycleRange;
      await setSetting(env, "cycleLength", String(n));
      return t.setcycleDone(n);
    }

    case "/setlength": {
      const n = parseInt(args[0], 10);
      if (!n || n < 2 || n > 10) return t.setlengthRange;
      await setSetting(env, "periodLength", String(n));
      return t.setlengthDone(n);
    }

    default:
      return t.unknown;
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK");
    }
    try {
      const update = await request.json();

      if (update.callback_query) {
        const data = update.callback_query.data;
        const lang = data === "lang_fa" ? "fa" : "en";
        await setSetting(env, "lang", lang);
        await answerCallbackQuery(env, update.callback_query.id);
        await sendMessage(env, `${T[lang].langSet}\n\n${T[lang].help}`);
        return new Response("OK");
      }

      const text = update.message?.text;
      if (text) {
        const reply = await handleCommand(env, text);
        if (reply) await sendMessage(env, reply);
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

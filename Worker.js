// Period Tracker Telegram Bot - Cloudflare Worker (D1, English only, multi-user)
// D1 binding required: DB (database: period-db)
// Secrets required: BOT_TOKEN, CHAT_ID (CHAT_ID is only used once, to migrate old single-user data)
// Optional variable: BOT_USERNAME (your bot's @username, without the @ — used to build invite links)

const DAY_MS = 24 * 60 * 60 * 1000;
const IRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000; // Iran Standard Time, UTC+3:30 (no DST)

const M = {
  mainMenuPrompt: "How would you like to use this bot?",
  btnOwn: "Track for myself",
  btnInvite: "I have an invite code",
  ownModeInfo:
    "Great! Send /setstart YYYY-MM-DD to record your last period start date. " +
    "After that, /invite gives you a code (and a link) to share with your partner.",
  inviteModeInfo: "Ask your partner for their invite code (they get it with /invite), then send: /link CODE",
  help:
    "Tip: send /start anytime to see the menu again, or /help to see this list again.\n\n" +
    "Commands:\n" +
    "/help - show this list again\n" +
    "/next - predicted next period start date (or days left if currently in a period)\n" +
    "/today - mark today as the period start date (shortcut for /setstart with today's date)\n" +
    "/setstart YYYY-MM-DD - record your last period start date (required once, then it auto-advances)\n" +
    "/setcycle N - set cycle length in days (default 28)\n" +
    "/setlength N - set period length in days (default 5)\n" +
    "/history - show recent cycles and their actual length\n" +
    "/invite - get a code and link to share with your partner\n" +
    "/link CODE - follow someone else's cycle using their invite code\n" +
    "/unlink - stop following someone else's cycle\n" +
    "/removeprofile - remove your own tracking data (useful if you only want to follow someone else)",
  notConfigured: "No start date set yet. Send /setstart YYYY-MM-DD, or /link CODE if someone shared an invite code with you.",
  inPeriod: (day, total, left) =>
    left > 0
      ? `Currently in a period, day ${day} of ${total}. About ${left} more day(s) left.`
      : `Currently in a period, day ${day} of ${total} - today is likely the last day.`,
  nextPrediction: (date, days) => `Predicted next period start: ${date} (${days} day(s) away)`,
  todayDone: (d) => `Got it, marked today (${d}) as the start.`,
  historyNone: "No history yet. Set a start date first with /setstart or /today.",
  historyNotEnough: "Only one start date recorded so far, not enough to show cycle lengths yet.",
  historyHeader: "Recent cycles:",
  historyLine: (from, to, days) => `${from} → ${to} (${days} days)`,
  historyAverage: (avg) => `Average cycle length: ${avg} days`,
  btnStatus: "How's today?",
  setstartFormat: "Correct format: /setstart 2026-01-01",
  setstartDone: (d) => `Saved. Period start date set to ${d}.`,
  setcycleRange: "Please give a reasonable number between 15 and 45.",
  setcycleDone: (n) => `Cycle length set to ${n} days.`,
  setlengthRange: "Please give a reasonable number between 2 and 10.",
  setlengthDone: (n) => `Period length set to ${n} days.`,
  unknown: "Unknown command. Send /help.",
  inviteNeedProfile: "Set your own start date first with /setstart YYYY-MM-DD, then /invite will work.",
  inviteCode: (code, link) =>
    `Your invite code: ${code}\n` +
    (link
      ? `Or just send them this link — tapping it opens the bot and links them automatically:\n${link}`
      : `Share it with your partner. They can send /link ${code} to follow your cycle and get the same reminders.`),
  linkFormat: "Correct format: /link ABC123",
  linkInvalid: "That code doesn't look valid. Double check it with your partner.",
  linkSelf: "You can't link to your own invite code.",
  linkDone: (name) => `Linked${name ? ` to ${name}'s cycle` : ""}! You'll now get the same predictions and reminders.`,
  unlinkDone: "Unlinked. You won't follow anyone else's cycle anymore.",
  unlinkNone: "You're not linked to anyone right now.",
  removeProfileDone: "Your own tracking data was removed. If you're linked to someone else, /next will now show their data.",
  removeProfileNone: "You don't have your own tracking data set up.",
  alert7: (d) => `📅 One week from now (${d}) the next period is likely to start.`,
  alert3: (d) => `⏳ About 3 days until the next period (around ${d}).`,
  alert2: (d) => `⏳ About 2 days until the next period (around ${d}).`,
  alert1: `⏳ The period will likely start tomorrow.`,
  alert0: (n) => `🔴 The period likely starts today. It usually lasts about ${n} days.`,
};

function todayLocal() {
  const d = new Date(Date.now() + IRAN_OFFSET_MS);
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

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function predictNext(lastStart, cycleLength, today) {
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

// ---------- D1 helpers ----------

async function getOwnProfile(env, chatId) {
  const row = await env.DB.prepare(
    "SELECT chat_id, last_start, cycle_length, period_length, invite_code, owner_name FROM profiles WHERE chat_id = ?"
  )
    .bind(chatId)
    .first();
  if (!row) return null;
  return {
    chatId: row.chat_id,
    lastStart: row.last_start ? parseDate(row.last_start) : null,
    cycleLength: row.cycle_length,
    periodLength: row.period_length,
    inviteCode: row.invite_code,
    ownerName: row.owner_name,
  };
}

async function upsertProfileField(env, chatId, field, value, ownerName) {
  const columnMap = { lastStart: "last_start", cycleLength: "cycle_length", periodLength: "period_length" };
  const col = columnMap[field];
  await env.DB.prepare(
    `INSERT INTO profiles (chat_id, ${col}, owner_name) VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET ${col} = excluded.${col}, owner_name = COALESCE(excluded.owner_name, profiles.owner_name)`
  )
    .bind(chatId, value, ownerName || null)
    .run();
}

async function addHistoryEntry(env, chatId, dateStr) {
  await env.DB.prepare("INSERT OR IGNORE INTO cycle_history (chat_id, start_date) VALUES (?, ?)")
    .bind(chatId, dateStr)
    .run();
}

async function getHistory(env, chatId, limit) {
  const rows = await env.DB.prepare(
    "SELECT start_date FROM cycle_history WHERE chat_id = ? ORDER BY start_date DESC LIMIT ?"
  )
    .bind(chatId, limit)
    .all();
  return (rows.results || []).map((r) => r.start_date).reverse(); // ascending order
}

async function deleteProfile(env, chatId) {
  const result = await env.DB.prepare("DELETE FROM profiles WHERE chat_id = ?").bind(chatId).run();
  return result.meta && result.meta.changes > 0;
}

async function migrateLegacyIfNeeded(env, chatId) {
  // One-time migration: if this chat is the original single-user owner (env.CHAT_ID)
  // and the old "config" table still has data, copy it into a profile (if one doesn't
  // already exist), then clear the old table so this can never run again — otherwise
  // removing your own profile to become viewer-only would keep resurrecting old data.
  if (String(chatId) !== String(env.CHAT_ID)) return;
  try {
    const rows = await env.DB.prepare("SELECT key, value FROM config").all();
    if (!rows.results || rows.results.length === 0) return;
    const existing = await getOwnProfile(env, chatId);
    if (!existing) {
      const map = {};
      for (const r of rows.results) map[r.key] = r.value;
      if (map.lastStart) {
        await env.DB.prepare(
          "INSERT INTO profiles (chat_id, last_start, cycle_length, period_length) VALUES (?, ?, ?, ?) ON CONFLICT(chat_id) DO NOTHING"
        )
          .bind(chatId, map.lastStart, parseInt(map.cycleLength || "28", 10), parseInt(map.periodLength || "5", 10))
          .run();
      }
    }
    await env.DB.prepare("DELETE FROM config").run();
  } catch (e) {
    // legacy "config" table may not exist on fresh installs - ignore
  }
}

async function getOrCreateInviteCode(env, chatId) {
  const profile = await getOwnProfile(env, chatId);
  if (!profile) return null;
  if (profile.inviteCode) return profile.inviteCode;
  const code = generateInviteCode();
  await env.DB.prepare("UPDATE profiles SET invite_code = ? WHERE chat_id = ?").bind(code, chatId).run();
  return code;
}

async function findOwnerByInviteCode(env, code) {
  const row = await env.DB.prepare("SELECT chat_id, owner_name FROM profiles WHERE invite_code = ?").bind(code).first();
  return row ? { chatId: row.chat_id, ownerName: row.owner_name } : null;
}

async function linkViewer(env, viewerChatId, ownerChatId) {
  await env.DB.prepare(
    "INSERT INTO links (viewer_chat_id, owner_chat_id) VALUES (?, ?) ON CONFLICT(viewer_chat_id) DO UPDATE SET owner_chat_id = excluded.owner_chat_id"
  )
    .bind(viewerChatId, ownerChatId)
    .run();
}

async function unlinkViewer(env, viewerChatId) {
  const result = await env.DB.prepare("DELETE FROM links WHERE viewer_chat_id = ?").bind(viewerChatId).run();
  return result.meta && result.meta.changes > 0;
}

async function getLinkedOwner(env, viewerChatId) {
  const row = await env.DB.prepare("SELECT owner_chat_id FROM links WHERE viewer_chat_id = ?").bind(viewerChatId).first();
  return row ? row.owner_chat_id : null;
}

async function getViewersOf(env, ownerChatId) {
  const rows = await env.DB.prepare("SELECT viewer_chat_id FROM links WHERE owner_chat_id = ?").bind(ownerChatId).all();
  return (rows.results || []).map((r) => r.viewer_chat_id);
}

// Resolve which profile's data applies to this chat: their own if set, otherwise the person they're linked to.
async function getEffectiveProfile(env, chatId) {
  const own = await getOwnProfile(env, chatId);
  if (own && own.lastStart) return own;
  const ownerChatId = await getLinkedOwner(env, chatId);
  if (ownerChatId) {
    const ownerProfile = await getOwnProfile(env, ownerChatId);
    if (ownerProfile && ownerProfile.lastStart) return ownerProfile;
  }
  return null;
}

async function buildStatusReply(env, chatId) {
  const profile = await getEffectiveProfile(env, chatId);
  if (!profile) return M.notConfigured;
  const today = todayLocal();
  const status = getCycleStatus(profile.lastStart, profile.cycleLength, profile.periodLength, today);
  if (status.inPeriod) return M.inPeriod(status.dayOfPeriod, profile.periodLength, status.daysLeft);
  const next = predictNext(profile.lastStart, profile.cycleLength, today);
  const daysUntil = Math.round((next.getTime() - today.getTime()) / DAY_MS);
  return M.nextPrediction(fmt(next), daysUntil);
}

// ---------- Telegram helpers ----------

async function sendMessage(env, chatId, text, replyMarkup) {
  const body = { chat_id: chatId, text, parse_mode: "HTML" };
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

async function getBotUsername(env) {
  if (env.BOT_USERNAME) return env.BOT_USERNAME;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getMe`);
    const data = await res.json();
    return data.ok ? data.result.username : null;
  } catch (e) {
    return null;
  }
}

async function sendMainMenu(env, chatId) {
  await sendMessage(env, chatId, M.mainMenuPrompt, {
    inline_keyboard: [[{ text: M.btnOwn, callback_data: "mode_own" }, { text: M.btnInvite, callback_data: "mode_invite" }]],
  });
}

// ---------- Scheduled alerts ----------

async function handleScheduled(env) {
  const today = todayLocal();
  const rows = await env.DB.prepare(
    "SELECT chat_id, last_start, cycle_length, period_length FROM profiles WHERE last_start IS NOT NULL"
  ).all();

  for (const row of rows.results || []) {
    const lastStart = parseDate(row.last_start);
    const cycleLength = row.cycle_length;
    const periodLength = row.period_length;
    const next = predictNext(lastStart, cycleLength, today);
    const daysUntil = Math.round((next.getTime() - today.getTime()) / DAY_MS);
    const nextStr = fmt(next);

    const key = { 7: "alert7", 3: "alert3", 2: "alert2", 1: "alert1", 0: "alert0" }[daysUntil];
    if (!key) continue;

    const text = typeof M[key] === "function" ? M[key](key === "alert0" ? periodLength : nextStr) : M[key];
    const statusButton = { inline_keyboard: [[{ text: M.btnStatus, callback_data: "status" }]] };
    const recipients = [row.chat_id, ...(await getViewersOf(env, row.chat_id))];
    for (const chatId of recipients) {
      await sendMessage(env, chatId, text, statusButton);
    }
  }
}

// ---------- Command handling ----------

async function handleCommand(env, chatId, text, fromName) {
  const [cmd, ...rawArgs] = text.trim().split(/\s+/);
  const args = rawArgs.map(toEnglishDigits);

  await migrateLegacyIfNeeded(env, chatId);

  if (cmd === "/start") {
    const inviteCode = args[0] ? args[0].toUpperCase() : null;
    if (inviteCode) {
      const owner = await findOwnerByInviteCode(env, inviteCode);
      if (!owner) {
        await sendMessage(env, chatId, M.linkInvalid);
        await sendMainMenu(env, chatId);
      } else if (String(owner.chatId) === String(chatId)) {
        await sendMessage(env, chatId, M.linkSelf);
        await sendMainMenu(env, chatId);
      } else {
        await linkViewer(env, chatId, owner.chatId);
        await sendMessage(env, chatId, M.linkDone(owner.ownerName));
        await sendMessage(env, chatId, M.help);
      }
    } else {
      await sendMainMenu(env, chatId);
    }
    return;
  }

  const profile = await getEffectiveProfile(env, chatId);

  switch (cmd) {
    case "/help":
      await sendMessage(env, chatId, M.help);
      return;

    case "/next":
      await sendMessage(env, chatId, await buildStatusReply(env, chatId));
      return;

    case "/setstart": {
      if (!args[0] || !/^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
        await sendMessage(env, chatId, M.setstartFormat);
        return;
      }
      await upsertProfileField(env, chatId, "lastStart", args[0], fromName);
      await addHistoryEntry(env, chatId, args[0]);
      await sendMessage(env, chatId, M.setstartDone(args[0]));
      return;
    }

    case "/today": {
      const todayStr = fmt(todayLocal());
      await upsertProfileField(env, chatId, "lastStart", todayStr, fromName);
      await addHistoryEntry(env, chatId, todayStr);
      await sendMessage(env, chatId, M.todayDone(todayStr));
      return;
    }

    case "/history": {
      // History belongs to the owner profile (the actual person tracking), not a viewer.
      const ownerChatId = profile ? (profile.chatId || chatId) : null;
      if (!ownerChatId) {
        await sendMessage(env, chatId, M.historyNone);
        return;
      }
      const dates = await getHistory(env, ownerChatId, 8);
      if (dates.length === 0) {
        await sendMessage(env, chatId, M.historyNone);
        return;
      }
      if (dates.length === 1) {
        await sendMessage(env, chatId, M.historyNotEnough);
        return;
      }
      const lines = [M.historyHeader];
      const lengths = [];
      for (let i = 1; i < dates.length; i++) {
        const days = Math.round((parseDate(dates[i]).getTime() - parseDate(dates[i - 1]).getTime()) / DAY_MS);
        lengths.push(days);
        lines.push(M.historyLine(dates[i - 1], dates[i], days));
      }
      const avg = Math.round((lengths.reduce((a, b) => a + b, 0) / lengths.length) * 10) / 10;
      lines.push("");
      lines.push(M.historyAverage(avg));
      await sendMessage(env, chatId, lines.join("\n"));
      return;
    }

    case "/setcycle": {
      const n = parseInt(args[0], 10);
      if (!n || n < 15 || n > 45) {
        await sendMessage(env, chatId, M.setcycleRange);
        return;
      }
      await upsertProfileField(env, chatId, "cycleLength", n, fromName);
      await sendMessage(env, chatId, M.setcycleDone(n));
      return;
    }

    case "/setlength": {
      const n = parseInt(args[0], 10);
      if (!n || n < 2 || n > 10) {
        await sendMessage(env, chatId, M.setlengthRange);
        return;
      }
      await upsertProfileField(env, chatId, "periodLength", n, fromName);
      await sendMessage(env, chatId, M.setlengthDone(n));
      return;
    }

    case "/invite": {
      const code = await getOrCreateInviteCode(env, chatId);
      if (!code) {
        await sendMessage(env, chatId, M.inviteNeedProfile);
        return;
      }
      const username = await getBotUsername(env);
      const link = username ? `https://t.me/${username}?start=${code}` : null;
      await sendMessage(env, chatId, M.inviteCode(code, link));
      return;
    }

    case "/link": {
      const code = (args[0] || "").toUpperCase();
      if (!code) {
        await sendMessage(env, chatId, M.linkFormat);
        return;
      }
      const owner = await findOwnerByInviteCode(env, code);
      if (!owner) {
        await sendMessage(env, chatId, M.linkInvalid);
        return;
      }
      if (String(owner.chatId) === String(chatId)) {
        await sendMessage(env, chatId, M.linkSelf);
        return;
      }
      await linkViewer(env, chatId, owner.chatId);
      await sendMessage(env, chatId, M.linkDone(owner.ownerName));
      return;
    }

    case "/unlink": {
      const removed = await unlinkViewer(env, chatId);
      await sendMessage(env, chatId, removed ? M.unlinkDone : M.unlinkNone);
      return;
    }

    case "/removeprofile": {
      const removed = await deleteProfile(env, chatId);
      await sendMessage(env, chatId, removed ? M.removeProfileDone : M.removeProfileNone);
      return;
    }

    default:
      await sendMessage(env, chatId, M.unknown);
      return;
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
        const chatId = update.callback_query.message.chat.id;
        const data = update.callback_query.data;
        await answerCallbackQuery(env, update.callback_query.id);

        if (data === "mode_own" || data === "mode_invite") {
          await sendMessage(env, chatId, data === "mode_own" ? M.ownModeInfo : M.inviteModeInfo);
          await sendMessage(env, chatId, M.help);
        }

        if (data === "status") {
          await sendMessage(env, chatId, await buildStatusReply(env, chatId));
        }
        return new Response("OK");
      }

      const text = update.message?.text;
      const chatId = update.message?.chat?.id;
      const fromName = update.message?.from?.first_name;
      if (text && chatId) {
        await handleCommand(env, chatId, text, fromName);
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

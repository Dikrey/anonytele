/**
 * =============================================
 * 🤖 ANONYMOUS CHAT BOT
 * 
 * Dibuat oleh: @raihan_official0307
 * 
 * 🔔 JANGAN HAPUS NAMA PEMBUAT ASLI!
 * 
 * 
 * 
 * Jika kamu re-upload, re-post, atau re-host:
 * - Tetap cantumkan kredit
 * - Jangan mengaku-ngaku
 * - Hargai sesama developer
 * 
 * 💙 Terima kasih sudah menghargai.
 * 
 * Join: https://t.me/raihan_official0307
 * =============================================
 */
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// =============== CONFIG ===============
const TOKEN = process.env.TOKEN || 'YOUR_BOT_TOKEN';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'raihan_official0307';
const PREMIUM_IDS = new Set((process.env.PREMIUM_IDS || '').split(',').map(id => id.trim()).filter(Boolean));

// =============== Konstanta ===============
const IDLE_TIMEOUT = 120_000; // 2 menit
const MAX_QUEUE = 15;
const REPORT_THRESHOLD = 3;
const REPORT_WINDOW = 60 * 60 * 1000; // 1 jam
const MESSAGE_TIMEOUT = 3000; // Anti-spam
const MAX_MESSAGE_LENGTH = 4000;

// =============== File Path ===============
const DATA_DIR = path.join(__dirname, 'data');
const BLOCKED_FILE = path.join(DATA_DIR, 'blocked.json');
const MUTED_FILE = path.join(DATA_DIR, 'muted.json');
const PREMIUM_FILE = path.join(DATA_DIR, 'premium.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// =============== Inisialisasi Bot ===============
const bot = new TelegramBot(TOKEN, { polling: true });

// =============== State & Data ===============
const waitingQueue = [];
const partners = new Map();
const userGender = new Map();
const userInterest = new Map();
const userState = new Map(); // awaiting_gender, awaiting_broadcast, dll
const userTimers = new Map();
const reportedUsers = []; // { reporterId, reportedId, timestamp }
const sessionHistory = [];
const userMessageLog = new Map();
const mutedUsers = new Set();
const blockedUsers = new Set();
const userProfiles = new Map(); // { name, age, bio }
const userRatings = new Map(); // { userId: [ratings] }
const userActivity = new Map(); // { userId: jumlah sesi }

// =============== Load Data ===============
function loadFile(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : defaultVal;
    }
  } catch (err) {
    console.error(`Gagal load ${filePath}:`, err);
  }
  return defaultVal;
}

function saveFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Gagal simpan ${filePath}:`, err);
  }
}

function loadAllData() {
  loadFile(BLOCKED_FILE).forEach(id => blockedUsers.add(String(id)));
  loadFile(MUTED_FILE).forEach(id => mutedUsers.add(String(id)));
  loadFile(PREMIUM_FILE).forEach(id => PREMIUM_IDS.add(String(id)));
}

function saveAllData() {
  saveFile(BLOCKED_FILE, Array.from(blockedUsers).map(id => parseInt(id)));
  saveFile(MUTED_FILE, Array.from(mutedUsers).map(id => parseInt(id)));
  saveFile(PREMIUM_FILE, Array.from(PREMIUM_IDS));
}

function isAdmin(chatId) {
  return ADMIN_IDS.includes(String(chatId));
}

function isPremium(chatId) {
  return PREMIUM_IDS.has(String(chatId));
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

function getUserStatusCount() {
  const chatting = Array.from(partners.keys()).length / 2;
  const inQueue = waitingQueue.length;
  return { chatting, inQueue, totalActive: chatting * 2 + inQueue };
}

function isUserBlocked(chatId) {
  return blockedUsers.has(String(chatId));
}

function isUserMuted(chatId) {
  return mutedUsers.has(String(chatId));
}

function clearIdleTimer(chatId) {
  if (userTimers.has(chatId)) clearTimeout(userTimers.get(chatId));
  userTimers.delete(chatId);
}

function resetIdleTimer(chatId) {
  clearIdleTimer(chatId);
  const timerId = setTimeout(() => {
    if (partners.has(chatId)) {
      bot.sendMessage(chatId, "💤 Kamu tidak aktif. Sesi dihentikan.", mainButtons);
      stopChat(chatId);
    }
  }, IDLE_TIMEOUT);
  userTimers.set(chatId, timerId);
}

function banUser(userId) {
  userId = String(userId);
  if (!blockedUsers.has(userId)) {
    blockedUsers.add(userId);
    saveAllData();
    if (partners.has(userId)) stopChat(userId);
    const idx = waitingQueue.findIndex(u => u.chatId == userId);
    if (idx > -1) waitingQueue.splice(idx, 1);
    try {
      bot.sendMessage(userId, `❌ Kamu diblokir oleh admin.`);
    } catch (e) {}
    console.log(`[BAN] User ${userId} diblokir.`);
    notifyAdmins(`🚨 *Auto-Ban*: \`${userId}\` diblokir.`);
  }
}

function unbanUser(userId) {
  userId = String(userId);
  if (blockedUsers.has(userId)) {
    blockedUsers.delete(userId);
    saveAllData();
    try {
      bot.sendMessage(userId, `✅ Kamu di-unblock.`);
    } catch (e) {}
    console.log(`[UNBAN] User ${userId} di-unblock.`);
    return true;
  }
  return false;
}

function muteUser(userId) {
  userId = String(userId);
  if (!mutedUsers.has(userId)) {
    mutedUsers.add(userId);
    saveAllData();
    try {
      bot.sendMessage(userId, "🔇 Dimute sementara.");
    } catch (e) {}
    console.log(`[MUTE] User ${userId} dimute.`);
  }
}

function unmuteUser(userId) {
  userId = String(userId);
  if (mutedUsers.has(userId)) {
    mutedUsers.delete(userId);
    saveAllData();
    try {
      bot.sendMessage(userId, "🔊 Mute dihapus.");
    } catch (e) {}
    console.log(`[UNMUTE] User ${userId} di-unmute.`);
    return true;
  }
  return false;
}

function isSpam(chatId) {
  const logs = userMessageLog.get(chatId) || [];
  const now = Date.now();
  const recent = logs.filter(t => t > now - MESSAGE_TIMEOUT);
  if (recent.length >= 5) return true;
  recent.push(now);
  userMessageLog.set(chatId, recent.slice(-5));
  return false;
}

function containsBadWord(text) {
  const badWords = ['anjing', 'babi', 'kontol', 'memek', 'fuck', 'shit', 'dick'];
  return badWords.some(word => text.toLowerCase().includes(word));
}

function checkAutoBan(userId) {
  const recent = reportedUsers.filter(rep =>
    rep.reportedId == userId && Date.now() - rep.timestamp < REPORT_WINDOW
  );
  if (recent.length >= REPORT_THRESHOLD) {
    banUser(userId);
    notifyAdmins(`🚨 *Auto-Ban*: User \`${userId}\` diblokir otomatis karena dilaporkan ${REPORT_THRESHOLD}x.`);
  }
}

function notifyAdmins(msg) {
  ADMIN_IDS.forEach(id => {
    bot.sendMessage(id, msg, { parse_mode: 'HTML' }).catch(() => {});
  });
}

// =============== Fitur: Cari Partner (dengan minat) ===============
function findPartner(chatId, matchGender = null, interest = null) {
  if (isUserBlocked(chatId)) {
    bot.sendMessage(chatId, `❌ Kamu diblokir.`);
    return;
  }

  if (waitingQueue.length >= MAX_QUEUE) {
    bot.sendMessage(chatId, "👥 Antrian penuh! Tunggu sebentar...");
    return;
  }

  const userGenderValue = userGender.get(chatId);
  const userInterestValue = userInterest.get(chatId);
  let candidates = waitingQueue.filter(u => u.chatId !== chatId);

  if (matchGender === 'lawan' && userGenderValue) {
    const target = userGenderValue === 'laki-laki' ? 'perempuan' : 'laki-laki';
    candidates = candidates.filter(u => userGender.get(u.chatId) === target);
  }

  if (interest && userInterestValue) {
    candidates = candidates.filter(u => userInterest.get(u.chatId) === userInterestValue);
  }

  // Acak
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const partner = candidates[0];

  if (partner) {
    const partnerId = partner.chatId;
    const idx = waitingQueue.findIndex(u => u.chatId === partnerId);
    if (idx > -1) waitingQueue.splice(idx, 1);

    partners.set(chatId, { partnerId, connectedAt: Date.now() });
    partners.set(partnerId, { partnerId: chatId, connectedAt: Date.now() });

    const genderText = userGender.get(partnerId) === 'laki-laki' ? '👦 Laki-laki' : '👧 Perempuan';
    const matchNote = interest ? '✨ (Minat Sama!)' : '';

    bot.sendMessage(chatId, `✅ Terhubung dengan (${genderText}) ${matchNote}`, chatButtons);
    bot.sendMessage(partnerId, `✅ Terhubung! ${matchNote}`, chatButtons);

    userState.set(chatId, 'chatting');
    userState.set(partnerId, 'chatting');
    resetIdleTimer(chatId);
    resetIdleTimer(partnerId);
  } else {
    waitingQueue.push({ chatId, gender: userGender.get(chatId), interest: userInterest.get(chatId) });
    bot.sendMessage(chatId, "⏳ Menunggu partner...", chatButtons);
    userState.set(chatId, 'in_queue');
    resetIdleTimer(chatId);

    // Auto-response saat menunggu
    setTimeout(() => {
      if (userState.get(chatId) === 'in_queue') {
        const replies = [
          "🔍 Sedang mencari teman ngobrol yang cocok...",
          "💬 Jangan khawatir, partnermu akan segera datang!",
          "✨ Anonymous Chat: Bertemu orang baru secara rahasia!",
          "⏳ Masih antri? Bagikan bot ini ke temanmu!"
        ];
        bot.sendMessage(chatId, replies[Math.floor(Math.random() * replies.length)]);
      }
    }, 10000);
  }
}

// =============== Stop Chat ===============
function stopChat(chatId) {
  clearIdleTimer(chatId);
  const data = partners.get(chatId);
  if (data) {
    const { partnerId, connectedAt } = data;
    const duration = Math.floor((Date.now() - connectedAt) / 1000);
    const sessions = (userActivity.get(chatId) || 0) + 1;
    userActivity.set(chatId, sessions);

    sessionHistory.push({ userId: chatId, durationSec: duration, timestamp: Date.now() });
    if (sessionHistory.length > 100) sessionHistory.shift();

    partners.delete(chatId);
    partners.delete(partnerId);

    bot.sendMessage(chatId, `🛑 Berhenti setelah ${formatTime(duration)}`, mainButtons);
    bot.sendMessage(partnerId, `💬 Partner keluar setelah ${formatTime(duration)}`, mainButtons);

    userState.set(chatId, null);
    userState.set(partnerId, null);

    // Rating
    bot.sendMessage(chatId, "⭐ Beri rating partnermu (1-5):", {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⭐', callback_data: `rate_1_${partnerId}` }],
          [{ text: '⭐⭐', callback_data: `rate_2_${partnerId}` }],
          [{ text: '⭐⭐⭐', callback_data: `rate_3_${partnerId}` }],
          [{ text: '⭐⭐⭐⭐', callback_data: `rate_4_${partnerId}` }],
          [{ text: '⭐⭐⭐⭐⭐', callback_data: `rate_5_${partnerId}` }]
        ]
      }
    });

    [chatId, partnerId].forEach(id => {
      const idx = waitingQueue.findIndex(u => u.chatId === id);
      if (idx > -1) waitingQueue.splice(idx, 1);
    });
  } else if (userState.get(chatId) === 'in_queue') {
    const idx = waitingQueue.findIndex(u => u.chatId === chatId);
    if (idx > -1) waitingQueue.splice(idx, 1);
    bot.sendMessage(chatId, "🛑 Pencarian dibatalkan.", mainButtons);
    userState.set(chatId, null);
  } else {
    bot.sendMessage(chatId, "🛑 Tidak ada aktivitas.", mainButtons);
  }
}

// =============== Tombol ===============
const genderButtons = {
  reply_markup: {
    keyboard: [
      [{ text: '👦 Laki-laki' }, { text: '👧 Perempuan' }],
      [{ text: '🎭 Tanpa Gender (Stealth Mode)' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const interestButtons = {
  reply_markup: {
    keyboard: [
      [{ text: '🎮 Game' }, { text: '🎵 Musik' }],
      [{ text: '📚 Belajar' }, { text: '❤️ Cinta' }],
      [{ text: '🌍 Travel' }, { text: '🍳 Masak' }],
      [{ text: '🚫 Tidak Ada Minat' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const mainButtons = {
  reply_markup: {
    keyboard: [
      [{ text: '🔍 Cari Partner' }, { text: '🎯 Cari Lawan Jenis' }],
      [{ text: '❤️ Cari Minat Sama' }, { text: '🎲 Tukar Acak' }],
      [{ text: '📝 Tentang' }, { text: '📊 Statistik' }],
      [{ text: '👤 Profil' }, { text: '🏆 Leaderboard' }],
      [{ text: '🔐 Admin Mode' }]
    ],
    resize_keyboard: true,
  },
};

const chatButtons = {
  reply_markup: {
    keyboard: [
      [{ text: '⏭️ Skip' }, { text: '🛑 Berhenti' }],
      [{ text: '🚨 Laporkan Partner' }, { text: '⭐ Beri Rating' }]
    ],
    resize_keyboard: true,
  },
};

const adminButtons = {
  reply_markup: {
    keyboard: [
      [{ text: '👥 Lihat Online' }, { text: '📋 Laporan' }],
      [{ text: '🕵️ Cek User' }, { text: '📢 Broadcast' }],
      [{ text: '🚫 Blokir List' }, { text: '🔇 Mute List' }],
      [{ text: '🎁 Jadikan VIP' }, { text: '📤 Simpan Data' }],
      [{ text: '🔙 Kembali ke Chat' }]
    ],
    resize_keyboard: true,
  },
};

// =============== /start ===============
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.chat.first_name || "User";

  if (isUserBlocked(chatId)) {
    bot.sendMessage(chatId, `❌ Kamu diblokir.\nHubungi: @${ADMIN_USERNAME}`, mainButtons);
    return;
  }

  partners.delete(chatId);
  userGender.delete(chatId);
  userInterest.delete(chatId);
  userState.set(chatId, 'awaiting_gender');
  clearIdleTimer(chatId);

  const idx = waitingQueue.findIndex(u => u.chatId === chatId);
  if (idx > -1) waitingQueue.splice(idx, 1);

  const last = sessionHistory.filter(s => s.userId == chatId).sort((a, b) => b.timestamp - a.timestamp)[0];

  let welcome = `
✨ *Welcome to Anonymous Chat!* ✨

🔍 Chat acak anonim  
🎭 Stealth Mode  
❤️ Cari minat sama  
⭐ Rating system  
🏆 Leaderboard  
🔐 Admin Panel  
💎 VIP  
🛡️ Anti-spam  
💙 Dibuat oleh @${ADMIN_USERNAME}
`;

  if (last) {
    welcome = `👋 Welcome back, ${name}!\n⏱ Durasi terakhir: ${formatTime(last.durationSec)}\n\n` + welcome;
  }

  bot.sendMessage(chatId, welcome, {
    parse_mode: 'HTML',
    ...genderButtons,
  });
});

// =============== Perintah ===============
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
💡 *Bantuan:*
- /start → Mulai
- /stats → Statistik
- /profile → Profil
- 🔍 Cari Partner
- 🎯 Cari Lawan Jenis
- ❤️ Cari Minat Sama
- 🎲 Tukar Acak
- 🛑 Berhenti
- ⏭️ Skip
- 🚨 Laporkan
- ⭐ Beri Rating
- 🏆 Leaderboard
  `, { parse_mode: 'HTML' });
});

bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const userSessions = sessionHistory.filter(s => s.userId == chatId);
  const totalDuration = userSessions.reduce((sum, s) => sum + s.durationSec, 0);
  const avgDuration = userSessions.length > 0 ? totalDuration / userSessions.length : 0;

  bot.sendMessage(chatId, `
📊 *Statistik Anda:*
🔹 Total sesi: ${userSessions.length}
🔹 Rata-rata: ${formatTime(avgDuration)}
🔹 Total waktu: ${formatTime(totalDuration)}
${isPremium(chatId) ? '💎 Status: VIP' : ''}
  `, { parse_mode: 'HTML' });
});

bot.onText(/\/profile/, (msg) => {
  const chatId = msg.chat.id;
  const profile = userProfiles.get(chatId) || {};
  bot.sendMessage(chatId, `
👤 *Profil:*
📛 Nama: ${profile.name || 'Tidak diatur'}
🎂 Usia: ${profile.age || 'Tidak diatur'}
📝 Bio: ${profile.bio || 'Tidak ada'}
  `, { parse_mode: 'HTML' });
});

bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  if (isAdmin(chatId)) {
    userState.set(chatId, 'admin_mode');
    bot.sendMessage(chatId, "🔐 Admin Mode Aktif", adminButtons);
  } else {
    bot.sendMessage(chatId, "❌ Akses ditolak.");
  }
});

// =============== Message Handler ===============
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (msg.chat.type !== 'private') return;
  if (isUserBlocked(chatId) && text !== '/start') return;

  resetIdleTimer(chatId);

  if (isSpam(chatId) && text) {
    bot.sendMessage(chatId, "⛔ Jangan spam! Tunggu sebentar.");
    return;
  }

  // === Admin Mode ===
  if (userState.get(chatId) === 'admin_mode') {
    if (text === '🔙 Kembali ke Chat') {
      userState.set(chatId, null);
      bot.sendMessage(chatId, "👋 Kembali ke mode user.", mainButtons);
      return;
    }

    if (text === '👥 Lihat Online') {
      const status = getUserStatusCount();
      bot.sendMessage(chatId, `
📊 *Status:*
👥 Chat: ${status.chatting}
⏳ Antri: ${status.inQueue}
🟢 Total: ${status.totalActive}
      `, { parse_mode: 'HTML' });
    } else if (text === '📋 Laporan') {
      reportedUsers = reportedUsers.filter(rep => Date.now() - rep.timestamp < REPORT_WINDOW);
      if (reportedUsers.length === 0) {
        bot.sendMessage(chatId, "📭 Tidak ada laporan.");
      } else {
        reportedUsers.forEach((rep, i) => {
          bot.sendMessage(chatId, `
🚨 Laporan #${i+1}
👤: \`${rep.reportedId}\`
📤: \`${rep.reporterId}\`
🕒: ${new Date(rep.timestamp).toLocaleTimeString()}
          `, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '🚫 Blokir', callback_data: `ban_${rep.reportedId}` },
                { text: '🗑️ Hapus', callback_data: `delrep_${i}` }
              ]]
            }
          });
        });
      }
    } else if (text === '🕵️ Cek User') {
      bot.sendMessage(chatId, "Kirim ID user:");
      userState.set(chatId, 'awaiting_user_id');
    } else if (text === '📢 Broadcast') {
      bot.sendMessage(chatId, "Kirim pesan untuk broadcast:");
      userState.set(chatId, 'awaiting_broadcast');
    } else if (text === '🚫 Blokir List') {
      bot.sendMessage(chatId, `⛔ Diblokir: ${Array.from(blockedUsers).join(', ') || 'Kosong'}`);
    } else if (text === '🔇 Mute List') {
      bot.sendMessage(chatId, `🔇 Dimute: ${Array.from(mutedUsers).join(', ') || 'Kosong'}`);
    } else if (text === '🎁 Jadikan VIP') {
      bot.sendMessage(chatId, "Kirim ID user:");
      userState.set(chatId, 'awaiting_vip');
    } else if (text === '📤 Simpan Data') {
      saveAllData();
      bot.sendMessage(chatId, "✅ Data disimpan.");
    } else if (userState.get(chatId) === 'awaiting_user_id') {
      const target = text.trim();
      const status = partners.has(target) ? 'Chatting' : waitingQueue.some(u => u.chatId == target) ? 'Antri' : 'Offline';
      bot.sendMessage(chatId, `🔍 ID: \`${target}\`\nStatus: ${status}`, { parse_mode: 'HTML' });
      userState.set(chatId, 'admin_mode');
    } else if (userState.get(chatId) === 'awaiting_broadcast') {
      const users = Array.from(userState.keys()).filter(id => id !== chatId);
      users.forEach(id => bot.sendMessage(id, `📢 Admin: ${text}`).catch(() => {}));
      bot.sendMessage(chatId, `✅ Terkirim ke ${users.length} user.`);
      userState.set(chatId, 'admin_mode');
    } else if (userState.get(chatId) === 'awaiting_vip') {
      PREMIUM_IDS.add(text.trim());
      saveAllData();
      bot.sendMessage(chatId, `✅ User \`${text}\` sekarang VIP!`);
      userState.set(chatId, 'admin_mode');
    }
    return;
  }

  // === Gender & Interest ===
  if (userState.get(chatId) === 'awaiting_gender') {
    if (text === '👦 Laki-laki') userGender.set(chatId, 'laki-laki');
    else if (text === '👧 Perempuan') userGender.set(chatId, 'perempuan');
    else if (text === '🎭 Tanpa Gender (Stealth Mode)') userGender.set(chatId, 'rahasia');
    else return bot.sendMessage(chatId, 'Pilih gender.');

    userState.set(chatId, 'awaiting_interest');
    bot.sendMessage(chatId, "Apa minatmu?", interestButtons);
    return;
  }

  if (userState.get(chatId) === 'awaiting_interest') {
    userInterest.set(chatId, text.includes('🚫') ? 'umum' : text.replace(/[^\w\s]/g, ''));
    userState.set(chatId, null);
    bot.sendMessage(chatId, "✅ Siap! Tekan 'Cari Partner'", mainButtons);
    return;
  }

  // === Menu ===
  if (text === '🔍 Cari Partner') findPartner(chatId);
  else if (text === '🎯 Cari Lawan Jenis') findPartner(chatId, 'lawan');
  else if (text === '❤️ Cari Minat Sama') findPartner(chatId, null, true);
  else if (text === '🎲 Tukar Acak') {
    if (partners.has(chatId)) {
      const { partnerId } = partners.get(chatId);
      partners.delete(chatId);
      partners.delete(partnerId);
      bot.sendMessage(chatId, "🎲 Tukar acak! Mencari baru...", chatButtons);
      bot.sendMessage(partnerId, "💬 Partner melakukan tukar acak!", mainButtons);
      userState.set(chatId, null);
      userState.set(partnerId, null);
      setTimeout(() => findPartner(chatId), 500);
    }
  } else if (text === '📝 Tentang') {
    bot.sendMessage(chatId, "🤖 Anonymous Chat by @raihan_official0307");
  } else if (text === '📊 Statistik') {
    const sessions = sessionHistory.filter(s => s.userId == chatId).length;
    bot.sendMessage(chatId, `📈 Total sesi: ${sessions}`);
  } else if (text === '🏆 Leaderboard') {
    const sorted = Array.from(userActivity.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const list = sorted.map(([id, count], i) => `${i+1}. User \`${id}\`: ${count} sesi`).join('\n');
    bot.sendMessage(chatId, `🏆 *Top 5 Paling Aktif:*\n${list || 'Belum ada data'}`, { parse_mode: 'HTML' });
  } else if (text === '👤 Profil') {
    bot.sendMessage(chatId, "Fitur profil. Gunakan /profile");
  } else if (text === '🔐 Admin Mode') {
    bot.sendText(/\/admin/, msg);
  } else if (text === '🛑 Berhenti') {
    stopChat(chatId);
  } else if (text === '🚨 Laporkan Partner') {
    const data = partners.get(chatId);
    if (data) {
      reportedUsers.push({ reporterId: chatId, reportedId: data.partnerId, timestamp: Date.now() });
      checkAutoBan(data.partnerId);
      stopChat(chatId);
      bot.sendMessage(chatId, "✅ Laporan dikirim.");
    } else {
      bot.sendMessage(chatId, "❌ Tidak ada partner.");
    }
  } else {
    const partner = partners.get(chatId);
    if (partner && !isUserMuted(chatId)) {
      if (msg.text && containsBadWord(msg.text)) {
        bot.sendMessage(chatId, "🚫 Kata kasar dilarang.");
        return;
      }
      if (msg.text?.length > MAX_MESSAGE_LENGTH) {
        bot.sendMessage(chatId, "⚠️ Terlalu panjang.");
        return;
      }
      bot.forwardMessage(partner.partnerId, chatId, msg.message_id).catch(() => stopChat(chatId));
    } else if (!waitingQueue.some(u => u.chatId === chatId)) {
      bot.sendMessage(chatId, "Tekan '🔍 Cari Partner' untuk mulai.", mainButtons);
    }
  }
});

// =============== Callback Query ===============
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (!isAdmin(chatId)) {
    bot.answerCallbackQuery(query.id, "❌");
    return;
  }

  if (data.startsWith('ban_')) {
    const userId = data.split('_')[1];
    banUser(userId);
    bot.answerCallbackQuery(query.id, "✅");
    bot.sendMessage(chatId, `🚫 \`${userId}\` diblokir.`);
  } else if (data.startsWith('delrep_')) {
    const i = parseInt(data.split('_')[1]);
    reportedUsers.splice(i, 1);
    bot.answerCallbackQuery(query.id, "🗑️");
    bot.editMessageText("🗑️ Dihapus.", { chat_id: chatId, message_id: query.message.message_id });
  } else if (data.startsWith('rate_')) {
    const [_, rating, partnerId] = data.split('_');
    const ratings = userRatings.get(partnerId) || [];
    ratings.push(parseInt(rating));
    userRatings.set(partnerId, ratings);
    bot.answerCallbackQuery(query.id, `⭐ Terima kasih!`);
  }
});

// =============== Load & Save ===============
loadAllData();
process.on('SIGINT', () => {
  saveAllData();
  console.log('💾 Data disimpan. Bot berhenti.');
  process.exit();
});

console.log('🚀 Anonymous Chat Bot siap! Dibuat oleh: raihan_official0307 💙');

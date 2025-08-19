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
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()) || [];
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'raihan_official0307';
const PREMIUM_IDS = new Set((process.env.PREMIUM_IDS || '').split(',').map(id => id.trim()));

// =============== Konstanta ===============
const IDLE_TIMEOUT = 120_000; // 2 menit
const MAX_QUEUE = 15;
const REPORT_THRESHOLD = 3;
const REPORT_WINDOW = 60 * 60 * 1000; // 1 jam
const MESSAGE_TIMEOUT = 3000; // Anti-spam window
const MAX_MESSAGE_LENGTH = 4000;

// =============== File Path ===============
const BLOCKED_FILE = path.join(__dirname, 'data', 'blocked.json');
const MUTED_FILE = path.join(__dirname, 'data', 'muted.json');
const PREMIUM_FILE = path.join(__dirname, 'data', 'premium.json');
const LOG_FILE = path.join(__dirname, 'data', 'activity.log');

// Buat folder data jika belum ada
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));

// =============== Inisialisasi Bot ===============
const bot = new TelegramBot(TOKEN, { polling: true });

// =============== State & Data ===============
const waitingQueue = [];
const partners = new Map();
const userGender = new Map();
const userInterest = new Map(); // Minat pengguna
const userState = new Map(); // awaiting_gender, chatting, in_queue, admin_mode, dll
const userTimers = new Map();
const reportedUsers = []; // { reporterId, reportedId, timestamp }
const sessionHistory = [];
const userMessageLog = new Map();
const mutedUsers = new Set();
const blockedUsers = new Set();
const userProfiles = new Map(); // Simpan nama, usia, bio
const userRatings = new Map(); // { userId: [ratings] }

// =============== Baca File Blokir & Mute ===============
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
  const blocked = loadFile(BLOCKED_FILE);
  blocked.forEach(id => blockedUsers.add(String(id)));

  const muted = loadFile(MUTED_FILE);
  muted.forEach(id => mutedUsers.add(String(id)));

  const premium = loadFile(PREMIUM_FILE);
  premium.forEach(id => PREMIUM_IDS.add(String(id)));
}

function saveAllData() {
  saveFile(BLOCKED_FILE, Array.from(blockedUsers).map(id => parseInt(id)));
  saveFile(MUTED_FILE, Array.from(mutedUsers).map(id => parseInt(id)));
  saveFile(PREMIUM_FILE, Array.from(PREMIUM_IDS));
}

function logActivity(msg) {
  const timestamp = new Date().toISOString();
  const log = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, log);
  console.log(log.trim());
}

// =============== Load saat start ===============
loadAllData();

// =============== Fungsi Pendukung ===============
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
  if (userTimers.has(chatId)) {
    clearTimeout(userTimers.get(chatId));
    userTimers.delete(chatId);
  }
}

function resetIdleTimer(chatId) {
  clearIdleTimer(chatId);
  const timerId = setTimeout(() => {
    if (partners.has(chatId)) {
      bot.sendMessage(chatId, `
💤 Kamu tidak aktif selama 2 menit. Sesi dihentikan otomatis.

Ketik /start untuk mulai lagi.
      `.trim(), mainButtons);
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
      bot.sendMessage(userId, `❌ Kamu diblokir oleh admin.\nHubungi: @${ADMIN_USERNAME}`);
    } catch (e) {}
    logActivity(`[BAN] User ${userId} diblokir.`);
  }
}

function unbanUser(userId) {
  userId = String(userId);
  if (blockedUsers.has(userId)) {
    blockedUsers.delete(userId);
    saveAllData();
    try {
      bot.sendMessage(userId, `✅ Kamu telah di-unblock oleh admin.`);
    } catch (e) {}
    logActivity(`[UNBAN] User ${userId} di-unblock.`);
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
      bot.sendMessage(userId, "🔇 Kamu dimute sementara. Tidak bisa kirim pesan.");
    } catch (e) {}
    logActivity(`[MUTE] User ${userId} dimute.`);
  }
}

function unmuteUser(userId) {
  userId = String(userId);
  if (mutedUsers.has(userId)) {
    mutedUsers.delete(userId);
    saveAllData();
    try {
      bot.sendMessage(userId, "🔊 Mute dihapus. Kamu bisa kirim pesan lagi.");
    } catch (e) {}
    logActivity(`[UNMUTE] User ${userId} di-unmute.`);
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
    ADMIN_IDS.forEach(id => {
      bot.sendMessage(id, `🚨 *Auto-Ban*: User \`${userId}\` diblokir otomatis karena dilaporkan ${REPORT_THRESHOLD}x dalam 1 jam.`, {
        parse_mode: 'HTML'
      });
    });
  }
}

// =============== Fitur: Cari Partner (dengan minat) ===============
function findPartner(chatId, matchGender = null, interest = null) {
  if (isUserBlocked(chatId)) {
    bot.sendMessage(chatId, `❌ Kamu diblokir.\nHubungi: @${ADMIN_USERNAME}`);
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

    partners.set(chatId, { partnerId, connectedAt: Date.now(), interestMatch: !!interest });
    partners.set(partnerId, { partnerId: chatId, connectedAt: Date.now(), interestMatch: !!interest });

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
  }
}

// =============== Stop Chat ===============
function stopChat(chatId) {
  clearIdleTimer(chatId);
  const data = partners.get(chatId);
  if (data) {
    const { partnerId, connectedAt } = data;
    const duration = Math.floor((Date.now() - connectedAt) / 1000);
    sessionHistory.push({ userId: chatId, durationSec: duration, timestamp: Date.now() });
    if (sessionHistory.length > 100) sessionHistory.shift();

    partners.delete(chatId);
    partners.delete(partnerId);

    bot.sendMessage(chatId, `🛑 Berhenti setelah ${formatTime(duration)}`, mainButtons);
    bot.sendMessage(partnerId, `💬 Partner keluar setelah ${formatTime(duration)}`, mainButtons);

    userState.set(chatId, null);
    userState.set(partnerId, null);

    // Rating prompt
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
      [{ text: '👤 Tanpa Gender (Stealth Mode)' }]
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
      [{ text: '❤️ Cari Minat Sama' }, { text: '📝 Tentang' }],
      [{ text: '📊 Statistik' }, { text: '👤 Profil' }]
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
      [{ text: '🕵️ Detail User' }, { text: '📢 Broadcast' }],
      [{ text: '🚫 Daftar Blokir' }, { text: '🔇 Daftar Mute' }],
      [{ text: '🎁 Premium' }, { text: '📤 Backup Data' }],
      [{ text: '🔙 Kembali ke Chat' }]
    ],
    resize_keyboard: true,
  },
};

// =============== Perintah /start ===============
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.chat.first_name || "User";

  if (isUserBlocked(chatId)) {
    bot.sendMessage(chatId, `❌ Kamu diblokir oleh admin.\n\nSilakan hubungi @${ADMIN_USERNAME} untuk membuka blokir.`, mainButtons);
    return;
  }

  // Reset state
  partners.delete(chatId);
  userGender.delete(chatId);
  userInterest.delete(chatId);
  userState.set(chatId, 'awaiting_gender');
  clearIdleTimer(chatId);

  const idx = waitingQueue.findIndex(u => u.chatId === chatId);
  if (idx > -1) waitingQueue.splice(idx, 1);

  const last = sessionHistory
    .filter(s => s.userId == chatId)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  let welcome = `
✨ *Welcome to Anonymous Chat!* ✨

🔍 Chat acak anonim  
👦👧 Pilih gender  
❤️ Cari minat sama  
⭐ Beri rating  
🛡️ Anti-spam & badword  
🎯 Auto-ban spam  
📊 Statistik sesi  
🔐 Dibuat oleh @${ADMIN_USERNAME} 💙
`;

  if (last) {
    welcome = `👋 Welcome back, ${name}!\n⏱ Durasi terakhir: ${formatTime(last.durationSec)}\n\n` + welcome;
  }

  bot.sendMessage(chatId, welcome, {
    parse_mode: 'HTML',
    ...genderButtons,
  });

  logActivity(`🆕 User baru: ${name} (${chatId}) mulai.`);
});

// =============== Perintah Lainnya ===============
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
💡 *Bantuan:*
- /start → Mulai bot
- /stats → Statistikmu
- /profile → Lihat profil
- 🔍 Cari Partner → Cari teman ngobrol
- 🎯 Cari Lawan Jenis → Beda gender
- ❤️ Cari Minat Sama → Suka hal yang sama
- 🛑 Berhenti → Hentikan sesi
- ⏭️ Skip → Ganti partner
- 🚨 Laporkan → Kirim laporan ke admin
- ⭐ Beri Rating → Rate partner
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
🔹 Rata-rata durasi: ${formatTime(avgDuration)}
🔹 Total waktu: ${formatTime(totalDuration)}
${isPremium(chatId) ? '💎 Status: VIP' : '🚀 Upgrade ke VIP untuk fitur eksklusif!'}
    `, { parse_mode: 'HTML' });
});

bot.onText(/\/profile/, (msg) => {
  const chatId = msg.chat.id;
  const profile = userProfiles.get(chatId) || {};
  const name = profile.name || "Tidak diatur";
  const age = profile.age || "Tidak diatur";
  const bio = profile.bio || "Tidak ada bio";

  bot.sendMessage(chatId, `
👤 *Profil Anda:*
📛 Nama: ${name}
🎂 Usia: ${age}
📝 Bio: ${bio}
    `, { parse_mode: 'HTML' });
});

bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  if (isAdmin(chatId)) {
    userState.set(chatId, 'admin_mode');
    bot.sendMessage(chatId, "🔐 Masuk mode Admin", adminButtons);
  } else {
    bot.sendMessage(chatId, "❌ Akses ditolak.");
  }
});

// =============== Message Handler ===============
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (msg.chat.type !== 'private') return;

  if (isUserBlocked(chatId) && text !== '/start') {
    bot.sendMessage(chatId, `❌ Kamu diblokir.\nHubungi: @${ADMIN_USERNAME}`);
    return;
  }

  resetIdleTimer(chatId);

  if (isSpam(chatId) && text) {
    bot.sendMessage(chatId, "⛔ Jangan spam! Tunggu sebentar.");
    return;
  }

  // === Mode Admin ===
  if (userState.get(chatId) === 'admin_mode') {
    if (text === '👥 Lihat Online') {
      const status = getUserStatusCount();
      bot.sendMessage(chatId, `
📊 *Status Pengguna*:
👥 Chat: ${status.chatting} pasangan
⏳ Antrian: ${status.inQueue}
🟢 Total: ${status.totalActive}
      `, { parse_mode: 'HTML' });
    } else if (text === '📋 Laporan') {
      reportedUsers = reportedUsers.filter(rep => Date.now() - rep.timestamp < REPORT_WINDOW);

      if (reportedUsers.length === 0) {
        bot.sendMessage(chatId, "📭 Tidak ada laporan aktif (1 jam terakhir).");
      } else {
        const reportCount = {};
        reportedUsers.forEach(rep => {
          reportCount[rep.reportedId] = (reportCount[rep.reportedId] || 0) + 1;
        });

        reportedUsers.forEach((rep, i) => {
          const gender = userGender.get(rep.reportedId) || 'Tidak diketahui';
          const count = reportCount[rep.reportedId];
          bot.sendMessage(chatId, `
🚨 *Laporan #${i+1}*
👤 Dilaporkan: \`${rep.reportedId}\` (${gender})
🔁 Laporan: ${count}/${REPORT_THRESHOLD}
📤 Oleh: \`${rep.reporterId}\`
🕒 ${new Date(rep.timestamp).toLocaleTimeString()}

Klik untuk blokir:
          `, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚫 Blokir', callback_data: `ban_${rep.reportedId}` }],
                [{ text: '🗑️ Hapus', callback_data: `delrep_${i}` }]
              ]
            }
          });
        });
      }
    } else if (text === '🕵️ Detail User') {
      bot.sendMessage(chatId, "Kirim ID user untuk cek detail.");
      userState.set(chatId, 'awaiting_user_id');
    } else if (text === '📢 Broadcast') {
      bot.sendMessage(chatId, "Kirim pesan untuk broadcast ke semua user.");
      userState.set(chatId, 'awaiting_broadcast');
    } else if (text === '🚫 Daftar Blokir') {
      if (blockedUsers.size === 0) {
        bot.sendMessage(chatId, "🟢 Tidak ada yang diblokir.");
      } else {
        const buttons = Array.from(blockedUsers).map(id => [
          { text: `🔓 ${id}`, callback_data: `unban_${id}` }
        ]);
        bot.sendMessage(chatId, `⛔ Diblokir: ${blockedUsers.size} user`, {
          reply_markup: { inline_keyboard: buttons }
        });
      }
    } else if (text === '🔇 Daftar Mute') {
      if (mutedUsers.size === 0) {
        bot.sendMessage(chatId, "🟢 Tidak ada yang dimute.");
      } else {
        const buttons = Array.from(mutedUsers).map(id => [
          { text: `🔊 ${id}`, callback_data: `unmute_${id}` }
        ]);
        bot.sendMessage(chatId, `🔇 Dimute: ${mutedUsers.size} user`, {
          reply_markup: { inline_keyboard: buttons }
        });
      }
    } else if (text === '🎁 Premium') {
      bot.sendMessage(chatId, "Kirim ID user untuk jadikan Premium (VIP).");
      userState.set(chatId, 'awaiting_premium');
    } else if (text === '📤 Backup Data') {
      saveAllData();
      bot.sendMessage(chatId, "✅ Data disimpan dan dibackup.");
    } else if (userState.get(chatId) === 'awaiting_user_id') {
      const targetId = text.trim();
      const gender = userGender.get(targetId) || 'Tidak diketahui';
      const interest = userInterest.get(targetId) || 'Tidak ada';
      const status = partners.has(targetId) ? 'Chatting' : waitingQueue.some(u => u.chatId == targetId) ? 'Antri' : 'Offline';
      bot.sendMessage(chatId, `🔍 ID: \`${targetId}\`\nGender: ${gender}\nMinat: ${interest}\nStatus: ${status}`, { parse_mode: 'HTML' });
      userState.set(chatId, 'admin_mode');
    } else if (userState.get(chatId) === 'awaiting_broadcast') {
      const activeUsers = Array.from(userState.keys()).filter(id => id !== chatId);
      activeUsers.forEach(id => {
        bot.sendMessage(id, `📢 *Pesan dari Admin:*\n\n${text}`, { parse_mode: 'HTML' }).catch(() => {});
      });
      bot.sendMessage(chatId, `✅ Broadcast ke ${activeUsers.length} user.`);
      userState.set(chatId, 'admin_mode');
    } else if (userState.get(chatId) === 'awaiting_premium') {
      const targetId = text.trim();
      PREMIUM_IDS.add(targetId);
      saveAllData();
      bot.sendMessage(chatId, `✅ \`${targetId}\` sekarang Premium!`);
      try {
        bot.sendMessage(targetId, "🎉 Selamat! Kamu sekarang adalah **VIP User**! 🎉");
      } catch (e) {}
      userState.set(chatId, 'admin_mode');
    } else if (text === '🔙 Kembali ke Chat') {
      userState.set(chatId, null);
      bot.sendMessage(chatId, "👋 Kembali ke mode user.", mainButtons);
    }
    return;
  }

  // === Gender ===
  if (userState.get(chatId) === 'awaiting_gender') {
    if (text === '👦 Laki-laki') {
      userGender.set(chatId, 'laki-laki');
      userState.set(chatId, 'awaiting_interest');
      bot.sendMessage(chatId, "Apa minatmu?", interestButtons);
    } else if (text === '👧 Perempuan') {
      userGender.set(chatId, 'perempuan');
      userState.set(chatId, 'awaiting_interest');
      bot.sendMessage(chatId, "Apa minatmu?", interestButtons);
    } else if (text === '👤 Tanpa Gender (Stealth Mode)') {
      userGender.set(chatId, 'rahasia');
      userState.set(chatId, 'awaiting_interest');
      bot.sendMessage(chatId, "Apa minatmu?", interestButtons);
    } else {
      bot.sendMessage(chatId, 'Pilih gender dengan tombol.');
    }
    return;
  }

  if (userState.get(chatId) === 'awaiting_interest') {
    if (text === '🚫 Tidak Ada Minat') {
      userInterest.set(chatId, 'umum');
    } else {
      userInterest.set(chatId, text.replace(/[^\w\s]/gi, ''));
    }
    userState.set(chatId, null);
    bot.sendMessage(chatId, "✅ Minat disimpan. Tekan 'Cari Partner' untuk mulai!", mainButtons);
    return;
  }

  // === Menu ===
  if (text === '📝 Tentang') {
    bot.sendMessage(chatId, `
🤖 *Anonymous Chat*
🔐 Dibuat oleh: @${ADMIN_USERNAME}
💙 Tanpa database
📁 Blokir & mute disimpan
🚨 Laporkan spam
⏱️ Auto-stop jika idle
📊 Statistik sesi
🎯 Cari lawan jenis
❤️ Cari minat sama
⭐ Rating system
💎 Premium VIP
📝 Profil pribadi
    `, { parse_mode: 'HTML' });
  } else if (text === '📊 Statistik') {
    const userSessions = sessionHistory.filter(s => s.userId == chatId);
    bot.sendMessage(chatId, `📈 Total sesi kamu: ${userSessions.length}`);
  } else if (text === '👤 Profil') {
    bot.sendMessage(chatId, "Fitur profil sedang dikembangkan. Gunakan /profile");
  }

  // === Cari Partner ===
  else if (text === '🔍 Cari Partner') {
    if (!userGender.has(chatId)) return bot.sendMessage(chatId, 'Mulai ulang /start');
    if (!partners.has(chatId) && !waitingQueue.some(u => u.chatId === chatId)) {
      findPartner(chatId);
    }
  } else if (text === '🎯 Cari Lawan Jenis') {
    if (!userGender.has(chatId)) return bot.sendMessage(chatId, 'Mulai ulang /start');
    if (!partners.has(chatId) && !waitingQueue.some(u => u.chatId === chatId)) {
      findPartner(chatId, 'lawan');
    }
  } else if (text === '❤️ Cari Minat Sama') {
    if (!userInterest.has(chatId)) return bot.sendMessage(chatId, 'Atur minat dulu.');
    if (!partners.has(chatId) && !waitingQueue.some(u => u.chatId === chatId)) {
      findPartner(chatId, null, true);
    }
  }

  // === Stop, Skip, Report ===
  else if (text === '🛑 Berhenti') {
    stopChat(chatId);
  } else if (text === '⏭️ Skip') {
    const data = partners.get(chatId);
    if (data) {
      const { partnerId } = data;
      partners.delete(chatId);
      partners.delete(partnerId);
      bot.sendMessage(chatId, "⏭️ Skip! Mencari partner baru...", chatButtons);
      bot.sendMessage(partnerId, "💬 Partner skip kamu.", mainButtons);
      userState.set(chatId, null);
      userState.set(partnerId, null);
      setTimeout(() => findPartner(chatId), 500);
    }
  } else if (text === '🚨 Laporkan Partner') {
    const data = partners.get(chatId);
    if (data) {
      const reportedId = data.partnerId;
      reportedUsers.push({ reporterId: chatId, reportedId, timestamp: Date.now() });
      checkAutoBan(reportedId);
      stopChat(chatId);
      bot.sendMessage(chatId, "✅ Laporan dikirim ke admin. Terima kasih!");

      ADMIN_IDS.forEach(id => {
        const rg = userGender.get(chatId) || '-';
        const rp = userGender.get(reportedId) || '-';
        bot.sendMessage(id, `🚨 Laporan: \`${reportedId}\` (${rp}) oleh \`${chatId}\` (${rg})`, { parse_mode: 'HTML' });
      });
    } else {
      bot.sendMessage(chatId, "❌ Tidak ada partner.");
    }
  }

  // === Teruskan Pesan ===
  else {
    const partnerData = partners.get(chatId);
    if (partnerData && !isUserMuted(chatId)) {
      if (msg.text && containsBadWord(msg.text)) {
        bot.sendMessage(chatId, "🚫 Kata kasar tidak diperbolehkan.");
        return;
      }
      if (msg.text && msg.text.length > MAX_MESSAGE_LENGTH) {
        bot.sendMessage(chatId, "⚠️ Pesan terlalu panjang (max 4000 karakter).");
        return;
      }
      bot.forwardMessage(partnerData.partnerId, chatId, msg.message_id).catch(() => stopChat(chatId));
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
    bot.answerCallbackQuery(query.id, `✅ Diblokir`);
    bot.sendMessage(chatId, `🚫 \`${userId}\` diblokir.`, { parse_mode: 'HTML' });
  } else if (data.startsWith('unban_')) {
    const userId = data.split('_')[1];
    if (unbanUser(userId)) {
      bot.answerCallbackQuery(query.id, `✅ Di-unblock`);
      bot.editMessageText(`✅ \`${userId}\` di-unblock.`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML'
      });
    }
  } else if (data.startsWith('unmute_')) {
    const userId = data.split('_')[1];
    if (unmuteUser(userId)) {
      bot.answerCallbackQuery(query.id, `✅ Di-unmute`);
      bot.editMessageText(`✅ \`${userId}\` di-unmute.`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML'
      });
    }
  } else if (data.startsWith('delrep_')) {
    const idx = parseInt(data.split('_')[1]);
    if (idx >= 0 && idx < reportedUsers.length) {
      reportedUsers.splice(idx, 1);
      bot.answerCallbackQuery(query.id, "🗑️");
      bot.editMessageText("🗑️ Laporan dihapus.", {
        chat_id: chatId,
        message_id: query.message.message_id
      });
    }
  } else if (data.startsWith('rate_')) {
    const [_, rating, partnerId] = data.split('_');
    const ratings = userRatings.get(partnerId) || [];
    ratings.push(parseInt(rating));
    userRatings.set(partnerId, ratings);
    bot.answerCallbackQuery(query.id, `⭐ Terima kasih atas rating ${rating}!`);
    bot.editMessageText(`⭐ Terima kasih atas rating!`, {
      chat_id: chatId,
      message_id: query.message.message_id
    });
  }
});

// =============== Error Handling ===============
bot.on('polling_error', e => console.log('[Polling]', e.message));
bot.on('webhook_error', e => console.log('[Webhook]', e));

console.log('🚀 Anonymous Chat Bot siap! Dibuat oleh: raihan_official0307 💙');

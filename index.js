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
// const TOKEN = 'token'; // Ganti dengan token kamu
// const ADMIN_IDS = ['id']; // Ganti dengan ID kamu
const TOKEN = process.env.TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(id => id.trim()) || [];
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'raihan_official0307';

const IDLE_TIMEOUT = 120_000; // 2 menit
const MAX_QUEUE = 10;
const REPORT_THRESHOLD = 3; // Auto-ban setelah 3 laporan
const REPORT_WINDOW = 60 * 60 * 1000; // 1 jam

// =============== File Path ===============
const BLOCKED_FILE = path.join(__dirname, 'blocked.json');
const MUTED_FILE = path.join(__dirname, 'muted.json');

// =============== Inisialisasi Bot ===============
const bot = new TelegramBot(TOKEN, { polling: true });

const waitingQueue = [];
const partners = new Map();
const userGender = new Map();
const userState = new Map();
const userTimers = new Map();
const reportedUsers = []; // { reporterId, reportedId, timestamp }
const sessionHistory = [];
const userMessageLog = new Map();
const mutedUsers = new Set(); // Untuk mute sementara

// =============== Baca File Blokir & Mute ===============
let blockedUsers = new Set();

function loadBlocked() {
  try {
    if (fs.existsSync(BLOCKED_FILE)) {
      const data = fs.readFileSync(BLOCKED_FILE, 'utf-8');
      const ids = JSON.parse(data);
      if (Array.isArray(ids)) ids.forEach(id => blockedUsers.add(String(id)));
    } else {
      fs.writeFileSync(BLOCKED_FILE, '[]', 'utf-8');
    }
  } catch (err) {
    console.error('Gagal load blocked.json', err);
  }
}

function saveBlocked() {
  try {
    const arr = Array.from(blockedUsers).map(id => parseInt(id));
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    console.error('Gagal simpan blocked.json', err);
  }
}

function loadMuted() {
  try {
    if (fs.existsSync(MUTED_FILE)) {
      const data = fs.readFileSync(MUTED_FILE, 'utf-8');
      const ids = JSON.parse(data);
      if (Array.isArray(ids)) ids.forEach(id => mutedUsers.add(String(id)));
    } else {
      fs.writeFileSync(MUTED_FILE, '[]', 'utf-8');
    }
  } catch (err) {
    console.error('Gagal load muted.json', err);
  }
}

function saveMuted() {
  try {
    const arr = Array.from(mutedUsers).map(id => parseInt(id));
    fs.writeFileSync(MUTED_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    console.error('Gagal simpan muted.json', err);
  }
}

// =============== Load saat start ===============
loadBlocked();
loadMuted();

// =============== Fungsi Pendukung ===============
function isAdmin(chatId) {
  return ADMIN_IDS.includes(String(chatId));
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
    if (partners.has(chatId) || waitingQueue.some(u => u.chatId === chatId)) {
      bot.sendMessage(chatId, `
💤 Kamu tidak aktif selama 2 menit.

Sesi dihentikan otomatis.

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
    saveBlocked();
    if (partners.has(userId)) stopChat(userId);
    const idx = waitingQueue.findIndex(u => u.chatId == userId);
    if (idx > -1) waitingQueue.splice(idx, 1);
    try {
      bot.sendMessage(userId, `❌ Kamu diblokir oleh admin.\nHubungi: @${ADMIN_USERNAME}`);
    } catch (e) {}
    console.log(`[BAN] User ${userId} diblokir.`);
  }
}

function unbanUser(userId) {
  userId = String(userId);
  if (blockedUsers.has(userId)) {
    blockedUsers.delete(userId);
    saveBlocked();
    try {
      bot.sendMessage(userId, `✅ Kamu telah di-unblock oleh admin.`);
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
    saveMuted();
    try {
      bot.sendMessage(userId, "🔇 Kamu dimute sementara. Tidak bisa kirim pesan.");
    } catch (e) {}
    console.log(`[MUTE] User ${userId} dimute.`);
  }
}

function unmuteUser(userId) {
  userId = String(userId);
  if (mutedUsers.has(userId)) {
    mutedUsers.delete(userId);
    saveMuted();
    try {
      bot.sendMessage(userId, "🔊 Mute dihapus. Kamu bisa kirim pesan lagi.");
    } catch (e) {}
    console.log(`[UNMUTE] User ${userId} di-unmute.`);
    return true;
  }
  return false;
}

function isSpam(chatId) {
  const logs = userMessageLog.get(chatId) || [];
  const now = Date.now();
  const recent = logs.filter(t => t > now - 5000);
  if (recent.length >= 4) return true;
  recent.push(now);
  userMessageLog.set(chatId, recent.slice(-5));
  return false;
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

// =============== Fitur: Cari Partner ===============
function findPartner(chatId, matchGender = null) {
  if (isUserBlocked(chatId)) {
    bot.sendMessage(chatId, `❌ Kamu diblokir.\nHubungi: @${ADMIN_USERNAME}`);
    return;
  }

  if (waitingQueue.length >= MAX_QUEUE) {
    bot.sendMessage(chatId, "👥 Antrian penuh! Tunggu sebentar...");
    return;
  }

  const userGenderValue = userGender.get(chatId);
  let candidates = waitingQueue.filter(u => u.chatId !== chatId);

  if (matchGender === 'lawan') {
    const target = userGenderValue === 'laki-laki' ? 'perempuan' : 'laki-laki';
    candidates = candidates.filter(u => userGender.get(u.chatId) === target);
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
    bot.sendMessage(chatId, `✅ Terhubung dengan (${genderText})`, chatButtons);
    bot.sendMessage(partnerId, `✅ Terhubung dengan (${userGender.get(chatId) === 'laki-laki' ? '👦' : '👧'})`, chatButtons);

    userState.set(chatId, 'chatting');
    userState.set(partnerId, 'chatting');
    resetIdleTimer(chatId);
    resetIdleTimer(partnerId);
  } else {
    waitingQueue.push({ chatId, gender: userGender.get(chatId) });
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
      [{ text: '👦 Laki-laki' }, { text: '👧 Perempuan' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const mainButtons = {
  reply_markup: {
    keyboard: [
      [{ text: '🔍 Cari Partner' }, { text: '🎯 Cari Lawan Jenis' }],
      [{ text: '📝 Tentang' }, { text: '📊 Statistik' }]
    ],
    resize_keyboard: true,
  },
};

const chatButtons = {
  reply_markup: {
    keyboard: [
      [{ text: '⏭️ Skip' }, { text: '🛑 Berhenti' }],
      [{ text: '🚨 Laporkan Partner' }],
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
      [{ text: '🔙 Kembali ke Chat' }],
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

  partners.delete(chatId);
  userGender.delete(chatId);
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
⏭️ Bisa skip  
🚨 Bisa laporkan  
🔐 Auto-save blokir  

👤 *Created by:* \`@${ADMIN_USERNAME}\` 💙
`;

  if (last) {
    welcome = `👋 Welcome back, ${name}!\n⏱ Durasi terakhir: ${formatTime(last.durationSec)}\n\n` + welcome;
  }

  bot.sendMessage(chatId, welcome, {
    parse_mode: 'HTML',
    ...genderButtons,
  });

  ADMIN_IDS.forEach(id => {
    bot.sendMessage(id, `🆕 User baru: ${name} (${chatId}) mulai.`);
  });
});

// =============== Perintah Lainnya ===============
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
💡 *Bantuan:*
- /start → Mulai bot
- /stats → Lihat statistikmu
- 🔍 Cari Partner → Cari teman ngobrol
- 🎯 Cari Lawan Jenis → Cari beda gender
- 🛑 Berhenti → Hentikan sesi
- ⏭️ Skip → Ganti partner
- 🚨 Laporkan → Kirim laporan ke admin
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

// =============== Handle Semua Pesan ===============
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
    [
      { text: '🚫 Blokir', callback_data: `ban_${rep.reportedId}` },
      { text: '🗑️ Hapus', callback_data: `delrep_${i}` }
    ]
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
      { text: `🔊 ${id}`, callback_data: `unmute_${id}` }  // ✅ Diperbaiki di sini!
    ]);
    bot.sendMessage(chatId, `🔇 Dimute: ${mutedUsers.size} user`, {
      reply_markup: { inline_keyboard: buttons }
    });
  }
    } else if (text === '🔙 Kembali ke Chat') {
      userState.set(chatId, null);
      bot.sendMessage(chatId, "👋 Kembali ke mode user.", mainButtons);
    } else if (userState.get(chatId) === 'awaiting_user_id') {
      const targetId = text.trim();
      const gender = userGender.get(targetId) || 'Tidak diketahui';
      const status = partners.has(targetId) ? 'Chatting' : waitingQueue.some(u => u.chatId == targetId) ? 'Antri' : 'Offline';
      bot.sendMessage(chatId, `🔍 ID: \`${targetId}\`\nGender: ${gender}\nStatus: ${status}`, { parse_mode: 'HTML' });
      userState.set(chatId, 'admin_mode');
    } else if (userState.get(chatId) === 'awaiting_broadcast') {
      const activeUsers = Array.from(userState.keys()).filter(id => id !== chatId);
      activeUsers.forEach(id => {
        bot.sendMessage(id, `📢 *Pesan dari Admin:*\n\n${text}`, { parse_mode: 'HTML' }).catch(() => {});
      });
      bot.sendMessage(chatId, `✅ Broadcast ke ${activeUsers.length} user.`);
      userState.set(chatId, 'admin_mode');
    }
    return;
  }

  // === Gender ===
  if (userState.get(chatId) === 'awaiting_gender') {
    if (text === '👦 Laki-laki') {
      userGender.set(chatId, 'laki-laki');
      userState.set(chatId, null);
      bot.sendMessage(chatId, "✅ Gender: Laki-laki. Tekan 'Cari Partner'", mainButtons);
    } else if (text === '👧 Perempuan') {
      userGender.set(chatId, 'perempuan');
      userState.set(chatId, null);
      bot.sendMessage(chatId, "✅ Gender: Perempuan. Tekan 'Cari Partner'", mainButtons);
    } else {
      bot.sendMessage(chatId, 'Pilih gender dengan tombol.');
    }
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
    `, { parse_mode: 'HTML' });
  } else if (text === '📊 Statistik') {
    const userSessions = sessionHistory.filter(s => s.userId == chatId);
    bot.sendMessage(chatId, `📈 Total sesi kamu: ${userSessions.length}`);
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
      if (msg.text && msg.text.length > 2000) {
        bot.sendMessage(chatId, "⚠️ Pesan terlalu panjang (max 2000 karakter).");
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
  }
});

// =============== Error Handling ===============
bot.on('polling_error', e => console.log('[Polling]', e.message));
bot.on('webhook_error', e => console.log('[Webhook]', e));

console.log('🚀 Anonymous Chat Bot siap! Dibuat oleh: raihan_official0307 💙');

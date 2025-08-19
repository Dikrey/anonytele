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

// =============== Konstanta ===============
const IDLE_TIMEOUT = 120_000;
const MAX_QUEUE = 15;
const REPORT_THRESHOLD = 3;
const REPORT_WINDOW = 60 * 60 * 1000; // 1 jam
const MESSAGE_TIMEOUT = 3000;
const MAX_CAPTION_LENGTH = 4000;

// =============== File Path ===============
const DATA_DIR = path.join(__dirname, 'data');
const BLOCKED_FILE = path.join(DATA_DIR, 'blocked.json');
const MUTED_FILE = path.join(DATA_DIR, 'muted.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// =============== Inisialisasi Bot ===============
const bot = new TelegramBot(TOKEN, { polling: true });

// =============== State & Data ===============
const waitingQueue = [];
const partners = new Map();
const userGender = new Map();
const userState = new Map(); // awaiting_gender, admin_mode, admin_broadcast, dll
const userTimers = new Map();
const reportedUsers = []; // { reporterId, reportedId, timestamp }
const sessionHistory = [];
const userMessageLog = new Map();
const mutedUsers = new Set();
const blockedUsers = new Set();

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
}

function saveAllData() {
  saveFile(BLOCKED_FILE, Array.from(blockedUsers).map(id => parseInt(id)));
  saveFile(MUTED_FILE, Array.from(mutedUsers).map(id => parseInt(id)));
}

function isAdmin(chatId) {
  return ADMIN_IDS.includes(String(chatId));
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

function banUser(userId, chatId) {
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
    bot.sendMessage(chatId, `✅ User <code>${userId}</code> berhasil diblokir.`, { parse_mode: 'HTML' });
  } else {
    bot.sendMessage(chatId, `❌ User <code>${userId}</code> sudah diblokir.`, { parse_mode: 'HTML' });
  }
}

function unbanUser(userId, chatId) {
  userId = String(userId);
  if (blockedUsers.has(userId)) {
    blockedUsers.delete(userId);
    saveAllData();
    try {
      bot.sendMessage(userId, `✅ Kamu di-unblock oleh admin.`);
    } catch (e) {}
    bot.sendMessage(chatId, `✅ User <code>${userId}</code> berhasil di-unblock.`, { parse_mode: 'HTML' });
    return true;
  } else {
    bot.sendMessage(chatId, `❌ User <code>${userId}</code> tidak diblokir.`, { parse_mode: 'HTML' });
  }
  return false;
}

function muteUser(userId, chatId) {
  userId = String(userId);
  if (!mutedUsers.has(userId)) {
    mutedUsers.add(userId);
    saveAllData();
    try {
      bot.sendMessage(userId, "🔇 Kamu dimute sementara.");
    } catch (e) {}
    bot.sendMessage(chatId, `✅ User <code>${userId}</code> dimute.`, { parse_mode: 'HTML' });
  } else {
    bot.sendMessage(chatId, `❌ User <code>${userId}</code> sudah dimute.`, { parse_mode: 'HTML' });
  }
}

function unmuteUser(userId, chatId) {
  userId = String(userId);
  if (mutedUsers.has(userId)) {
    mutedUsers.delete(userId);
    saveAllData();
    try {
      bot.sendMessage(userId, "🔊 Mute dihapus.");
    } catch (e) {}
    bot.sendMessage(chatId, `✅ User <code>${userId}</code> di-unmute.`, { parse_mode: 'HTML' });
    return true;
  } else {
    bot.sendMessage(chatId, `❌ User <code>${userId}</code> tidak dimute.`, { parse_mode: 'HTML' });
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
  if (!text) return false;
  const badWords = ['anjing', 'babi', 'kontol', 'memek', 'fuck', 'shit', 'dick'];
  return badWords.some(word => text.toLowerCase().includes(word));
}

function checkAutoBan(userId) {
  const recent = reportedUsers.filter(rep =>
    rep.reportedId == userId && Date.now() - rep.timestamp < REPORT_WINDOW
  );
  if (recent.length >= REPORT_THRESHOLD) {
    banUser(userId, ADMIN_IDS[0]);
  }
}

// =============== Fitur: Cari Partner ===============
function findPartner(chatId) {
  if (isUserBlocked(chatId)) {
    bot.sendMessage(chatId, `❌ Kamu diblokir.`);
    return;
  }
  if (waitingQueue.length >= MAX_QUEUE) {
    bot.sendMessage(chatId, "👥 Antrian penuh!");
    return;
  }

  const candidates = waitingQueue.filter(u => u.chatId !== chatId);

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
    bot.sendMessage(partnerId, `✅ Terhubung!`, chatButtons);

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

    bot.sendMessage(chatId, `🛑 ${formatTime(duration)}`, mainButtons);
    bot.sendMessage(partnerId, `💬 Partner keluar (${formatTime(duration)})`, mainButtons);

    userState.set(chatId, null);
    userState.set(partnerId, null);
  } else if (userState.get(chatId) === 'in_queue') {
    const idx = waitingQueue.findIndex(u => u.chatId === chatId);
    if (idx > -1) waitingQueue.splice(idx, 1);
    bot.sendMessage(chatId, "🛑 Pencarian dibatalkan.", mainButtons);
    userState.set(chatId, null);
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
      [{ text: '🚨 Laporkan' }]
    ],
    resize_keyboard: true,
  },
};

const adminButtons = {
  reply_markup: {
    keyboard: [
      [{ text: '📊 Lihat Statistik' }, { text: '📋 Lihat Laporan' }],
      [{ text: '🕵️ Cek User' }, { text: '📢 Kirim Broadcast' }],
      [{ text: '🚫 Daftar Blokir' }, { text: '🔇 Daftar Mute' }],
      [{ text: '🔙 Kembali ke Chat' }]
    ],
    resize_keyboard: true,
  },
};

// =============== Load Data ===============
loadAllData();

// =============== /start ===============
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (isUserBlocked(chatId)) {
    bot.sendMessage(chatId, `❌ Kamu diblokir.\nHubungi: @${ADMIN_USERNAME}`, mainButtons);
    return;
  }

  // Reset
  partners.delete(chatId);
  userGender.delete(chatId);
  userState.set(chatId, 'awaiting_gender');
  const idx = waitingQueue.findIndex(u => u.chatId === chatId);
  if (idx > -1) waitingQueue.splice(idx, 1);

  const welcome = `
✨ <b>Welcome to Anonymous Chat!</b> ✨

🔐 <b>Dibuat oleh:</b> @${ADMIN_USERNAME} 💙  
🔍 <b>Fitur Utama:</b>
- 🎭 Chat acak & anonim
- 👦👧 Pilih gender
- 🎯 Cari lawan jenis
- ⏭️ Bisa skip kapan saja
- 🚨 Laporkan spam
- 📸 Kirim foto & video
- 🛑 Auto-stop jika idle
- 💬 Anti-spam & filter
- 📊 Statistik sesi

👉 <i>Pilih gender kamu untuk memulai:</i>
  `;

  bot.sendMessage(chatId, welcome, {
    parse_mode: 'HTML',
    ...genderButtons,
  });
});

// =============== /admin ===============
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, "❌ Akses ditolak. Hanya admin yang bisa masuk.");
    return;
  }

  userState.set(chatId, 'admin_mode');
  const helpText = `
🔐 <b>Mode Admin Aktif</b> 🔐

📋 <b>Fitur Admin:</b>
- 📊 Lihat Statistik Bot
- 📋 Lihat Laporan User
- 🕵️ Cek Detail User
- 📢 Kirim Broadcast
- 🚫 Lihat & Kelola Blokir
- 🔇 Lihat & Kelola Mute
- 🔙 Kembali ke Chat

Gunakan tombol di bawah untuk navigasi:
  `;

  bot.sendMessage(chatId, helpText, {
    parse_mode: 'HTML',
    ...adminButtons,
  });
});

// =============== Message Handler ===============
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const caption = msg.caption;

  if (msg.chat.type !== 'private') return;
  if (isUserBlocked(chatId) && !text?.startsWith('/start')) return;

  resetIdleTimer(chatId);

  if (isSpam(chatId) && (text || caption)) {
    bot.sendMessage(chatId, "⛔ Jangan spam! Tunggu sebentar.");
    return;
  }

  // === Mode Admin ===
  if (userState.get(chatId) === 'admin_mode') {
    if (text === '🔙 Kembali ke Chat') {
      userState.set(chatId, null);
      bot.sendMessage(chatId, "👋 Kembali ke mode user.", mainButtons);
      return;
    }

    if (text === '📊 Lihat Statistik') {
      const status = getUserStatusCount();
      const totalSessions = sessionHistory.length;
      bot.sendMessage(chatId, `
📊 <b>Statistik Bot:</b>
👥 Sedang Chat: ${status.chatting} pasangan
⏳ Antri: ${status.inQueue}
🟢 Total Aktif: ${status.totalActive}
📌 Total Sesi: ${totalSessions}
⛔ Diblokir: ${blockedUsers.size}
🔇 Dimute: ${mutedUsers.size}
🚨 Laporan Aktif: ${reportedUsers.length}
      `, { parse_mode: 'HTML' });
    }

    else if (text === '📋 Lihat Laporan') {
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
🚨 <b>Laporan #${i+1}</b>
👤 Dilaporkan: <code>${rep.reportedId}</code> (${gender})
🔁 Jumlah: ${count}/${REPORT_THRESHOLD}
📤 Oleh: <code>${rep.reporterId}</code>
🕒 ${new Date(rep.timestamp).toLocaleTimeString()}
          `, { parse_mode: 'HTML' });
        });
      }
    }

    else if (text === '🕵️ Cek User') {
      bot.sendMessage(chatId, "🆔 Kirim <b>ID user</b> yang ingin dicek:", { parse_mode: 'HTML' });
      userState.set(chatId, 'admin_cekuser');
    }

    else if (text === '📢 Kirim Broadcast') {
      bot.sendMessage(chatId, "📝 Kirim pesan (teks, foto, video) untuk broadcast ke semua user:", { parse_mode: 'HTML' });
      userState.set(chatId, 'admin_broadcast');
    }

    else if (text === '🚫 Daftar Blokir') {
      if (blockedUsers.size === 0) {
        bot.sendMessage(chatId, "🟢 Tidak ada user yang diblokir.");
      } else {
        const list = Array.from(blockedUsers).join(', ');
        bot.sendMessage(chatId, `⛔ <b>Diblokir (${blockedUsers.size}):</b>\n${list}`, { parse_mode: 'HTML' });
      }
    }

    else if (text === '🔇 Daftar Mute') {
      if (mutedUsers.size === 0) {
        bot.sendMessage(chatId, "🟢 Tidak ada user yang dimute.");
      } else {
        const list = Array.from(mutedUsers).join(', ');
        bot.sendMessage(chatId, `🔇 <b>Dimute (${mutedUsers.size}):</b>\n${list}`, { parse_mode: 'HTML' });
      }
    }

    else if (userState.get(chatId) === 'admin_cekuser') {
      const userId = text.trim();
      if (!/^\d+$/.test(userId)) {
        bot.sendMessage(chatId, "❌ ID harus angka.");
        return;
      }
      const gender = userGender.get(userId) || 'Tidak diketahui';
      const status = partners.has(userId) ? 'Chatting' : waitingQueue.some(u => u.chatId == userId) ? 'Antri' : 'Offline';
      const isBlocked = blockedUsers.has(userId) ? 'Ya' : 'Tidak';
      const isMuted = mutedUsers.has(userId) ? 'Ya' : 'Tidak';

      bot.sendMessage(chatId, `
🔍 <b>Info User</b> <code>${userId}</code>
⚧️ Gender: ${gender}
📍 Status: ${status}
⛔ Diblokir: ${isBlocked}
🔇 Dimute: ${isMuted}
      `, { parse_mode: 'HTML' });
      userState.set(chatId, 'admin_mode');
    }

    else if (userState.get(chatId) === 'admin_broadcast') {
      const users = Array.from(userState.keys()).filter(id => id !== chatId);
      let sent = 0;

      // Kirim sesuai tipe pesan
      if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        users.forEach(id => {
          bot.sendPhoto(id, photo.file_id, { caption: caption || '' })
            .then(() => sent++)
            .catch(() => {});
        });
      } else if (msg.video) {
        users.forEach(id => {
          bot.sendVideo(id, msg.video.file_id, { caption: caption || '' })
            .then(() => sent++)
            .catch(() => {});
        });
      } else if (text) {
        users.forEach(id => {
          bot.sendMessage(id, text, { parse_mode: 'HTML' })
            .then(() => sent++)
            .catch(() => {});
        });
      } else {
        bot.sendMessage(chatId, "❌ Format pesan tidak didukung.");
        userState.set(chatId, 'admin_mode');
        return;
      }

      setTimeout(() => {
        bot.sendMessage(chatId, `✅ Broadcast selesai. Terkirim ke ${sent} user.`);
      }, 1000);
      userState.set(chatId, 'admin_mode');
    }

    return;
  }

  // === Gender ===
  if (userState.get(chatId) === 'awaiting_gender') {
    if (text === '👦 Laki-laki') userGender.set(chatId, 'laki-laki');
    else if (text === '👧 Perempuan') userGender.set(chatId, 'perempuan');
    else {
      bot.sendMessage(chatId, "👉 Pilih gender dengan tombol di bawah:", genderButtons);
      return;
    }

    userState.set(chatId, null);
    bot.sendMessage(chatId, "✅ Gender disimpan! Tekan 'Cari Partner' untuk mulai.", mainButtons);
    return;
  }

  // === Menu ===
  if (text === '🔍 Cari Partner') {
    if (!userGender.has(chatId)) return bot.sendMessage(chatId, 'Mulai ulang /start');
    if (!partners.has(chatId) && !waitingQueue.some(u => u.chatId === chatId)) {
      findPartner(chatId);
    }
  } else if (text === '🎯 Cari Lawan Jenis') {
    if (!userGender.has(chatId)) return bot.sendMessage(chatId, 'Mulai ulang /start');
    if (!partners.has(chatId) && !waitingQueue.some(u => u.chatId === chatId)) {
      findPartner(chatId);
    }
  } else if (text === '📝 Tentang') {
    bot.sendMessage(chatId, `
🤖 <b>Anonymous Chat</b>
🔐 Dibuat oleh: @${ADMIN_USERNAME}
💙 Tanpa database
📸 Kirim foto & video
🛡️ Anti-spam & badword
🚀 Auto-stop idle
📊 Statistik sesi
🎯 Cari lawan jenis
    `, { parse_mode: 'HTML' });
  } else if (text === '📊 Statistik') {
    const userSessions = sessionHistory.filter(s => s.userId == chatId);
    const totalDuration = userSessions.reduce((sum, s) => sum + s.durationSec, 0);
    bot.sendMessage(chatId, `
📊 <b>Statistik Anda:</b>
🔹 Total sesi: ${userSessions.length}
🔹 Total waktu: ${formatTime(totalDuration)}
    `, { parse_mode: 'HTML' });
  } else if (text === '🛑 Berhenti') {
    stopChat(chatId);
  } else if (text === '🚨 Laporkan') {
    const data = partners.get(chatId);
    if (data) {
      reportedUsers.push({ reporterId: chatId, reportedId: data.partnerId, timestamp: Date.now() });
      checkAutoBan(data.partnerId);
      stopChat(chatId);
      bot.sendMessage(chatId, "✅ Laporan dikirim ke admin. Terima kasih!");
    } else {
      bot.sendMessage(chatId, "❌ Tidak ada partner.");
    }
  } else {
    const partner = partners.get(chatId);
    if (partner && !isUserMuted(chatId)) {
      if (caption && containsBadWord(caption)) {
        bot.sendMessage(chatId, "🚫 Caption mengandung kata kasar.");
        return;
      }
      if (text && containsBadWord(text)) {
        bot.sendMessage(chatId, "🚫 Pesan mengandung kata kasar.");
        return;
      }

      // Forward pesan (text, photo, video)
      if (msg.text) {
        bot.forwardMessage(partner.partnerId, chatId, msg.message_id).catch(() => stopChat(chatId));
      } else if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        bot.sendPhoto(partner.partnerId, photo.file_id, { caption: caption || '' }).catch(() => stopChat(chatId));
      } else if (msg.video) {
        bot.sendVideo(partner.partnerId, msg.video.file_id, { caption: caption || '' }).catch(() => stopChat(chatId));
      }
    } else if (!waitingQueue.some(u => u.chatId === chatId)) {
      bot.sendMessage(chatId, "Tekan '🔍 Cari Partner' untuk mulai.", mainButtons);
    }
  }
});

// =============== Save on Exit ===============
process.on('SIGINT', () => {
  saveAllData();
  console.log('💾 Data disimpan. Bot berhenti.');
  process.exit();
});

console.log('🚀 Anonymous Chat Bot siap! Dibuat oleh: raihan_official0307 💙');

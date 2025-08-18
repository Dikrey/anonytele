## 🤖 Anonymous Chat Bot

> 🔐 *Chat anonim acak dengan siapa saja — tanpa identitas, hanya obrolan!*  
> 💬 Dibuat dengan `node-telegram-bot-api` | 🔥 Hosted on Render | 🚀 by [@raihan_official0307](https://t.me/raihan_official0307)

---

## 🎯 Fitur Utama

| Fitur | Deskripsi |
|------|-----------|
| 🔍 **Cari Partner Acak** | Terhubung dengan user lain secara acak dan anonim |
| 🎭 **Anonim 100%** | Tidak ada nama, tidak ada username — hanya obrolan |
| 👦👧 **Pilih Gender** | Pilih gender kamu: laki-laki atau perempuan |
| 🎯 **Cari Lawan Jenis** | Opsi khusus untuk cari partner beda gender |
| ⏭️ **Skip Partner** | Tidak cocok? Skip dan cari yang baru! |
| 🛑 **Berhenti Aman** | Hentikan sesi kapan saja |
| 🚨 **Laporkan Spam** | Laporkan user toxic, admin akan tindak lanjuti |
| 🛡️ **Auto-Ban 3x Report** | User dilaporkan 3x dalam 1 jam → otomatis diblokir |
| 🔇 **Mute Sementara** | Admin bisa mute user bermasalah |
| 📊 **Statistik Pribadi** | Cek durasi & jumlah sesi kamu dengan `/stats` |
| 📢 **Broadcast Admin** | Kirim pesan ke semua user aktif |
| 💾 **Data Lokal** | Blokir & mute tersimpan otomatis (tanpa database) |

---

## 🖼️ Preview Bot

```
✨ Welcome to Anonymous Chat!

🔍 Chat acak anonim  
👦👧 Pilih gender  
⏭️ Bisa skip  
🚨 Bisa laporkan  
🔐 Auto-save blokir  

👤 Created by: @raihan_official0307 💙
```

---

## ⚙️ Teknologi yang Digunakan

- ![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-green?logo=nodedotjs)
- ![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?logo=telegram&logoColor=white)
- ![Render](https://img.shields.io/badge/Render-%2347E685.svg?logo=render&logoColor=white)
- ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
- ![Git](https://img.shields.io/badge/Git-F05032?logo=git&logoColor=white)

---

## 🚀 Cara Menjalankan Bot (Developer)

### 1. Clone repo
```bash
git clone https://github.com/Dikrey/anonytele.git
cd anonytele
```

### 2. Install dependensi
```bash
npm install
```

### 3. Buat file `.env`
```env
TOKEN=123456789:ABCdefGHIjklMNopQRS-tuvwxyz123456789
ADMIN_IDS=123456789
ADMIN_USERNAME=raihan_official0307
```

### 4. Jalankan bot
```bash
node index.js
```

---

## ☁️ Hosting (Gratis)
✅ Bot ini sudah siap deploy
> 💡 Cukup upload ke GitHub, terus connect ke Render — auto-deploy!

---

## 🛠️ Mode Admin

Akses dengan `/admin` (hanya untuk owner):

| Fitur Admin | Deskripsi |
|------------|----------|
| 👥 Lihat Online | Cek jumlah user aktif |
| 📋 Laporan | Lihat & proses laporan user |
| 🕵️ Detail User | Cek status user via ID |
| 📢 Broadcast | Kirim pesan ke semua user |
| 🚫 Daftar Blokir | Unblock user langsung dari tombol |
| 🔇 Daftar Mute | Cek & unmute user |

---

## 📂 Struktur File
```
anonytele/
├── index.js          → Bot utama
├── package.json      → Dependensi
├── .env              → Konfigurasi rahasia
├── .gitignore        → Sembunyikan file sensitif
├── blocked.json      → Daftar user diblokir
├── muted.json        → Daftar user dimute
└── README.md         → Kamu di sini! 😄
```

---

## 📌 Catatan Keamanan
- 🔐 Token tidak pernah disimpan di kode
- 🧯 Auto-ban untuk cegah spam
- 📁 Data lokal aman dengan `blocked.json` & `muted.json`

---

## 🤝 Kontribusi
Kamu ingin tambah fitur?  
Buka issue atau pull request!  
Kita bangun bersama bot yang lebih keren! 💡

---

## 💌 Dibuat Dengan Cinta
> Oleh **@raihan_official0307** 💙  
> Untuk kamu yang ingin ngobrol bebas tanpa beban.

🚀 *"Obrolan sejati dimulai saat identitas menghilang."*

```

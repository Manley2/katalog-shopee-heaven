// Gateway WhatsApp (jalan di laptop). Memakai pipeline chatbot & data yang sama dengan website.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { reply, knowledge } = require("../lib/chat");

const histories = new Map(); // nomor pengirim -> riwayat percakapan
const MAX_HISTORY = 8;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: require("path").join(__dirname, "../.wwebjs_auth") }),
  puppeteer: {
    headless: true,
    protocolTimeout: 300000, // sabar menunggu hingga 5 menit bila internet lambat (bawaan hanya 3 menit)
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
  }
});

client.on("qr", qr => {
  console.log("\nScan QR ini: WhatsApp > Perangkat tertaut > Tautkan perangkat\n");
  qrcode.generate(qr, { small: true });
});
client.on("authenticated", () => console.log("[WA] Terautentikasi"));
client.on("auth_failure", m => console.error("[WA] Autentikasi gagal:", m));
client.on("ready", () => console.log(`[WA] Bot siap digunakan untuk lapak "${knowledge.toko.nama}"`));
client.on("disconnected", r => console.warn("[WA] Terputus:", r));

client.on("message", async msg => {
  if (msg.fromMe || msg.isStatus || msg.from.endsWith("@g.us") || msg.type !== "chat") return;
  const text = (msg.body || "").trim();
  if (!text) return;

  const history = histories.get(msg.from) || [];
  try {
    // Indikator "sedang mengetik" hanya pemanis; kalau gagal, jangan sampai membatalkan balasan
    try { const chat = await msg.getChat(); await chat.sendStateTyping(); } catch (_) {}
    const out = await reply(text, history, "whatsapp");
    history.push({ role: "user", content: text }, { role: "assistant", content: out.text });
    histories.set(msg.from, history.slice(-MAX_HISTORY));
    await msg.reply(out.text);
    console.log(`[WA] ${msg.from} (${out.source}): ${text.slice(0, 60)}`);
  } catch (e) {
    console.error("[WA] Gagal membalas:", e && e.stack ? e.stack : e);
    await msg.reply("Maaf, terjadi gangguan. Silakan coba lagi sebentar lagi.");
  }
});

// Mulai dengan percobaan ulang otomatis bila WhatsApp Web lambat dibuka (timeout)
async function start(attempt = 1) {
  try {
    console.log(`[WA] Membuka WhatsApp Web (percobaan ${attempt}/3)... bisa memakan waktu 1-3 menit`);
    await client.initialize();
  } catch (e) {
    console.error(`[WA] Gagal memulai: ${e && e.message ? e.message : e}`);
    try { await client.destroy(); } catch (_) {}
    if (attempt < 3) {
      console.log("[WA] Mencoba lagi dalam 10 detik...");
      setTimeout(() => start(attempt + 1), 10000);
    } else {
      console.error("[WA] Gagal 3 kali. Periksa internet, tutup proses Chromium yang menggantung, lalu jalankan ulang: npm run wa");
    }
  }
}
start();

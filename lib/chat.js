const fs = require("fs");
const path = require("path");
const RAGEngine = require("./rag");

const knowledge = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/knowledge.json"), "utf-8"));
const rag = new RAGEngine();
let groqClient = null;

function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) {
    const Groq = require("groq-sdk");
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

// Lapisan 1: FAQ lewat kata kunci (tanpa AI)
function matchFAQ(message) {
  const q = " " + message.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ") + " ";
  for (const [kw, key] of Object.entries(knowledge.keywords || {})) {
    if (q.includes(" " + kw + " ")) return knowledge.responses[key] || null;
  }
  return null;
}

function systemPrompt(context, channel) {
  const t = knowledge.toko;
  return [
    `Kamu adalah asisten penjualan resmi untuk lapak Shopee "${t.nama}". Jawab dalam Bahasa Indonesia yang ramah, singkat, dan jelas.`,
    "ATURAN:",
    "1. Jawab HANYA berdasarkan data produk di bagian DATA di bawah. Jangan mengarang produk, harga, stok, atau spesifikasi.",
    "2. Jika produk atau informasi yang ditanyakan tidak ada di DATA, katakan terus terang bahwa datanya tidak tersedia, lalu sarankan cek lapak Shopee atau hubungi admin.",
    "3. Tulis harga dalam format Rupiah (contoh: Rp135.000). Sebut nama produk persis seperti di DATA.",
    "4. Lapak ini menjual parfum, body mist, pengharum mobil/ruangan, dan aksesori. 'Cowok/cewek' berarti pria/wanita. Jangan menyebut nama aroma, notes, atau komposisi kecuali tertulis di DATA.",
    "5. Untuk pertanyaan lanjutan seperti 'berapa harganya?', gunakan riwayat percakapan untuk tahu produk yang dimaksud.",
    "6. Jika ada link produk di DATA dan pembeli ingin membeli, sertakan link itu.",
    channel === "whatsapp"
      ? "7. Format WhatsApp: tebal pakai satu bintang (*teks*), jangan pakai tabel atau heading markdown."
      : "7. Boleh memakai **tebal** dan daftar bertanda '-' seperlunya. Jangan pakai tabel.",
    "",
    `Lapak: ${t.nama} - ${t.tagline}`,
    `Link Shopee: ${t.shopee}`,
    "",
    "DATA:",
    context || "(Tidak ada produk yang cocok dengan pertanyaan ini.)"
  ].join("\n");
}

function clean(text, channel) {
  text = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^#{1,6}\s*/gm, "")
    .trim();
  if (channel === "whatsapp") text = text.replace(/\*\*(.+?)\*\*/g, "*$1*");
  return text;
}

async function askLLM(message, history, context, channel) {
  const groq = getGroq();
  if (!groq) throw new Error("GROQ_API_KEY belum diisi");

  const messages = [
    { role: "system", content: systemPrompt(context, channel) },
    ...history.slice(-8),
    { role: "user", content: message }
  ];
  const models = [process.env.GROQ_MODEL || "qwen/qwen3.8-27b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];

  let lastErr;
  for (const model of [...new Set(models)]) {
    try {
      const res = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0.3,
        max_tokens: Number(process.env.GROQ_MAX_TOKENS || 800)
      });
      const out = clean(res.choices?.[0]?.message?.content, channel);
      if (out) return out;
    } catch (e) {
      lastErr = e;
      console.warn(`[Groq ${model}] gagal: ${e.message}. Mencoba model berikutnya...`);
    }
  }
  throw lastErr || new Error("Semua model Groq gagal");
}

// Pertanyaan lanjutan ("berapa harganya?", "stoknya ada?") dicari bersama pertanyaan user sebelumnya.
// Pertanyaan yang sudah menyebut produk/kategori sendiri ("ada parfum wanita apa saja?") TIDAK digabung,
// supaya topik lama tidak mencemari hasil pencarian.
const FOLLOWUP = /\b(itu|tersebut|tadi|ini|\w+nya|stok|link|harga|warna|varian|beli|pesan|ready)\b/;
function buildRetrievalQuery(message, history) {
  const prevUser = [...history].reverse().find(h => h.role === "user");
  const low = message.toLowerCase();
  if (prevUser && !rag.hasKeywordMatch(message) && FOLLOWUP.test(low)) return prevUser.content + " " + message;
  return message;
}

/**
 * Pipeline chatbot (dipakai website dan gateway WhatsApp):
 * sapaan/terima kasih -> FAQ -> RAG + Groq LLM -> cadangan dari data.
 * history: [{role:"user"|"assistant", content}]
 */
async function reply(message, history = [], channel = "web") {
  message = String(message || "").trim().slice(0, 500);
  if (!message) return { text: "Silakan ketik pertanyaanmu ya.", source: "template" };
  const t = knowledge.toko;

  if (rag.isGreeting(message))
    return { text: `Halo! Selamat datang di ${t.nama}. Ada yang bisa dibantu? Tanyakan parfum, harga, atau cara pesan.`, source: "template" };
  if (rag.isThanks(message))
    return { text: "Sama-sama! Kalau ada pertanyaan lain, tinggal tanya ya.", source: "template" };

  const faq = matchFAQ(message);
  if (faq) return { text: faq, source: "faq" };

  const retrievalQuery = buildRetrievalQuery(message, history);
  const context = rag.buildContext(retrievalQuery);

  try {
    return { text: await askLLM(message, history, context, channel), source: "llm" };
  } catch (e) {
    console.error("[Chat] LLM tidak tersedia:", e.message);
    const fb = rag.fallbackAnswer(retrievalQuery);
    return {
      text: fb || `Maaf, saya belum menemukan produk itu di katalog. Silakan cek lapak kami: ${t.shopee}`,
      source: "fallback"
    };
  }
}

module.exports = { reply, rag, knowledge, buildRetrievalQuery };

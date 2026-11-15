const fs = require("fs");
const path = require("path");
const { parseCSV } = require("./csv");
const { isRaw, normalize } = require("./normalize");

const STOP = new Set(("yang dan di ke dari untuk dengan atau ini itu ada apa apakah berapa bisa bisakah saya aku kak kakak min admin " +
  "mau minta tolong dong ya sih nya lah kah pun juga lagi aja saja deh dulu harga harganya produk produknya jual dijual " +
  "berapaan gimana bagaimana kalau kalo tidak nggak gak ga yg dgn utk tapi apa aja").split(/\s+/));

// Bahasa sehari-hari -> istilah yang dipakai di nama produk (katalog parfum)
const SINONIM = [
  [/\b(cowok|cowo|laki ?laki|lelaki|men|man|male)\b/g, "pria"],
  [/\b(cewek|cewe|perempuan|putri|women|woman|female|ladies|lady)\b/g, "wanita"],
  [/\b(perfume|parfume|minyak wangi)\b/g, "parfum"],
  [/\b(unisex|netral|pria wanita|cowok cewek)\b/g, "unisex"],
  [/\b(freshener|pewangi mobil|parfum mobil|wangi mobil)\b/g, "pengharum mobil"],
  [/\b(pewangi ruangan|parfum ruangan|wangi ruangan|aromaterapi)\b/g, "pengharum ruangan"]
];
const expand = s => SINONIM.reduce((t, [re, to]) => t.replace(re, to), s);

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9\s.]/g, " ").replace(/\s+/g, " ").trim();

function parseMoney(str) {
  // contoh: "100rb", "100 ribu", "100.000", "1,5jt", "2 juta", "75k"
  const m = String(str).toLowerCase().match(/(\d+(?:[.,]\d+)*)\s*(rb|ribu|k|jt|juta)?/);
  if (!m) return null;
  let raw = m[1];
  const unit = m[2];
  if (unit) {
    const n = parseFloat(raw.replace(",", "."));
    return Math.round(n * (/jt|juta/.test(unit) ? 1e6 : 1e3));
  }
  raw = raw.replace(/[.,](?=\d{3}\b)/g, "");
  const n = parseFloat(raw.replace(",", "."));
  return isNaN(n) ? null : n;
}

class RAGEngine {
  constructor(csvPath, options = {}) {
    this.csvPath = csvPath || path.join(__dirname, "../data/products.csv");
    this.topK = options.topK || Number(process.env.RAG_TOP_K || 8);
    this.products = [];
    this.load();
  }

  load() {
    try {
      const rows = parseCSV(fs.readFileSync(this.csvPath, "utf-8"));
      if (isRaw(rows)) {
        // CSV mentah dari Instant Data Scraper: dibersihkan otomatis. Kategori opsional lewat data/kategori.json
        let kategoriMap = null;
        const kp = path.join(path.dirname(this.csvPath), "kategori.json");
        if (fs.existsSync(kp)) kategoriMap = JSON.parse(fs.readFileSync(kp, "utf-8"));
        this.products = normalize(rows, kategoriMap);
        console.log(`[RAG] CSV mentah dikenali dan dibersihkan: ${rows.length} baris -> ${this.products.length} produk`);
      } else {
        this.products = rows.map(r => ({
          ...r,
          harga: Number(String(r.harga).replace(/[^\d.]/g, "")) || 0,
          stok: r.stok === "" ? null : Number(r.stok),
          terjual: r.terjual === "" ? null : Number(r.terjual),
          rating: r.rating === "" ? null : Number(r.rating)
        }));
      }
      this.categories = [...new Set(this.products.map(p => p.kategori).filter(Boolean))];
      console.log(`[RAG] ${this.products.length} produk dimuat, ${this.categories.length} kategori`);
    } catch (e) {
      console.error("[RAG] Gagal memuat CSV:", e.message);
      this.products = [];
      this.categories = [];
    }
  }

  rupiah(n) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }

  isGreeting(q) {
    q = norm(q);
    return /^(halo|hai|hi|hey|hello|p|ping|test|tes|pagi|siang|sore|malam|permisi|assalamualaikum|assalamu alaikum|selamat (pagi|siang|sore|malam))( kak| min| admin| kakak| gan| sis)?$/.test(q);
  }

  isThanks(q) {
    return /\b(terima ?kasih|makasih|thanks|thank you|thx|tengkyu)\b/.test(norm(q));
  }

  tokens(q) {
    return norm(q).split(" ").filter(t => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));
  }

  /** Cari produk relevan. Mengembalikan array produk (maks topK). */
  search(query, k = this.topK) {
    if (!query || !this.products.length) return [];
    const q = expand(norm(query));
    if (this.isGreeting(q)) return [];

    let list = this.products;

    // Filter harga: "di bawah 100rb", "maksimal 50 ribu", "di atas 1jt"
    const below = q.match(/(?:di ?bawah|kurang dari|maks(?:imal)?|max|murah dari|budget)\s*(?:rp\.?\s*)?(\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)?)/);
    const above = q.match(/(?:di ?atas|lebih dari|min(?:imal)?)\s*(?:rp\.?\s*)?(\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)?)/);
    let priceFiltered = false;
    if (below) { const v = parseMoney(below[1]); if (v) { list = list.filter(p => p.harga <= v); priceFiltered = true; } }
    if (above) { const v = parseMoney(above[1]); if (v) { list = list.filter(p => p.harga >= v); priceFiltered = true; } }

    // Filter kategori (nama kategori disebut di pertanyaan)
    // Cocokkan nama kategori utuh dulu ("parfum wanita"), baru kata uniknya ("wanita", "mobil")
    const cat = this.categories.find(c => q.includes(norm(c))) ||
      this.categories.find(c => norm(c).split(" ").some(w => w.length > 3 && !this.isCommonWord(w) && new RegExp(`\\b${w}\\b`).test(q)));
    const catList = cat ? list.filter(p => p.kategori === cat) : list;

    // Skor berdasarkan kata kunci
    const toks = this.tokens(q);
    const score = p => {
      let s = 0;
      const nama = norm(p.nama), kat = norm(p.kategori), desk = norm(p.deskripsi);
      for (const t of toks) {
        if (nama.includes(t)) s += 8;
        if (kat.includes(t)) s += 5;
        if (desk.includes(t)) s += 3;
      }
      return s;
    };

    let result = catList.map(p => ({ p, s: score(p) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.p);
    if (!result.length && cat) result = catList;
    if (!result.length && priceFiltered) result = list;

    // Maksud khusus: termurah, termahal, terlaris, rating tertinggi, semua produk
    const base = result.length ? result : (cat || priceFiltered ? catList : this.products);
    if (/\b(termurah|paling murah|murah)\b/.test(q)) return [...base].sort((a, b) => a.harga - b.harga).slice(0, k);
    if (/\b(termahal|paling mahal|mahal)\b/.test(q)) return [...base].sort((a, b) => b.harga - a.harga).slice(0, k);
    if (/\b(terlaris|paling laris|laris|best ?seller|populer|favorit|paling banyak dibeli)\b/.test(q))
      return [...base].sort((a, b) => (b.terjual || 0) - (a.terjual || 0)).slice(0, k);
    if (/\b(rating|bintang|terbaik|paling bagus)\b/.test(q))
      return [...base].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, k);
    if (/\b(semua|katalog|daftar|list|koleksi|apa aja|apa saja)\b/.test(q) && !result.length) return this.products;

    return result.slice(0, k);
  }

  /** Apakah ada kata kunci pertanyaan yang benar-benar muncul di nama/kategori/deskripsi produk? */
  hasKeywordMatch(query) {
    const toks = this.tokens(expand(norm(query)));
    if (!toks.length) return false;
    const corpus = this.products.map(p => norm(`${p.nama} ${p.kategori} ${p.deskripsi}`));
    return toks.some(t => corpus.some(c => c.includes(t)));
  }

  isCommonWord(w) { return ["parfum", "pengharum", "produk", "paket", "kopi"].includes(w); }

  /** Susun teks konteks untuk prompt LLM. */
  buildContext(query) {
    const found = this.search(query);
    if (!found.length) return "";
    const lines = found.map(p => {
      const parts = [`• ${p.nama} [${p.kategori}]`, `Harga: ${this.rupiah(p.harga)}`];
      if (p.stok != null) parts.push(`Stok: ${p.stok}`);
      if (p.terjual != null) parts.push(`Terjual: ${p.terjual}`);
      if (p.rating != null) parts.push(`Rating: ${p.rating}/5`);
      let s = parts.join(" | ");
      if (p.deskripsi) s += `\n  Deskripsi: ${p.deskripsi.slice(0, 300)}`;
      if (p.link) s += `\n  Link: ${p.link}`;
      return s;
    });
    return "Data produk dari lapak (hasil scraping Shopee):\n" + lines.join("\n");
  }

  /** Jawaban langsung dari data tanpa LLM (cadangan bila Groq tidak tersedia). */
  fallbackAnswer(query) {
    const found = this.search(query, 5);
    if (!found.length) return "";
    return "Berikut produk yang sesuai:\n" + found.map(p => `• *${p.nama}* - ${this.rupiah(p.harga)}${p.stok != null ? ` (stok ${p.stok})` : ""}`).join("\n");
  }
}

module.exports = RAGEngine;

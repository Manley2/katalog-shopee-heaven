// Mengubah CSV mentah hasil Instant Data Scraper (kolom bernama acak seperti "L4HcCc", "contents href", dst.)
// menjadi daftar produk bersih. Kolom dikenali dari ISI selnya, bukan dari nama kolom.
const URL_PRODUK = /shopee\.co\.id\/.*(-i\.\d+\.\d+|\/product\/\d+\/\d+|\/\d+\/\d+)/i;
const URL_GAMBAR = /^https?:\/\/\S+(susercontent|\.jpe?g|\.png|\.webp)/i;
const PREFIX = /^(star\+?|mall|lokal|ori|COD)\s+/i;
const SAMPAH = /^(star\+?|mall|lokal|ori|cod|gratis ongkir|ongkir|xtra|ad|iklan|promo|terlaris|hot|baru|cek lokal|lihat serupa|beli|\+?\s*terjual)$/i;

const isRaw = rows => rows.length > 0 && !("nama" in rows[0] && "harga" in rows[0]);

function parseSold(cell) {
  const m = String(cell).match(/(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?\s*\+?\s*terjual/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(",", "."));
  if (/rb|ribu|k/i.test(m[2] || "")) n *= 1000;
  if (/jt|juta/i.test(m[2] || "")) n *= 1e6;
  return Math.round(n);
}

function hargaDari(cells) {
  const nilai = [];
  for (const c of cells) {
    for (const m of String(c).matchAll(/Rp\s?(\d[\d.]*)/gi)) {
      const n = Number(m[1].replace(/\./g, ""));
      if (n > 0) nilai.push(n);
    }
  }
  if (!nilai.length) {
    // Instant Data Scraper sering memisahkan "Rp" dari angkanya: sel hanya berisi "23.700" atau "120.000"
    for (const c of cells) {
      const m = String(c).match(/^(?:Rp\s?)?(\d{1,3}(?:\.\d{3})+)$/i);
      if (m) { const n = Number(m[1].replace(/\./g, "")); if (n >= 500) nilai.push(n); }
    }
  }
  return nilai.length ? Math.min(...nilai) : 0; // bila ada harga coret, harga jual = yang terendah
}

function namaDariSlug(url) {
  const m = String(url).match(/shopee\.co\.id\/([^/?#]+?)-i\.\d+\.\d+/i);
  return m ? decodeURIComponent(m[1]).replace(/-/g, " ").trim() : "";
}

function normalize(rows, kategoriMap = null) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const cells = Object.values(row).map(v => String(v || "").trim()).filter(Boolean);
    const link = (cells.find(c => URL_PRODUK.test(c)) || "").split("?")[0]; // buang ?extraParams=... agar link bersih
    const gambar = cells.find(c => URL_GAMBAR.test(c) && !URL_PRODUK.test(c)) || "";
    const harga = hargaDari(cells);

    let terjual = null, rating = null, diskon = null;
    for (const c of cells) {
      const s = parseSold(c); if (s != null && terjual == null) terjual = s;
      if (rating == null && !/Rp\s?\d/i.test(c)) {
        const r = c.match(/(?:^|[\s|·★])([1-5]\.\d)(?=$|[\s|·])/) || c.match(/^([1-5])$/);
        if (r) rating = Number(r[1]);
      }
      const d = c.match(/-(\d{1,3})%/); if (d && diskon == null) diskon = Number(d[1]);
    }

    // Nama = sel teks terpanjang yang bukan link, gambar, harga, terjual, atau label sampah
    const teks = cells
      .filter(c => !/^https?:\/\//i.test(c) && !/Rp\s?\d/i.test(c) && parseSold(c) == null && !/^-?\d+(\.\d+)?%?$/.test(c))
      .map(c => c.replace(PREFIX, "").trim())
      .filter(c => c.length >= 6 && !SAMPAH.test(c));
    let nama = teks.sort((a, b) => b.length - a.length)[0] || "";
    const namaMentah = nama;
    // Judul di halaman listing sering terpotong ("..."): ambil versi lengkap dari slug URL produk
    if ((/(\.\.\.|…)\s*$/.test(nama) || !nama) && link) nama = namaDariSlug(link) || nama.replace(/(\.\.\.|…)\s*$/, "");
    if (!nama || harga <= 0) continue;

    const key = link || nama.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const promo = teks.filter(t => t !== namaMentah && !/(\.\.\.|…)\s*$/.test(t) && t.length < 60);
    const deskripsi = [diskon ? `Diskon ${diskon}%` : "", ...new Set(promo)].filter(Boolean).join(". ");

    let kategori = "Produk";
    if (kategoriMap) {
      const low = nama.toLowerCase();
      for (const [kat, kws] of Object.entries(kategoriMap)) if (kws.some(k => low.includes(k.toLowerCase()))) { kategori = kat; break; }
    }
    out.push({ nama, kategori, harga, stok: null, terjual, rating, deskripsi, link, gambar });
  }
  return out;
}

module.exports = { isRaw, normalize, parseSold, namaDariSlug };

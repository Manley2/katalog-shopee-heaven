// Mengubah hasil scraping Shopee (JSON) menjadi data/products.csv
// Pemakaian:  node scripts/import-shopee.js hasil-scraping.json [--shopee-raw]
//   --shopee-raw : harga dari API Shopee (satuan 1/100000 rupiah) dibagi 100000
const fs = require("fs");
const path = require("path");
const { toCSV } = require("../lib/csv");

const file = process.argv[2];
const rawPrice = process.argv.includes("--shopee-raw");
if (!file) { console.error("Pemakaian: node scripts/import-shopee.js hasil-scraping.json [--shopee-raw]"); process.exit(1); }

let data = JSON.parse(fs.readFileSync(file, "utf-8"));
if (!Array.isArray(data)) data = data.items || data.products || data.data || [];

// Nama kolom hasil scraping bisa berbeda-beda; daftar ini dicoba berurutan.
const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== "") return o[k]; return ""; };
const num = v => Number(String(v).replace(/[^\d.]/g, "")) || 0;

const rows = data.map(o => {
  let harga = num(pick(o, ["harga", "price", "price_min", "current_price"]));
  if (rawPrice) harga = Math.round(harga / 100000);
  const rating = pick(o, ["rating", "item_rating", "rating_star"]);
  const itemid = pick(o, ["itemid", "item_id"]), shopid = pick(o, ["shopid", "shop_id"]);
  return {
    nama: String(pick(o, ["nama", "name", "title"])).replace(/\s+/g, " ").trim(),
    kategori: pick(o, ["kategori", "category", "category_name"]) || "Lainnya",
    harga,
    stok: pick(o, ["stok", "stock"]),
    terjual: pick(o, ["terjual", "sold", "historical_sold"]),
    rating: typeof rating === "object" ? Number(rating.rating_star || 0).toFixed(1) : (rating ? Number(rating).toFixed(1) : ""),
    deskripsi: String(pick(o, ["deskripsi", "description"])).replace(/\s+/g, " ").trim().slice(0, 400),
    link: pick(o, ["link", "url"]) || (itemid && shopid ? `https://shopee.co.id/product/${shopid}/${itemid}` : ""),
    gambar: pick(o, ["gambar", "image", "image_url"])
  };
}).filter(r => r.nama && r.harga > 0);

const headers = ["nama", "kategori", "harga", "stok", "terjual", "rating", "deskripsi", "link", "gambar"];
fs.writeFileSync(path.join(__dirname, "../data/products.csv"), toCSV(rows, headers));
console.log(`${rows.length} produk ditulis ke data/products.csv. Jalankan: npm run build-data`);

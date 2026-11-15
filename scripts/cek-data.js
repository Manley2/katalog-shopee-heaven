// Menampilkan hasil pembacaan data/products.csv (baik CSV bersih maupun CSV mentah Instant Data Scraper)
// Jalankan: npm run cek
const RAGEngine = require("../lib/rag");
const rag = new RAGEngine();
console.log("");
console.table(rag.products.map((p, i) => ({
  no: i + 1,
  nama: p.nama.slice(0, 45),
  kategori: p.kategori,
  harga: p.harga,
  terjual: p.terjual,
  rating: p.rating,
  link: p.link ? "ada" : "KOSONG"
})));
const tanpaLink = rag.products.filter(p => !p.link).length;
console.log(`Total ${rag.products.length} produk. Tanpa link produk: ${tanpaLink}.`);
if (rag.products.length < 20) console.log("PERINGATAN: modul meminta minimal puluhan produk.");
if (tanpaLink) console.log("PERINGATAN: kolom 'contents href' (link produk) wajib ada untuk laporan.");

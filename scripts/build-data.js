// Membuat public/data.json (dipakai website) dari data/products.csv + data/knowledge.json
const fs = require("fs");
const path = require("path");
const RAGEngine = require("../lib/rag");

const root = path.join(__dirname, "..");
const knowledge = JSON.parse(fs.readFileSync(path.join(root, "data/knowledge.json"), "utf-8"));
const rag = new RAGEngine(path.join(root, "data/products.csv"));

const out = { toko: knowledge.toko, kategori: rag.categories, produk: rag.products };
fs.writeFileSync(path.join(root, "public/data.json"), JSON.stringify(out, null, 2));
console.log(`public/data.json dibuat: ${out.produk.length} produk`);

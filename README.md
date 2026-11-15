# Katalog Lapak Shopee + Chatbot RAG + Gateway WhatsApp

```
data/products.csv      <- CSV hasil scraping (taruh di sini)
data/knowledge.json    <- info toko, FAQ, link Shopee, nomor WA (GANTI)
data/kategori.json     <- (opsional) pengelompokan kategori, lihat di bawah
lib/                   <- mesin RAG + pipeline chatbot (dipakai web & WA)
api/chat.js            <- endpoint Vercel (API key Groq aman di server)
public/                <- website
gateway/wa.js          <- bot WhatsApp (jalan di laptop)
```

Alur chatbot: sapaan/terima kasih (template) -> FAQ -> RAG ambil produk relevan -> Groq LLM menjawab. Bila Groq gagal, bot menjawab langsung dari data.

## 1. Scraping (sesuai Modul Scraping Data Shopee)
1. Pasang ekstensi **Instant Data Scraper** di Chrome, buka halaman **produk lapak** di Shopee.
2. Klik ikon ekstensi, **Try another table** sampai tabel berisi nama produk dan harga, pastikan kolom **`contents href`** ada.
3. **Locate "Next" button**, klik tombol `>` di Shopee, lalu **Start crawling** sampai selesai (target: puluhan produk).
4. Klik **CSV**, simpan file hasilnya sebagai **`data/products.csv`** (timpa file lama). **Tidak perlu diedit.**

Proyek ini mengenali CSV mentah itu otomatis: kolom dikenali dari isinya, judul yang terpotong ("...") dilengkapi dari URL produk, baris sampah dibuang, dan baris ganda digabung.

Cek hasilnya: `npm run cek` (menampilkan tabel produk hasil baca, dan memperingatkan bila produk kurang dari 20 atau link produk kosong).

**Kategori (opsional):** halaman lapak tidak memuat kategori, jadi semua produk awalnya berkategori "Produk". Untuk membuat filter kategori di website, buat `data/kategori.json` berisi kata kunci per kategori, contoh:
```json
{ "Pensil Alis": ["pencil"], "Krim Alis": ["eyebrow cream"], "Spons Makeup": ["sponge"] }
```
Produk yang namanya memuat salah satu kata kunci masuk ke kategori itu.

## 2. Isi info toko
Edit `data/knowledge.json`: `toko.nama`, `toko.tagline`, `toko.deskripsi`, `toko.shopee` (link halaman lapak), `toko.whatsapp` (format 62812...), dan jawaban FAQ.
Lalu jalankan `npm run build-data` (membuat `public/data.json` untuk website).

## 3. Jalankan lokal
```bash
npm install
cp .env.example .env     # isi GROQ_API_KEY
npm run dev              # http://localhost:3000
```
Setiap mengganti data: `npm run build-data`, restart `npm run dev`, lalu `Ctrl + F5` di browser.

## 4. Deploy ke Vercel
1. Upload folder proyek ke repository GitHub (`.env` tidak ikut, sudah di `.gitignore`).
2. vercel.com > Add New Project > Import repository.
3. Sebelum Deploy, buka **Environment Variables**, tambahkan `GROQ_API_KEY` (opsional `GROQ_MODEL`).
4. Deploy, buka URL publik, tes chatbot.

## 5. Gateway WhatsApp (di laptop)
```bash
npm run wa
```
Scan QR (nomor cadangan), tunggu `Bot siap digunakan`, tes dari nomor lain. Biarkan terminal terbuka saat penilaian.

## Bahan laporan
- Link Vercel dan link lapak Shopee
- Kolom `contents href` / link produk dari CSV (bukti scraping)
- Screenshot: website, chatbot web, QR/terminal bot siap, percakapan WhatsApp

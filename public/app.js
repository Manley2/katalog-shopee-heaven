(() => {
  const $ = id => document.getElementById(id);
  const rupiah = n => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let DATA = { toko: {}, kategori: [], produk: [] };
  let state = { cat: "Semua", q: "", sort: "default" };

  // Link WhatsApp dengan template pesan sesuai kategori / produk
  function waLink(text) {
    return `https://wa.me/${DATA.toko.whatsapp}?text=${encodeURIComponent(text)}`;
  }
  function waTemplate(p) {
    return `Halo ${DATA.toko.nama}, saya tertarik dengan produk kategori ${p.kategori}: *${p.nama}* (${rupiah(p.harga)}). Apakah masih tersedia?`;
  }

  function hue(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

  function card(p) {
    const h = hue(p.kategori);
    const thumb = p.gambar
      ? `<img src="${esc(p.gambar)}" alt="${esc(p.nama)}" loading="lazy">`
      : esc(p.nama.trim().charAt(0).toUpperCase());
    const meta = [
      p.rating != null ? `★ ${p.rating}` : null,
      p.terjual != null ? `${p.terjual.toLocaleString("id-ID")} terjual` : null,
      p.stok != null ? `stok ${p.stok}` : null
    ].filter(Boolean).join(" · ");
    return `<article class="card">
      <div class="thumb" style="--c1:hsl(${h} 45% 42%);--c2:hsl(${(h + 40) % 360} 50% 32%)">${thumb}</div>
      <div class="card-b">
        <span class="cat">${esc(p.kategori)}</span>
        <h3>${esc(p.nama)}</h3>
        <div class="price">${rupiah(p.harga)}</div>
        <div class="meta">${esc(meta)}</div>
        <p class="desc">${esc((p.deskripsi || "").slice(0, 110))}${(p.deskripsi || "").length > 110 ? "…" : ""}</p>
        <div class="card-a">
          ${(p.link || DATA.toko.shopee) ? `<a class="btn btn-shopee" href="${esc(p.link || DATA.toko.shopee)}" target="_blank" rel="noopener">Beli di Shopee</a>` : ""}
          <a class="btn btn-wa" href="${waLink(waTemplate(p))}" target="_blank" rel="noopener">Tanya via WA</a>
        </div>
      </div>
    </article>`;
  }

  function render() {
    let list = DATA.produk.filter(p =>
      (state.cat === "Semua" || p.kategori === state.cat) &&
      (!state.q || `${p.nama} ${p.kategori} ${p.deskripsi}`.toLowerCase().includes(state.q))
    );
    if (state.sort === "murah") list.sort((a, b) => a.harga - b.harga);
    if (state.sort === "mahal") list.sort((a, b) => b.harga - a.harga);
    if (state.sort === "laris") list.sort((a, b) => (b.terjual || 0) - (a.terjual || 0));
    $("grid").innerHTML = list.map(card).join("");
    $("empty").hidden = list.length > 0;
  }

  function renderChips() {
    const cats = ["Semua", ...DATA.kategori];
    $("chips").innerHTML = cats.map(c => `<button class="chip" role="tab" aria-selected="${c === state.cat}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  }

  // ---------- Chatbot ----------
  const history = [];
  function fmt(text) {
    let h = esc(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$|[.,!?])/g, "$1<strong>$2</strong>")
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return h;
  }
  function addMsg(role, html, raw) {
    const d = document.createElement("div");
    d.className = "m " + (role === "user" ? "user" : "bot");
    d.innerHTML = html;
    $("msgs").appendChild(d);
    $("msgs").scrollTop = $("msgs").scrollHeight;
    return d;
  }
  async function send(text) {
    text = text.trim();
    if (!text) return;
    addMsg("user", esc(text));
    $("suggest").hidden = true;
    const typing = addMsg("bot", '<span class="dots"><span></span><span></span><span></span></span>');
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history.slice(-8) })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal");
      typing.innerHTML = fmt(j.text);
      history.push({ role: "user", content: text }, { role: "assistant", content: j.text });
    } catch (e) {
      typing.textContent = "Maaf, chatbot sedang bermasalah. Coba lagi sebentar ya.";
    }
    $("msgs").scrollTop = $("msgs").scrollHeight;
  }

  function openChat(open) {
    $("chat").hidden = !open;
    $("chatFab").hidden = open;
    if (open) {
      if (!$("msgs").children.length)
        addMsg("bot", fmt(`Halo! Saya asisten ${DATA.toko.nama}. Tanyakan parfum, harga, atau cara pesan.`));
      $("chatInput").focus();
    }
  }

  async function init() {
    const r = await fetch("data.json");
    DATA = await r.json();
    const t = DATA.toko;
    document.title = `${t.nama} | Katalog`;
    $("shopName").textContent = t.nama;
    $("shopTag").textContent = t.tagline || "";
    $("shopDesc").textContent = t.deskripsi || "";
    $("btnShopee").href = t.shopee;
    $("btnWa").href = waLink(`Halo ${t.nama}, saya ingin bertanya tentang produk.`);
    const total = DATA.produk.length;
    $("stats").innerHTML = [`${total} produk`, `${DATA.kategori.length} kategori`,
      `harga mulai ${rupiah(Math.min(...DATA.produk.map(p => p.harga)))}`].map(s => `<li>${s}</li>`).join("");
    renderChips(); render();

    const ex = DATA.kategori.slice(0, 2).map(c => `Ada produk ${c}?`);
    $("suggest").innerHTML = [...ex, "Produk termurah?", "Cara pesan?"].map(s => `<button type="button">${esc(s)}</button>`).join("");
  }

  $("chips").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    state.cat = b.dataset.c; renderChips(); render();
  });
  $("search").addEventListener("input", e => { state.q = e.target.value.toLowerCase().trim(); render(); });
  $("sort").addEventListener("change", e => { state.sort = e.target.value; render(); });
  $("chatFab").addEventListener("click", () => openChat(true));
  $("chatClose").addEventListener("click", () => openChat(false));
  $("chatForm").addEventListener("submit", e => { e.preventDefault(); const v = $("chatInput").value; $("chatInput").value = ""; send(v); });
  $("suggest").addEventListener("click", e => { if (e.target.tagName === "BUTTON") send(e.target.textContent); });

  init().catch(() => { $("shopName").textContent = "Gagal memuat data"; });
})();

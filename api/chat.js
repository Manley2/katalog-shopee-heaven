// Vercel Serverless Function: POST /api/chat
// API key Groq hanya ada di environment variable server (GROQ_API_KEY), tidak pernah dikirim ke browser.
const { reply } = require("../lib/chat");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const message = String(body.message || "").slice(0, 500);
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter(h => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
      .slice(-8)
      .map(h => ({ role: h.role, content: h.content.slice(0, 1000) }));

    if (!message.trim()) return res.status(400).json({ error: "Pesan kosong" });
    const out = await reply(message, history, "web");
    res.status(200).json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Terjadi kesalahan pada server" });
  }
};

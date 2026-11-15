// Server lokal untuk menguji website + /api/chat sebelum deploy ke Vercel.
require("dotenv").config();
const express = require("express");
const path = require("path");
const chatHandler = require("./api/chat");

const app = express();
app.use(express.json());
app.post("/api/chat", chatHandler);
app.all("/api/chat", chatHandler);
app.use(express.static(path.join(__dirname, "public")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Website: http://localhost:${port}`));

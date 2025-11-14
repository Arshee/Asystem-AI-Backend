// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(express.json());

/**
 * ✅ CORS — poprawiona domena frontendu
 * UWAGA: Twoja domena frontendu to:
 * https://asystent-ai-xp0a.onrender.com
 */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://asystent-ai-xp0a.onrender.com" // 👈 poprawiony frontend
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ⚠️ Wymagane dla RENDER – obsługa preflight
app.options("*", cors());

// 🔑 OpenAI konfiguracja
const openai = new OpenAI({
  apiKey: process.env.API_KEY || process.env.OPENAI_API_KEY,
});

// 🔐 PROSTE LOGOWANIE — tokeny przechowywane w pamięci serwera
let activeTokens = new Set();

/**
 * 🔓 LOGIN ENDPOINT
 * Wywoływany w front-endzie podczas logowania
 */
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "tajnehaslo123";

  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString("hex");
    activeTokens.add(token);

    console.log("✅ Zalogowano — token:", token.slice(0, 10) + "...");

    return res.json({
      success: true,
      token,
    });
  }

  console.warn("❌ Nieudane logowanie (błędne hasło)");
  return res.status(401).json({
    success: false,
    message: "Niepoprawne hasło",
  });
});

/**
 * 🛡️ MIDDLEWARE — sprawdzanie tokena
 */
function requireAuth(req, res, next) {
  const token = req.headers["authorization"];

  if (!token || !activeTokens.has(token)) {
    console.warn("🚫 Brak autoryzacji lub token nieprawidłowy");
    return res.status(403).json({ error: "Brak dostępu. Zaloguj się ponownie." });
  }

  next();
}

/**
 * 🤖 GŁÓWNY ENDPOINT AI — wymaga tokena
 */
app.post("/api/ai", requireAuth, async (req, res) => {
  const { prompt } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Zwracaj tylko poprawny JSON bez komentarzy, opisów i dodatkowego tekstu.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 1200,
    });

    let responseText = completion.choices[0]?.message?.content?.trim();

    // 🧹 Automatyczne wyciągnięcie JSON
    const jsonMatch = responseText?.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) responseText = jsonMatch[0];

    return res.json({ response: responseText });
  } catch (err) {
    console.error("❌ Błąd OpenAI:", err);
    return res.status(500).json({ error: "Błąd po stronie serwera AI." });
  }
});

/**
 * 🔍 Endpoint testowy
 */
app.get("/api/test", (req, res) => {
  res.send("✅ Backend AI działa poprawnie!");
});

/**
 * 🌐 Endpoint główny
 */
app.get("/", (req, res) => {
  res.send("🚀 Asystent AI backend działa! Sprawdź /api/test lub /api/login");
});

/**
 * 🚀 Start serwera
 */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server działa na porcie ${PORT}`));

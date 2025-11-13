// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";

dotenv.config();

// 🧪 Debug — pokazuje, czy klucze są widoczne
console.log("🧪 DEBUG: API_KEY present:", !!process.env.API_KEY);
console.log("🧪 DEBUG: OPENAI_API_KEY present:", !!process.env.OPENAI_API_KEY);

const app = express();
app.use(express.json());

// ✅ CORS — pozwól tylko Twojemu frontendowi
app.use(cors({
  origin: ["http://localhost:5173", "https://asystem-ai-frontend.onrender.com"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// 🔑 OpenAI konfiguracja
const openai = new OpenAI({
  apiKey: process.env.API_KEY || process.env.OPENAI_API_KEY,
});

// 🔐 PROSTE LOGOWANIE — generowanie tokena po haśle
let activeTokens = new Set();

app.post("/api/login", (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "tajnehaslo123";

  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString("hex");
    activeTokens.add(token);
    console.log("✅ Zalogowano — token:", token.slice(0, 8) + "...");
    res.json({ success: true, token });
  } else {
    console.warn("❌ Nieudane logowanie (błędne hasło)");
    res.status(401).json({ success: false, message: "Niepoprawne hasło" });
  }
});

// 🛡️ Middleware: sprawdzanie tokena przy każdej prośbie AI
function requireAuth(req, res, next) {
  const token = req.headers["authorization"];
  if (!token || !activeTokens.has(token)) {
    console.warn("🚫 Brak autoryzacji lub token nieprawidłowy");
    return res.status(403).json({ error: "Brak dostępu. Zaloguj się." });
  }
  next();
}

// ✅ Główna trasa AI — wymaga logowania
app.post("/api/ai", requireAuth, async (req, res) => {
  const { prompt } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Zwracaj WYŁĄCZNIE dane w poprawnym formacie JSON. Nie dodawaj żadnych opisów, komentarzy ani tekstów poza JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 1200,
    });

    let responseText = completion.choices[0]?.message?.content?.trim();

    // 🔍 Automatyczne wyłuskanie JSON-a
    const jsonMatch = responseText?.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) responseText = jsonMatch[0];

    res.json({ response: responseText });
  } catch (error) {
    console.error("❌ Błąd OpenAI:", error);
    res.status(500).json({ error: "Błąd po stronie serwera AI" });
  }
});

// 🔹 Testowy endpoint
app.get("/api/test", (req, res) => {
  res.send("✅ Backend AI działa poprawnie!");
});

// 🔹 Strona główna Render
app.get("/", (req, res) => {
  res.send("🚀 Asystent AI backend działa! Sprawdź /api/test lub /api/ai");
});

// 🧩 Uruchomienie serwera
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server działa na porcie ${PORT}`));

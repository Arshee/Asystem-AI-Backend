import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";

dotenv.config();

/* -------------------------------------------------
      🚀 INITIALIZACJA APP — MUSI BYĆ NA GÓRZE
-------------------------------------------------- */
const app = express();
app.use(express.json());

/* -------------------------------------------------
      ♊ GEMINI KLIENT
-------------------------------------------------- */
let googleClient = null;
try {
  const { GoogleGenAI } = await import("@google/genai");

  if (process.env.API_KEY) {
    googleClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
    console.log("🟢 Gemini client initialized");
  } else {
    console.log("⚠️ Brak API_KEY — Gemini nie zadziała");
  }
} catch (e) {
  console.log("⚠️ Gemini lib not available");
}

/* -------------------------------------------------
      🌐 CORS
-------------------------------------------------- */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://asystent-ai-xp0a.onrender.com",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

/* -------------------------------------------------
      🔐 LOGOWANIE
-------------------------------------------------- */
let activeTokens = new Set();

app.post("/api/login", (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "a808Lq5Bvv";

  if (password === ADMIN_PASSWORD) {
  const token = crypto.randomBytes(32).toString("hex");
  activeTokens.add(token);
  console.log("🔑 Login OK:", token.slice(0, 8) + "...");
  return res.json({ success: true, token });
}

  return res.status(401).json({ success: false, message: "Niepoprawne hasło" });
});

function requireAuth(req, res, next) {
  const token = req.headers["authorization"];
  if (!token || !activeTokens.has(token)) {
    return res.status(403).json({ error: "Brak dostępu. Zaloguj się ponownie." });
  }
  next();
}

/* -------------------------------------------------
      🤖 FUNKCJA AI — tylko GEMINI
-------------------------------------------------- */
async function askModel(prompt) {
  if (!googleClient) {
    throw new Error("Brak API_KEY → Gemini nie działa.");
  }

  const resp = await googleClient.models.generateContent({
    model: process.env.GOOGLE_MODEL || "gemini-2.5-flash",
    contents: prompt,
    config: { temperature: 0.8, maxOutputTokens: 1500 }
  });

  const text =
    resp.text ||
    resp.candidates?.[0]?.content?.parts?.map((p) => p.text).join(" ") ||
    "";

  return text;
}

/* -------------------------------------------------
      📡 API JSON
-------------------------------------------------- */
app.post("/api/ai", requireAuth, async (req, res) => {
  const { prompt } = req.body;

  if (!prompt)
    return res.status(400).json({ error: "Brak prompt" });

  try {
    const result = await askModel(
      "Zwracaj tylko poprawny JSON.\n" + prompt
    );

    const match = result.match(/\{[\s\S]*\}|\[[\s\S]*\]/);

    return res.json({ response: match ? match[0] : result });
  } catch (err) {
    console.error("AI ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------------
      🖼️ MINIATURY
-------------------------------------------------- */
const upload = multer({ storage: multer.memoryStorage() });

app.post(
  "/api/generate-thumbnails",
  requireAuth,
  upload.single("frame"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "Brakuje pliku frame" });

      const imgb64 = req.file.buffer.toString("base64");

      // Brak wsparcia dla generowania obrazów → fallback
      return res.json({
        thumbnails: [
          { description: "Dynamiczna miniatura", imageData: null },
          { description: "Minimalistyczna miniatura", imageData: null },
          { description: "Kontrastowa miniatura", imageData: null }
        ]
      });
    } catch (e) {
      console.error("Thumbnail ERR:", e);
      return res.status(500).json({ error: "Błąd miniatur" });
    }
  }
);

/* -------------------------------------------------
      🌍 ROUTES
-------------------------------------------------- */
app.get("/api/test", (_, res) => res.send("OK ✓"));
app.get("/", (_, res) => res.send("Backend działa ✓"));

/* -------------------------------------------------
      🚀 START SERWERA
-------------------------------------------------- */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🔥 Server running on port ${PORT}`));

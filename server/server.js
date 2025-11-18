import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer"; // ✅ MULTER

dotenv.config();

/* -------------------------------------------------
      ♊ GEMINI KLIENT (opcjonalnie)
-------------------------------------------------- */
let googleClient = null;
try {
  const { GoogleGenAI } = await import("@google/genai");

  if (process.env.API_KEY) {
    googleClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
    console.log("🟢 Gemini client initialized");
  }
} catch (e) {
  console.log("ℹ️ Gemini not available");
}
/* -------------------------------------------------
      🌐 CORS
-------------------------------------------------- */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://asystent-ai-xp0a.onrender.com", // TWÓJ FRONTEND
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

/* -------------------------------------------------
      🔐 LOGOWANIE TOKENOWE
-------------------------------------------------- */
let activeTokens = new Set();

app.post("/api/login", (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "tajnehaslo123";

  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString("hex");
    activeTokens.add(token);
    console.log("🔓 Login OK:", token.slice(0, 8) + "...");
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
      🤖 FUNKCJA WSPÓLNA DO PYTAŃ (Gemini → OpenAI)
-------------------------------------------------- */
async function askModel(prompt, options = {}) {
  // ➤ Priorytet: GEMINI
  if (googleClient) {
    try {
      const resp = await googleClient.models.generateContent({
        model: process.env.GOOGLE_MODEL || "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.8,
          maxOutputTokens: 1200,
          ...(options.config || {}),
        },
      });

      const text =
        resp.text ||
        resp.candidates?.[0]?.content?.parts?.map((x) => x.text).join(" ") ||
        "";

      return text;
    } catch (err) {
      console.error("Gemini error:", err);
      throw err;
    }
  }

  // ➤ Fallback: OPENAI
  if (OpenAIClient) {
    const completion = await OpenAIClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Zwracaj tylko poprawny JSON." },
        { role: "user", content: prompt },
      ],
    });

    return completion.choices[0]?.message?.content || "";
  }

  throw new Error("Brak dostępnego modelu AI.");
}

/* -------------------------------------------------
      📡 ENDPOINT JSON (AI)
-------------------------------------------------- */
app.post("/api/ai", requireAuth, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Brak prompt" });

  try {
    const text = await askModel(prompt);

    // Wyciągnij JSON
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return res.json({ response: match ? match[0] : text });
  } catch (err) {
    console.error("AI error:", err);
    return res.status(500).json({ error: "Błąd AI" });
  }
});

/* -------------------------------------------------
      🖼️ MULTER do uploadu miniatur
-------------------------------------------------- */
const upload = multer({
  storage: multer.memoryStorage(),
});

/* -------------------------------------------------
      🎨 GENEROWANIE MINIATUR
-------------------------------------------------- */
app.post(
  "/api/generate-thumbnails",
  requireAuth,
  upload.single("frame"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "Brakuje pola frame (plik)" });

      const {
        title = "",
        overlayText = "",
        orientation = "landscape",
      } = req.body;

      // Jeśli Gemini obsługuje generowanie obrazów
      if (googleClient && process.env.GOOGLE_IMAGE_MODEL) {
        try {
          const base64 = req.file.buffer.toString("base64");

          const result = await googleClient.models.generateContent({
            model: process.env.GOOGLE_IMAGE_MODEL,
            contents: {
              parts: [
                { inlineData: { data: base64, mimeType: req.file.mimetype } },
                {
                  text: `Stwórz 3 miniatury do filmu "${title}" z tekstem "${overlayText}". Orientacja: ${orientation}.`,
                },
              ],
            },
            config: {
              responseModalities: ["image"],
            },
          });

          const thumbs = [];
          const cands = result.candidates || [];

          for (const c of cands) {
            const parts = c.content?.parts || [];
            let img = null;
            let desc = "Miniatura";

            for (const p of parts) {
              if (p.inlineData?.data) img = p.inlineData.data;
              if (p.text) desc = p.text;
            }

            if (img) thumbs.push({ description: desc, imageData: img });
          }

          return res.json({ thumbnails: thumbs });
        } catch (err) {
          console.error("Gemini IMG error:", err);
          return res.status(500).json({ error: "Gemini image error" });
        }
      }

      // Fallback — tylko opisy
      return res.json({
        thumbnails: [
          { description: "Dynamiczna miniatura", imageData: null },
          { description: "Minimalistyczna miniatura", imageData: null },
          { description: "Jaskrawa social miniatura", imageData: null },
        ],
      });
    } catch (err) {
      console.error("Miniature error:", err);
      return res.status(500).json({ error: "Błąd generowania miniatur" });
    }
  }
);

/* -------------------------------------------------
      🌍 TESTY / ROOT
-------------------------------------------------- */
app.get("/api/test", (req, res) => res.send("OK ✓ Backend działa"));
app.get("/", (req, res) =>
  res.send("🚀 Backend działa — sprawdź /api/test lub /api/login")
);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🔥 Server running on port ${PORT}`));

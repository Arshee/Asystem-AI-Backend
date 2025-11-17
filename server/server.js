// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import multer from "multer";

dotenv.config();

// Opcjonalne – klient Gemini (Google Generative AI)
let googleClient = null;
try {
  // Import dynamiczny, bo biblioteka opcjonalna
  // npm i @google/genai
  const { GoogleGenAI } = await import("@google/genai");
  if (process.env.GOOGLE_API_KEY) {
    googleClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    console.log("🧪 Google GenAI client initialized");
  }
} catch (e) {
  console.log("ℹ️ @google/genai not available or failed to initialize. Gemini endpoints will be disabled unless package installed.");
}

// Opcjonalne – OpenAI fallback
let OpenAIClient = null;
try {
  const OpenAI = (await import("openai")).default;
  if (process.env.API_KEY || process.env.OPENAI_API_KEY) {
    OpenAIClient = new OpenAI({
      apiKey: process.env.API_KEY || process.env.OPENAI_API_KEY,
    });
    console.log("🧪 OpenAI client initialized");
  }
} catch (e) {
  console.log("ℹ️ openai SDK not available or failed to initialize.");
}

const app = express();
app.use(express.json());

// CORS — dodaj tutaj swoją domenę frontendu
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://asystent-ai-xp0a.onrender.com",
      "https://asystem-ai-frontend.onrender.com",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

// Proste tokenowe logowanie
let activeTokens = new Set();

app.post("/api/login", (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "tajnehaslo123";

  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString("hex");
    activeTokens.add(token);
    console.log("✅ Zalogowano — token sample:", token.slice(0, 8) + "...");
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

/**
 * Helper: wysyła prompt do wybranego modelu (Gemini jeśli jest, inaczej OpenAI)
 * Oczekujemy, że model zwróci tekst zawierający JSON (możemy spróbować wyciągnąć JSON).
 */
async function askModel(prompt, options = {}) {
  // Jeśli mamy googleClient (Gemini)
  if (googleClient) {
    // Używamy prostego generowania tekstu przez Google GenAI
    try {
      const resp = await googleClient.models.generateContent({
        model: process.env.GOOGLE_MODEL || "gemini-2.5-flash",
        contents: prompt,
        // nie wszystkie wersje mają te pola; dostosuj jeśli trzeba
        config: { temperature: 0.8, maxOutputTokens: 1200, ...(options.config || {}) },
      });
      // response text może być w resp.text lub resp.candidates[0].content.parts...
      const text = resp.text ?? (resp.candidates?.[0]?.content?.parts?.map(p => p.text).join(" ") ?? "");
      return text;
    } catch (err) {
      console.error("Google GenAI error:", err);
      throw err;
    }
  }

  // Fallback: OpenAI (chat.completions)
  if (OpenAIClient) {
    try {
      const completion = await OpenAIClient.chat.completions.create({
        model: options.model || "gpt-4o-mini",
        messages: [
          { role: "system", content: options.system || "Zwracaj tylko poprawny JSON bez komentarzy." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 1200,
      });
      return completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      console.error("OpenAI error:", err);
      throw err;
    }
  }

  throw new Error("Brak klienta AI (nie skonfigurowano GOOGLE_API_KEY ani API_KEY).");
}

// GŁÓWNY endpoint do zapytań tekstowych (generowanie JSON)
app.post("/api/ai", requireAuth, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Brakuje pola prompt" });

  try {
    const systemInstruction = `Zwracaj WYŁĄCZNIE poprawny JSON bez dodatkowych komentarzy. Jeśli nie możesz wygenerować JSON, zwróć minimalny opis w cudzysłowie.`;
    const text = await askModel(prompt, { system: systemInstruction });
    // wyciągnij JSON jeżeli jest
    const jsonMatch = (text || "").match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const responseText = jsonMatch ? jsonMatch[0] : text;
    return res.json({ response: responseText });
  } catch (err) {
    console.error("❌ /api/ai error:", err);
    return res.status(500).json({ error: "Błąd AI" });
  }
});

/**
 * GENEROWANIE MINIATUR (przyjmuje plik obrazka/klatki wideo)
 * Zwraca tablicę obiektów { description, imageData: base64 }
 *
 * Aby działało z Gemini Image, wymagana jest biblioteka @google/genai i dostęp do modelu obrazowego.
 */
const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/generate-thumbnails", requireAuth, upload.single("frame"), async (req, res) => {
  try {
    const frame = req.file; // Buffer
    const { title = "", overlayText = "", orientation = "landscape", textEffect = "none", imageFilter = "none" } = req.body;

    if (!frame) return res.status(400).json({ error: "Brakuje pola frame (plik)" });

    // Jeśli mamy googleClient i model obrazowy
    if (googleClient && googleClient.models && process.env.GOOGLE_IMAGE_MODEL) {
      try {
        // przygotuj inlineData
        const base64 = frame.buffer.toString("base64");
        // Uwaga: konkretna metoda wywołania generowania obrazów w SDK Google może różnić się wersją biblioteki.
        // Poniżej wzorcowy przykład - w razie błędów dopasuj wg dokumentacji @google/genai z której korzystasz.
        const promptText = `
          Stwórz miniaturę do filmu: "${title}".
          Tekst: "${overlayText || 'Wygeneruj automatycznie'}".
          Orientacja: ${orientation}.
          Efekt tekstu: ${textEffect}.
          Filtr obrazu: ${imageFilter}.
          Zwróć 3 warianty — każdy jako base64 oraz krótki opis.
        `;
        const response = await googleClient.models.generateContent({
          model: process.env.GOOGLE_IMAGE_MODEL,
          contents: { parts: [{ inlineData: { data: base64, mimeType: frame.mimetype } }, { text: promptText }] },
          config: { responseModalities: ["image"], maxOutputTokens: 1200 },
        });

        // Odczytaj części z response.candidates
        const candidates = response.candidates ?? [];
        const results = [];

        for (const cand of candidates.slice(0, 3)) {
          const parts = cand.content?.parts ?? [];
          let imageData = null;
          let desc = "Miniatura";
          for (const p of parts) {
            if (p.inlineData?.data) imageData = p.inlineData.data;
            if (p.text) desc = p.text;
          }
          if (imageData) results.push({ description: desc, imageData });
        }

        if (results.length === 0) {
          return res.status(500).json({ error: "Model nie wygenerował obrazów" });
        }
        return res.json({ thumbnails: results });
      } catch (err) {
        console.error("❌ Gemini image generation error:", err);
        return res.status(500).json({ error: "Błąd generowania miniatur (Gemini)" });
      }
    }

    // Fallback: jeśli nie ma Gemini image — zwróć 3 opisowe koncepcje (bez obrazów)
    const fallback = [
      { description: `Dynamiczny: kontrastowe kolory, duży tekst (z ${overlayText || "tytułu"})`, imageData: null },
      { description: `Minimalny: jasne tło, elegancka typografia`, imageData: null },
      { description: `Jaskrawy social: mocne kolory, akcje graficzne`, imageData: null },
    ];
    return res.json({ thumbnails: fallback });
  } catch (err) {
    console.error("❌ /api/generate-thumbnails error:", err);
    return res.status(500).json({ error: "Błąd serwera" });
  }
});

// Endpoint testowy
app.get("/api/test", (req, res) => res.send("✅ Backend AI działa poprawnie!"));

// Root
app.get("/", (req, res) => res.send("🚀 Asystent AI backend działa! Sprawdź /api/test lub /api/login"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server działa na porcie ${PORT}`));

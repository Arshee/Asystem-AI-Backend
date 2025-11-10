// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

// 🧪 Debug (pomaga upewnić się, że klucz istnieje)
console.log("🧪 DEBUG: API_KEY present:", !!process.env.API_KEY);
console.log("🧪 DEBUG: OPENAI_API_KEY present:", !!process.env.OPENAI_API_KEY);
if (process.env.API_KEY) {
  const v = process.env.API_KEY;
  console.log("🧪 DEBUG: API_KEY preview:", v.slice(0, 4) + "..." + v.slice(-4));
}
if (process.env.OPENAI_API_KEY) {
  const v = process.env.OPENAI_API_KEY;
  console.log("🧪 DEBUG: OPENAI_API_KEY preview:", v.slice(0, 4) + "..." + v.slice(-4));
}

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.API_KEY || process.env.OPENAI_API_KEY,
});

// ✅ Główna trasa AI (frontend wysyła prompt)
app.post("/api/ai", async (req, res) => {
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

    // 🔍 Automatycznie wyłuskujemy tylko JSON z odpowiedzi
    const jsonMatch = responseText?.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      responseText = jsonMatch[0];
    }

    res.json({ response: responseText });
  } catch (error) {
    console.error("❌ Błąd OpenAI:", error);
    res.status(500).json({ error: "Błąd po stronie serwera AI" });
  }
});

// 🔹 Endpoint testowy
app.get("/api/test", (req, res) => {
  res.send("✅ Backend AI działa poprawnie!");
});

// 🔹 Strona główna Render
app.get("/", (req, res) => {
  res.send("🚀 Asystent AI backend działa! Sprawdź /api/test lub /api/ai");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server działa na porcie ${PORT}`));

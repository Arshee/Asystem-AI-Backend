// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();
// tymczasowy debug — NIE wypisuj klucza w całości w publiczne logi
console.log("🧪 DEBUG: API_KEY present:", !!process.env.API_KEY);
console.log("🧪 DEBUG: OPENAI_API_KEY present:", !!process.env.OPENAI_API_KEY);

// pokaż 4 pierwsze i 4 ostatnie znaki (maskowane) jeśli istnieje
if (process.env.API_KEY) {
  const v = process.env.API_KEY;
  console.log("🧪 DEBUG: API_KEY preview:", v.slice(0,4) + "..." + v.slice(-4));
}
if (process.env.OPENAI_API_KEY) {
  const v = process.env.OPENAI_API_KEY;
  console.log("🧪 DEBUG: OPENAI_API_KEY preview:", v.slice(0,4) + "..." + v.slice(-4));
}

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

app.post("/api/ai", async (req, res) => {
  const { prompt } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Jesteś asystentem AI do planowania i publikowania treści na social media.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
    });

    res.json({ response: completion.choices[0].message.content });
  } catch (err) {
    console.error("Błąd OpenAI:", err);
    res.status(500).json({ error: "Błąd po stronie serwera AI" });
  }
});
app.get("/", (req, res) => {
  res.send("🚀 Asystent AI backend działa! Sprawdź /api/test lub /api/ai");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server działa na porcie ${PORT}`));

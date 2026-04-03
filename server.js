const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase client
const supabase = createClient(
  "https://zzsawacervuerwraeifk.supabase.co",
  "sb_publishable_S8fprkNjVEng2HSvRsLogQ_Fyl9fuyi"
)

// ✅ API KEY
const OPENROUTER_API_KEY = "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";

// ✅ MEMORY
let chatHistory = [];

app.post("/chat", async (req, res) => {
  const { message, user_id } = req.body;


  // extract tracking number (e.g. NV987654321)
    const trackingMatch = message.match(/[A-Z]{2}\d{8,}/i);

    if (trackingMatch) {
      const trackingNumber = trackingMatch[0].trim().toUpperCase();
      
      console.log("Tracking search:", trackingNumber);

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .ilike("tracking_number", trackingNumber);

      console.log("Result:", data);

      if (!data || data.length === 0) {
        return res.json({
          reply: `❌ Tracking number ${trackingNumber} not found`
        });S
      }

      const order = data[0];

      return res.json({
        reply: `📦 ${order.product_name}\nStatus: ${order.status}`
      });
  }

  // 🔥 ORDER TRACKING (FIXED)
  if (message.toLowerCase().includes("track")) {

    if (!user_id) {
      return res.json({
        reply: "⚠️ Please login first"
      });
    }

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user_id);

  if (!orders || orders.length === 0) {
      return res.json({
        reply: "📦 You have no orders yet. Would you like to place one?"
      });
  }

  const text = orders
    .map(o => `${o.product_name} — ${o.status}`)
    .join("\n");

  return res.json({
    reply: `📦 Your Orders:\n${text}`
  });
}

  // 🔥 NORMAL CHAT
  chatHistory.push({ role: "user", content: message });

  if (chatHistory.length > 10) {
    chatHistory = chatHistory.slice(-10);
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:  `
You are a professional e-commerce support AI.

Rules:

1. ORDER TRACKING:
- If user says "track my order"
→ ALWAYS fetch their orders using their account
→ DO NOT ask for order ID

2. ONLY ask for order ID if:
- user explicitly says "track order 12345"

3. PRODUCT QUESTIONS:
- Do NOT ask for order ID

Tone:
- friendly
- clear
- helpful
- short
`
          },
          ...chatHistory
        ]
      })
    });

    const data = await response.json();

    const reply =
      data?.choices?.[0]?.message?.content ||
      "I'm sorry, I couldn't process your request.";

    chatHistory.push({ role: "assistant", content: reply });

    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.json({ reply: "⚠️ Server error." });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000 🚀");
});
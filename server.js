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

  // 🔥 ALWAYS SAVE USER MESSAGE FIRST
  if (user_id) {
    await supabase.from("chat_history").insert({
      user_id,
      message,
      sender: "user"
    });
  }


  // extract tracking number (e.g. NV987654321)
  const trackingMatch = message.match(/[A-Z]{2}\d{8,}/i);

  if (trackingMatch) {
    const trackingNumber = trackingMatch[0].trim().toUpperCase();
      

    const { data} = await supabase
      .from("orders")
      .select("*")
      .ilike("tracking_number", trackingNumber);

    let reply;

    if (!data || data.length === 0) {
      reply = `❌ Tracking number ${trackingNumber} not found`;
    } else {
      const order = data[0];
      reply = `📦 ${order.product_name}\nStatus: ${order.status}`;
    }

    // 🔥 SAVE BOT REPLY
    if (user_id) {
      await supabase.from("chat_history").insert({
        user_id,
        message: reply,
        sender: "bot"
      });
    }

    return res.json({ reply });
  }

  // 🔥 ORDER TRACKING (FIXED)
  if (message.toLowerCase().includes("track")) {

    let reply;

    if (!user_id) {
      reply = "⚠️ Please login first";
    } else {
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user_id);

      if (!orders || orders.length === 0) {
        reply = "📦 You have no orders yet.";
      } else {
        reply =
          "📦 Your Orders:\n" +
          orders.map(o => `${o.product_name} — ${o.status}`).join("\n");
      }
    }

    // 🔥 SAVE BOT REPLY
    if (user_id) {
      await supabase.from("chat_history").insert({
        user_id,
        message: reply,
        sender: "bot"
      });
    }

    return res.json({ reply });
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
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Customer Support Bot"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:  `
You are a helpful customer support assistant.

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

    let reply;

    if (data.error) {
      console.error(data.error);
      reply = "⚠️ AI service error.";
    } else {
      reply = data?.choices?.[0]?.message?.content || "⚠️ No response.";
    }

    chatHistory.push({ role: "assistant", content: reply });

    // 🔥 SAVE BOT REPLY
    if (user_id) {
      await supabase.from("chat_history").insert({
        user_id,
        message: reply,
        sender: "bot"
      });
    }

    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.json({ reply: "⚠️ Server error." });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000 🚀");
});
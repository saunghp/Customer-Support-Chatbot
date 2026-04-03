require("dotenv").config();
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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ✅ MEMORY
let chatHistory = [];

app.post("/chat", async (req, res) => {
  const { message, user_id, conversation_id: incomingConvId } = req.body;

  let conversation_id = incomingConvId;

  // ✅ CREATE CONVERSATION IF NOT EXIST
  if (!conversation_id && user_id) {
    const { data } = await supabase
      .from("conversations")
      .insert({
        user_id,
        title: message.slice(0, 30)
      })
      .select()
      .single();

    conversation_id = data.id;
  }

  // ✅ SAVE USER MESSAGE
  if (user_id) {
    await supabase.from("chat_history").insert({
      user_id,
      message,
      sender: "user",
      conversation_id
    });
  }

  // 🔍 TRACKING NUMBER
  const trackingMatch = message.match(/[A-Z]{2}\d{8,}/i);

  if (trackingMatch) {
    const trackingNumber = trackingMatch[0].trim().toUpperCase();

    const { data } = await supabase
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

    // ✅ SAVE BOT REPLY
    if (user_id) {
      await supabase.from("chat_history").insert({
        user_id,
        message: reply,
        sender: "bot",
        conversation_id
      });
    }

    return res.json({ reply, conversation_id });
  }

  // 📦 ORDER LIST
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

    if (user_id) {
      await supabase.from("chat_history").insert({
        user_id,
        message: reply,
        sender: "bot",
        conversation_id
      });
    }

    return res.json({ reply, conversation_id });
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

    let reply = data?.choices?.[0]?.message?.content || "⚠️ AI error";

    chatHistory.push({ role: "assistant", content: reply });

    if (user_id) {
      await supabase.from("chat_history").insert({
        user_id,
        message: reply,
        sender: "bot",
        conversation_id
      });
    }

    res.json({ reply, conversation_id });

  } catch (err) {
    console.error(err);
    res.json({ reply: "⚠️ Server error." });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000 🚀");
});
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase
const supabase = createClient(
  "https://zzsawacervuerwraeifk.supabase.co",
  "sb_publishable_S8fprkNjVEng2HSvRsLogQ_Fyl9fuyi"
);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ✅ MEMORY
let chatHistory = [];


// 🌍 AI TRANSLATION (ONLY FOR LOGIC)
async function translateToEnglish(text) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Translate this to English. Only return the translation."
          },
          {
            role: "user",
            content: text
          }
        ]
      })
    });

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || text;
  } catch {
    return text;
  }
}


app.post("/chat", async (req, res) => {
  let { message, user_id, conversation_id: incomingConvId } = req.body;

  let conversation_id = incomingConvId;
  const originalMessage = message;

  // ✅ PER-USER MEMORY (FIXED 🚀)
  let userHistory = [];

  if (user_id) {
    const { data } = await supabase
      .from("chat_history")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true });

    userHistory = (data || []).slice(-10).map(m => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.message
    }));
  }

  // 🌍 TRANSLATE FOR LOGIC ONLY
  const translatedMessage = await translateToEnglish(originalMessage);
  const logicMessage = translatedMessage.toLowerCase();

  // ✅ CREATE CONVERSATION
  if (!conversation_id && user_id) {
    const { data } = await supabase
      .from("conversations")
      .insert({
        user_id,
        title: originalMessage.slice(0, 30)
      })
      .select()
      .single();

    conversation_id = data.id;
  }

  // ✅ SAVE USER MESSAGE
  if (user_id) {
    await supabase.from("chat_history").insert({
      user_id,
      message: originalMessage,
      sender: "user",
      conversation_id
    });
  }

  // 🔍 TRACKING NUMBER
  const trackingMatch = originalMessage.match(/[A-Z]{2}\d{8,}/i);

  if (trackingMatch) {
    const trackingNumber = trackingMatch[0].toUpperCase();

    const { data } = await supabase
      .from("orders")
      .select("*")
      .ilike("tracking_number", trackingNumber);

    let reply;

    if (!data || data.length === 0) {
      reply = `❌ Tracking number ${trackingNumber} not found`;
    } else {
      const order = data[0];
      reply = `📦 ${order.product_name} — ${order.status}`;
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

  // 📦 ORDER LIST
  if (logicMessage.includes("track")) {
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
          "📦 " +
          orders.map(o => `${o.product_name} — ${o.status}`).join(", ");
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

  // 🔥 NORMAL CHAT (FIXED MEMORY + LANGUAGE)
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
You are a professional customer support assistant.

🌏 LANGUAGE:
- ALWAYS reply in the SAME language as the user's message
- Auto-detect language (Chinese, Burmese, Thai, Vietnamese, etc.)

📦 RULES:
1. Track order → show orders directly (no order ID needed)
2. Only ask order ID if user explicitly gives one
3. Product questions → do NOT ask for order ID

💬 STYLE:
- Friendly
- Natural
- SHORT (max 2 sentences)
- Human-like

❌ DO NOT:
- Repeat greeting again
- Give long explanations
- Use lists or bullet points
`
          },
          ...userHistory,
          { role: "user", content: originalMessage }
        ]
      })
    });

    const data = await response.json();
    let reply = data?.choices?.[0]?.message?.content || "⚠️ AI error";

    // ✂️ FORCE SHORT RESPONSE
    reply = reply.split("\n").slice(0, 2).join(" ");

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

app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// ✅ CHANGED FOR VERCEL — export app instead of listening on a port
module.exports = app;
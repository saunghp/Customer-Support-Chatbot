require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

//  DEBUG ENV
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
console.log("API KEY:", OPENROUTER_API_KEY ? "Loaded ✅" : "Missing ❌");

//  Supabase
const supabase = createClient(
  "https://zzsawacervuerwraeifk.supabase.co",
  "sb_publishable_S8fprkNjVEng2HSvRsLogQ_Fyl9fuyi"
);

//  TRANSLATION
async function translateToEnglish(text) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Translate this to English. Only return the translation."
          },
          { role: "user", content: text }
        ]
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Translate error:", data);
      return text;
    }

    return data?.choices?.[0]?.message?.content || text;
  } catch (err) {
    console.error("Translate crash:", err);
    return text;
  }
}

//  LABELS 
app.post("/labels", async (req, res) => {
  try {
    res.json({
      track: "📦 Track",
      refund: "↩️ Refund",
      account: "👤 Account",
      human: "💬 Human"
    });
  } catch (err) {
    console.error("Labels error:", err);
    res.status(500).json({ error: "Label error" });
  }
});

// CHAT
app.post("/chat", async (req, res) => {
  try {
    let { message, user_id, conversation_id: incomingConvId } = req.body;

    let conversation_id = incomingConvId;
    const originalMessage = message;

    //  USER MEMORY
    let userHistory = [];

    if (user_id) {
      const { data } = await supabase
        .from("chat_history")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", { ascending: true });

      if (!error && data) {
        userHistory = data
          .slice(-5)
          .filter(m =>
            m.message &&
            typeof m.message === "string" &&
            !m.message.includes("⚠️")
          )
          .map(m => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.message.slice(0, 300)
          }));
      }
    }

    //  TRANSLATE
    const translatedMessage = await translateToEnglish(originalMessage);
    const logicMessage = translatedMessage.toLowerCase();

    //  CREATE CONVERSATION
    if (!conversation_id && user_id) {
      const { data } = await supabase
        .from("conversations")
        .insert({
          user_id,
          title: originalMessage.slice(0, 30)
        })
        .select()
        .single();

      if (error || !data) {
        console.error("Conversation creation failed:", error);
        conversation_id = null;
      } else {
        conversation_id = data.id;
      }
    }

    // 💾 SAVE USER MESSAGE
    if (user_id && conversation_id) {
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

      if (user_id && conversation_id) {
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

      if (user_id && conversation_id) {
        await supabase.from("chat_history").insert({
          user_id,
          message: reply,
          sender: "bot",
          conversation_id
        });
      }

      return res.json({ reply, conversation_id });
    }

    //  AI RESPONSE
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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
    console.log("OpenRouter FULL response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("OpenRouter error:", data);

      return res.json({
        reply: "⚠️ AI is temporarily unavailable. Please try again."
      });
    }

    let reply = "⚠️ AI error";

    if (data?.choices && data.choices.length > 0) {
      reply = data.choices[0]?.message?.content || reply;
    }

    //  SHORT RESPONSE
    reply = reply.split("\n").slice(0, 2).join(" ");

    if (user_id && conversation_id) {
      await supabase.from("chat_history").insert({
        user_id,
        message: reply,
        sender: "bot",
        conversation_id
      });
    }

    res.json({ reply, conversation_id });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.json({ reply: "⚠️ Server error." });
  }
});

//  ROOT
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// 🚀 START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
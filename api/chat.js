// /api/chat.js

import { createClient } from "@supabase/supabase-js";

// ✅ ENV (IMPORTANT: move keys to Vercel env later)
const supabase = createClient(
  "https://zzsawacervuerwraeifk.supabase.co",
  "sb_publishable_S8fprkNjVEng2HSvRsLogQ_Fyl9fuyi"
);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// 🌍 TRANSLATION
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
    return data?.choices?.[0]?.message?.content || text;
  } catch {
    return text;
  }
}

export default async function handler(req, res) {

  // ❌ Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let { message, user_id, conversation_id: incomingConvId } = req.body;

  let conversation_id = incomingConvId;
  const originalMessage = message;

  // ✅ USER MEMORY
  let userHistory = [];

  if (user_id) {
    const { data } = await supabase
      .from("chat_history")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true });

    userHistory = (data || [])
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

  // 🌍 TRANSLATE
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

    return res.status(200).json({ reply, conversation_id });
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

    return res.status(200).json({ reply, conversation_id });
  }

  // 🤖 AI CHAT
  try {
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

- Reply in SAME language
- Keep answers SHORT (max 2 sentences)
`
          },
          
          { role: "user", content: originalMessage }
        ]
      })
    });

    const data = await response.json();
    console.log("OpenRouter FULL response:", JSON.stringify(data, null, 2));
    
    let reply = "⚠️ AI error";

    if (data?.choices && data.choices.length > 0) {
      reply = data.choices[0]?.message?.content || reply;
    }

    reply = reply.split("\n").slice(0, 2).join(" ");

    if (user_id) {
      await supabase.from("chat_history").insert({
        user_id,
        message: reply,
        sender: "bot",
        conversation_id
      });
    }

    return res.status(200).json({ reply, conversation_id });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ reply: "⚠️ Server error." });
  }
}
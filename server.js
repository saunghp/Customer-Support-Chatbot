require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// DEBUG ENV
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openai/gpt-4o-mini";
console.log("API KEY:", OPENROUTER_API_KEY ? "Loaded ✅" : "Missing ❌");

// Supabase
const supabase = createClient(
  "https://zzsawacervuerwraeifk.supabase.co",
  "sb_publishable_S8fprkNjVEng2HSvRsLogQ_Fyl9fuyi"
);

function getSupabaseForRequest(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return supabase;
  }

  return createClient(
    "https://zzsawacervuerwraeifk.supabase.co",
    "sb_publishable_S8fprkNjVEng2HSvRsLogQ_Fyl9fuyi",
    {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    }
  );
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] || null;
}

async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);

  if (!token) {
    return { user: null, error: null };
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return { user: null, error };
  }

  return { user: data.user, error: null };
}

async function readJsonSafely(res) {
  const text = await res.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function callOpenRouter(messages) {
  if (!OPENROUTER_API_KEY) {
    return {
      ok: false,
      error: "OpenRouter API key is missing on the backend."
    };
  }

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://backend-jb86.onrender.com",
        "X-Title": "Customer Support Chatbot"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages
      })
    });

    const data = await readJsonSafely(res);

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.error?.message || data?.message || data?.raw || "OpenRouter request failed.",
        data
      };
    }

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return {
        ok: false,
        status: res.status,
        error: "OpenRouter returned an empty response.",
        data
      };
    }

    return { ok: true, content, data };
  } catch (err) {
    return {
      ok: false,
      error: err.message || "Could not reach OpenRouter."
    };
  }
}

// TRANSLATION
async function translateToEnglish(text) {
  const result = await callOpenRouter([
    {
      role: "system",
      content: "Translate this to English. Only return the translation."
    },
    { role: "user", content: text }
  ]);

  if (!result.ok) {
    console.error("Translate error:", result);
    return text;
  }

  return result.content || text;
}

// LABELS
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
    const db = getSupabaseForRequest(req);
    let { message, user_id, conversation_id: incomingConvId } = req.body;
    const { user: authUser, error: authError } = await getAuthenticatedUser(req);

    if (!message || typeof message !== "string") {
      return res.status(400).json({ reply: "Please type a message first." });
    }

    if (authError) {
      console.error("Auth token validation failed:", authError);
      return res.status(401).json({
        reply: "Login session is invalid. Please log out, sign in again, and retry."
      });
    }

    if (user_id && !authUser) {
      return res.status(401).json({
        reply: "Login session token is missing. Please redeploy the frontend so it sends the Supabase access token."
      });
    }

    if (authUser) {
      user_id = authUser.id;
    }

    const safeUserId = user_id || null;
    let convoId = incomingConvId || null;
    const originalMessage = message;

    // USER MEMORY
    let userHistory = [];

    if (safeUserId) {
      // ✅ FIX 1: destructure `error` properly
      const { data, error } = await db
        .from("chat_history")
        .select("*")
        .eq("user_id", safeUserId)
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

    // TRANSLATE
    const translatedMessage = await translateToEnglish(originalMessage);
    const logicMessage = translatedMessage.toLowerCase();

    // CREATE CONVERSATION
    if (!convoId) {
      // ✅ FIX 2: destructure `error` properly
      const { data, error } = await db
        .from("conversations")
        .insert([
          {
            user_id: safeUserId,
            title: originalMessage.slice(0, 30)
          }
        ])
        .select()
        .single();

      if (error || !data) {
        console.error("Conversation creation failed:", error);
        return res.status(500).json({
          reply: `Could not create conversation: ${error?.message || "Unknown Supabase error"}`
        });
      } else {
        convoId = data.id;
      }
    }

    // SAVE USER MESSAGE
    if (convoId) {
      const { error } = await db.from("chat_history").insert([
        {
          user_id: safeUserId,
          conversation_id: convoId,
          message: originalMessage,
          sender: "user"
        }
      ]);

      if (error) {
        console.error("Saving user message failed:", error);
      }
    }

    // TRACKING NUMBER
    const trackingMatch = originalMessage.match(/[A-Z]{2}\d{8,}/i);

    if (trackingMatch) {
      const trackingNumber = trackingMatch[0].toUpperCase();

      // ✅ FIX 3: destructure `error` properly
      const { data, error } = await db
        .from("orders")
        .select("*")
        .ilike("tracking_number", trackingNumber);

      let reply;

      if (error || !data || data.length === 0) {
        reply = `❌ Tracking number ${trackingNumber} not found`;
      } else {
        const order = data[0];
        reply = `📦 ${order.product_name} — ${order.status}`;
      }

      if (convoId) {
        const { error } = await db.from("chat_history").insert({
          user_id: safeUserId,
          message: reply,
          sender: "bot",
          conversation_id: convoId
        });

        if (error) {
          console.error("Saving tracking reply failed:", error);
        }
      }

      return res.json({ reply, conversation_id: convoId });
    }

    // ORDER LIST
    if (logicMessage.includes("track")) {
      let reply;

      if (!safeUserId) {
        reply = "⚠️ Please login first";
      } else {
        // ✅ FIX 4: destructure `error` properly
        const { data: orders, error: ordersError } = await db
          .from("orders")
          .select("*")
          .eq("user_id", safeUserId);

        if (ordersError || !orders || orders.length === 0) {
          reply = "📦 You have no orders yet.";
        } else {
          reply =
            "📦 " +
            orders.map(o => `${o.product_name} — ${o.status}`).join(", ");
        }
      }

      if (convoId) {
        const { error } = await db.from("chat_history").insert({
          user_id: safeUserId,
          message: reply,
          sender: "bot",
          conversation_id: convoId
        });

        if (error) {
          console.error("Saving order-list reply failed:", error);
        }
      }

      return res.json({ reply, conversation_id: convoId });
    }

    // AI RESPONSE
    const aiResult = await callOpenRouter([
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
    ]);

    if (!aiResult.ok) {
      console.error("OpenRouter error:", aiResult);

      return res.json({
        reply: "⚠️ AI is temporarily unavailable. Please try again."
      });
    }

    let reply = "⚠️ AI error";

    const data = aiResult.data || {
      choices: [{ message: { content: aiResult.content } }]
    };

    if (data?.choices && data.choices.length > 0) {
      reply = data.choices[0]?.message?.content || reply;
    }

    // SHORT RESPONSE
    reply = reply.split("\n").slice(0, 2).join(" ");

    if (convoId) {
      const { error } = await db.from("chat_history").insert({
        user_id: safeUserId,
        message: reply,
        sender: "bot",
        conversation_id: convoId
      });

      if (error) {
        console.error("Saving bot reply failed:", error);
      }
    }

    res.json({ reply, conversation_id: convoId });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.json({ reply: "⚠️ Server error." });
  }
});

// ROOT
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

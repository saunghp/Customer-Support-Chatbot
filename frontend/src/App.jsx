import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  const chatEndRef = useRef(null);

  // 🔽 Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ✅ Get user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // ✅ LOAD CHAT HISTORY
  const loadChatHistory = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("chat_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (!data || data.length === 0) {
      setMessages([
        {
          text: "Hi there! 👋 I'm Aria, your virtual support assistant. How can I assist you today?",
          sender: "bot"
        }
      ]);
      return;
    }

    const formatted = data.map(msg => ({
      text: msg.message,
      sender: msg.sender
    }));

    setMessages(formatted);
  };

  // 🔥 Run when user changes
  useEffect(() => {
    if (user) loadChatHistory();
  }, [user]);

  // ✅ LOGIN
  const login = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google"
    });
  };

  // ✅ LOGOUT
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMessages([]);
  };

  // 🔥 SEND MESSAGE
  const send = async (customText) => {
    const messageToSend = customText || input;
    if (!messageToSend.trim()) return;

    // show user message immediately
    setMessages(prev => [...prev, { text: messageToSend, sender: "user" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:3000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: messageToSend,
          user_id: user?.id || null
        })
      });

      const data = await res.json();

      setMessages(prev => [
        ...prev,
        { text: data.reply, sender: "bot" }
      ]);

    } catch {
      setMessages(prev => [
        ...prev,
        { text: "⚠️ Server error", sender: "bot" }
      ]);
    }

    setLoading(false);
  };

  return (
    <div style={styles.page}>
      <div style={styles.chatContainer}>

        {/* HEADER */}
        <div style={styles.header}>
          <div>Customer Support</div>

          {!user && (
            <div style={styles.loginIcon} onClick={login}>
              <img
                src="https://developers.google.com/identity/images/g-logo.png"
                style={{ width: "20px", height: "20px" }}
              />
            </div>
          )}

          {user && (
            <div style={styles.userSection}>
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} style={styles.avatar} />
              ) : (
                <div style={styles.fallbackAvatar}>
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
              )}

              <button style={styles.logoutBtn} onClick={logout}>
                Logout
              </button>
            </div>
          )}
        </div>

        {/* CHAT */}
        <div style={styles.chatBox}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                ...styles.messageRow,
                justifyContent: m.sender === "user" ? "flex-end" : "flex-start"
              }}
            >
              {m.sender === "bot" && <div>🤖</div>}

              <div
                style={{
                  ...styles.message,
                  background:
                    m.sender === "user"
                      ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                      : "#1f2937"
                }}
              >
                {m.text}
              </div>
            </div>
          ))}

          {loading && <div style={styles.typing}>Typing...</div>}

          {/* QUICK BUTTONS */}
          <div style={styles.quickActions}>
            <button onClick={() => send("Track my order")}>📦 Track</button>
            <button onClick={() => send("Refund request")}>↩️ Refund</button>
            <button onClick={() => send("Account help")}>👤 Account</button>
            <button onClick={() => send("Talk to human")}>💬 Human</button>
          </div>

          <div ref={chatEndRef}></div>
        </div>

        {/* INPUT */}
        <div style={styles.inputArea}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button style={styles.sendBtn} onClick={() => send()}>
            ➤
          </button>
        </div>

        <div style={styles.footer}>
          Powered by AI
        </div>
      </div>
    </div>
  );
}

// 🎨 STYLES
const styles = {
  page: {
    background: "#0f172a",
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Arial"
  },

  chatContainer: {
    width: "400px",
    height: "600px",
    background: "#111827",
    borderRadius: "20px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },

  header: {
    padding: "12px 15px",
    color: "white",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #222"
  },

  loginIcon: {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    background: "white",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    cursor: "pointer"
  },

  userSection: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },

  avatar: {
    width: "34px",
    height: "34px",
    borderRadius: "50%"
  },

  fallbackAvatar: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    color: "white",
    background: "linear-gradient(135deg,#6366f1,#8b5cf6)"
  },

  logoutBtn: {
    background: "#ef4444",
    border: "none",
    color: "white",
    padding: "6px 10px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "12px"
  },

  chatBox: {
    flex: 1,
    padding: "15px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px"
  },

  messageRow: {
    display: "flex",
    gap: "8px"
  },

  message: {
    padding: "10px 14px",
    borderRadius: "16px",
    maxWidth: "70%",
    color: "white"
  },

  typing: {
    color: "#9ca3af",
    fontSize: "12px"
  },

  quickActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px"
  },

  inputArea: {
    display: "flex",
    padding: "10px",
    borderTop: "1px solid #222"
  },

  input: {
    flex: 1,
    padding: "10px",
    borderRadius: "10px",
    border: "none",
    background: "#1f2937",
    color: "white"
  },

  sendBtn: {
    marginLeft: "8px",
    padding: "10px",
    borderRadius: "10px",
    border: "none",
    background: "#6366f1",
    color: "white",
    cursor: "pointer"
  },

  footer: {
    textAlign: "center",
    fontSize: "12px",
    color: "#6b7280",
    padding: "8px"
  }
};
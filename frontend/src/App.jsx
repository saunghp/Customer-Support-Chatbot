import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

const API = "https://backend-jb86.onrender.com";

// ✅ FIX: Simple inline delete button — removes broken NativeDelete import
function DeleteButton({ onDelete }) {
  return (
    <button
      style={{
        background: "transparent",
        border: "none",
        color: "#ef4444",
        cursor: "pointer",
        fontSize: "14px",
        marginLeft: "8px",
        flexShrink: 0
      }}
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      title="Delete chat"
    >
      🗑
    </button>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [serverReady, setServerReady] = useState(false);

  const [conversations, setConversations] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);

  const [labels, setLabels] = useState({
    track: "📦 Track",
    refund: "↩️ Refund",
    account: "👤 Account",
    human: "💬 Human"
  });

  const [lastUserText, setLastUserText] = useState("");

  const chatEndRef = useRef(null);

  // Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // WAKE UP RENDER ON APP LOAD
  useEffect(() => {
    const wakeUp = async () => {
      try {
        setMessages([{
          text: "⏳ Connecting to server, please wait...",
          sender: "bot"
        }]);

        await fetch(`${API}/`);

        setServerReady(true);
        setMessages([{
          text: "Hi there! 👋 I'm Aria, your virtual support assistant.",
          sender: "bot"
        }]);
      } catch {
        setMessages([{
          text: "⚠️ Server is waking up, please try again in 30 seconds.",
          sender: "bot"
        }]);
      }
    };

    wakeUp();
  }, []);

  // AUTH
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_, session) => setUser(session?.user || null)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Load conversations when user logs in
  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  const loadConversations = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.log(error.message);
      return;
    }

    setConversations(data || []);
  };

  const loadMessages = async (id) => {
    setCurrentChat(id);

    const { data, error } = await supabase
      .from("chat_history")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.log(error.message);
      return;
    }

    setMessages(
      (data || []).map(m => ({
        text: m.message,
        sender: m.sender
      }))
    );
  };

  // DELETE CHAT
  const deleteChat = async (id) => {
    try {
      await supabase.from("chat_history").delete().eq("conversation_id", id);
      await supabase.from("conversations").delete().eq("id", id);

      setConversations(prev => prev.filter(c => c.id !== id));

      if (currentChat === id) {
        setMessages([
          {
            text: "Hi there! 👋 I'm Aria, your virtual support assistant.",
            sender: "bot"
          }
        ]);
        setCurrentChat(null);
      }
    } catch (err) {
      console.log("Delete failed:", err);
    }
  };

  // LOAD CHAT HISTORY on login
  useEffect(() => {
    if (!user) return;

    supabase
      .from("chat_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setMessages([
            {
              text: "Hi there! 👋 I'm Aria, your virtual support assistant.",
              sender: "bot"
            }
          ]);
          return;
        }

        setMessages(
          data.map(msg => ({
            text: msg.message,
            sender: msg.sender
          }))
        );
      });
  }, [user]);

  // LOGIN
  const login = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };

  // LOGOUT
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMessages([{
      text: "Hi there! 👋 I'm Aria, your virtual support assistant.",
      sender: "bot"
    }]);
    setConversations([]);
    setCurrentChat(null);
  };

  // LABELS
  const generateLabels = async (text) => {
    try {
      const res = await fetch(`${API}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      if (data?.track) setLabels(data);

    } catch {
      console.log("Label failed");
    }
  };

  // SEND MESSAGE
  const send = async (customText) => {
    const messageToSend = customText || input;
    if (!messageToSend.trim()) return;

    if (!serverReady) {
      setMessages(prev => [...prev, {
        text: "⏳ Server is still waking up, please wait a moment...",
        sender: "bot"
      }]);
      return;
    }

    setLastUserText(messageToSend);
    generateLabels(messageToSend);

    setMessages(prev => [
      ...prev,
      { text: messageToSend, sender: "user" }
    ]);

    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: messageToSend,
          user_id: user?.id,
          conversation_id: currentChat
        })
      });

      if (!res.ok) throw new Error();

      const data = await res.json();

      if (data?.conversation_id && !currentChat) {
        setCurrentChat(data.conversation_id);
        loadConversations();
      }

      setMessages(prev => [
        ...prev,
        { text: data?.reply || "⚠️ Empty response", sender: "bot" }
      ]);

    } catch (err) {
      console.error("Frontend error:", err);

      setMessages(prev => [
        ...prev,
        { text: "⚠️ Server error. Please try again.", sender: "bot" }
      ]);
    }

    setLoading(false);
  };

  return (
    <div style={styles.page}>
      {/* SIDEBAR */}
      <div style={styles.sidebar}>
        <h3 style={{ color: "white", margin: "0 0 10px 0" }}>Chats</h3>

        <button
          style={styles.newChatBtn}
          onClick={() => {
            setMessages([
              {
                text: "Hi there! 👋 I'm Aria, your virtual support assistant.",
                sender: "bot"
              }
            ]);
            setCurrentChat(null);
          }}
        >
          ＋ New Chat
        </button>

        <div style={styles.chatList}>
          {conversations.map(c => (
            <div key={c.id} style={styles.chatItem}>
              <div
                onClick={() => loadMessages(c.id)}
                style={{ flex: 1, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {c.title}
              </div>

              <DeleteButton onDelete={() => deleteChat(c.id)} />
            </div>
          ))}
        </div>

        <div style={styles.sidebarBottom}>
          {user ? (
            <button style={styles.logoutBtn} onClick={logout}>
              Logout
            </button>
          ) : (
            <button style={styles.loginBtn} onClick={login}>
              Login with Google
            </button>
          )}
        </div>
      </div>

      {/* CHAT */}
      <div style={styles.chatContainer}>
        <div style={styles.header}>
          <span>Customer Support</span>

          {user ? (
            <div style={styles.userSection}>
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} style={styles.avatar} alt="avatar" />
              ) : (
                <div style={styles.fallbackAvatar}>
                  {user.email?.[0]?.toUpperCase() || "U"}
                </div>
              )}
            </div>
          ) : (
            <button onClick={login} style={styles.headerLoginBtn}>Login</button>
          )}
        </div>

        <div style={styles.chatBox}>
          {messages.map((m, i) => (
            <div key={i} style={{
              ...styles.messageRow,
              justifyContent: m.sender === "user" ? "flex-end" : "flex-start"
            }}>
              {m.sender === "bot" && (
                <div style={styles.botAvatar}>🤖</div>
              )}
              <div style={{
                ...styles.message,
                background: m.sender === "user"
                  ? "#6366f1"
                  : "#1f2937"
              }}>
                {m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ color: "#9ca3af", fontSize: "13px", paddingLeft: "8px" }}>
              Aria is typing...
            </div>
          )}

          <div style={styles.quickActions}>
            <button style={styles.quickBtn} onClick={() => send("Track my order")}>{labels.track}</button>
            <button style={styles.quickBtn} onClick={() => send("Refund request")}>{labels.refund}</button>
            <button style={styles.quickBtn} onClick={() => send("Account help")}>{labels.account}</button>
            <button style={styles.quickBtn} onClick={() => send("Talk to human")}>{labels.human}</button>
          </div>

          <div ref={chatEndRef}></div>
        </div>

        <div style={styles.inputArea}>
          <input
            style={styles.input}
            value={input}
            placeholder="Type a message..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button style={styles.sendBtn} onClick={() => send()}>➤</button>
        </div>
      </div>
    </div>
  );
}

// STYLES
const styles = {
  page: {
    display: "flex",
    height: "100vh",
    background: "#0f172a",
    fontFamily: "sans-serif"
  },
  sidebar: {
    width: "230px",
    height: "100vh",
    background: "#020617",
    display: "flex",
    flexDirection: "column",
    padding: "10px",
    boxSizing: "border-box",
    overflow: "hidden"
  },
  newChatBtn: {
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #1f2937",
    background: "linear-gradient(135deg,#1e293b,#0f172a)",
    color: "white",
    fontWeight: "500",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    cursor: "pointer",
    transition: "all 0.2s ease"
  },
  chatList: {
    flex: 1,
    overflowY: "auto",
    marginTop: "10px",
    paddingRight: "4px"
  },
  chatItem: {
    width: "100%",
    padding: "10px",
    marginBottom: "6px",
    borderRadius: "8px",
    background: "#1f2937",
    color: "white",
    cursor: "pointer",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "13px"
  },
  sidebarBottom: {
    marginTop: "auto",
    borderTop: "1px solid #1f2937",
    paddingTop: "8px"
  },
  logoutBtn: {
    width: "100%",
    background: "#ef4444",
    border: "none",
    color: "white",
    padding: "10px",
    borderRadius: "8px",
    cursor: "pointer"
  },
  loginBtn: {
    width: "100%",
    background: "#6366f1",
    border: "none",
    color: "white",
    padding: "10px",
    borderRadius: "8px",
    cursor: "pointer"
  },
  chatContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px",
    background: "#111827",
    color: "white",
    flexShrink: 0,
    fontWeight: "600"
  },
  userSection: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  avatar: {
    width: "30px",
    height: "30px",
    borderRadius: "50%"
  },
  fallbackAvatar: {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    color: "white",
    background: "linear-gradient(135deg,#6366f1,#8b5cf6)"
  },
  headerLoginBtn: {
    background: "#6366f1",
    border: "none",
    color: "white",
    padding: "6px 14px",
    borderRadius: "8px",
    cursor: "pointer"
  },
  chatBox: {
    flex: 1,
    padding: "20px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  messageRow: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end"
  },
  botAvatar: {
    fontSize: "20px",
    flexShrink: 0
  },
  message: {
    padding: "10px 14px",
    borderRadius: "16px",
    maxWidth: "70%",
    color: "white",
    fontSize: "14px",
    lineHeight: "1.5"
  },
  quickActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px"
  },
  quickBtn: {
    padding: "8px 14px",
    borderRadius: "20px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "white",
    cursor: "pointer",
    fontSize: "13px"
  },
  inputArea: {
    display: "flex",
    padding: "10px",
    borderTop: "1px solid #222",
    background: "#0f172a",
    flexShrink: 0
  },
  input: {
    flex: 1,
    padding: "10px",
    borderRadius: "10px",
    border: "none",
    background: "#1f2937",
    color: "white",
    fontSize: "14px",
    outline: "none"
  },
  sendBtn: {
    marginLeft: "8px",
    padding: "10px 14px",
    borderRadius: "10px",
    border: "none",
    background: "#6366f1",
    color: "white",
    cursor: "pointer",
    fontSize: "16px"
  }
};
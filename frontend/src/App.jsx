import { NativeDelete } from "@/components/delete-button" // ✅ named import
import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);

  // 🔥 AI LABELS
  const [labels, setLabels] = useState({
    track: "📦 Track",
    refund: "↩️ Refund",
    account: "👤 Account",
    human: "💬 Human"
  });

  // 🔥 LANGUAGE CONTEXT
  const [lastUserText, setLastUserText] = useState("");

  const chatEndRef = useRef(null);

  // 🔽 Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ✅ AUTH
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_, session) => setUser(session?.user || null)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // ✅ Load conversations
  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  const loadConversations = async () => {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setConversations(data || []);
  };

  const loadMessages = async (id) => {
    setCurrentChat(id);

    const { data } = await supabase
      .from("chat_history")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    setMessages(
      data.map(m => ({
        text: m.message,
        sender: m.sender
      }))
    );
  };

  // 🔥 DELETE CHAT (FIXED POSITION)
  const deleteChat = async (id) => {
  try {
    await supabase
      .from("chat_history")
      .delete()
      .eq("conversation_id", id);

    await supabase
      .from("conversations")
      .delete()
      .eq("id", id);

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

  // ✅ LOAD CHAT HISTORY
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

  // ✅ LOGIN
  const login = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };

  // ✅ LOGOUT
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMessages([]);
  };

  // 🔥 AI LABELS
  const generateLabels = async (text) => {
    try {
      const res = await fetch("http://localhost:3000/translate-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const data = await res.json();
      if (data.track) setLabels(data);

    } catch {
      console.log("Label translation failed");
    }
  };

  // 🔥 SEND MESSAGE
  const send = async (customText) => {
    const messageToSend = customText || input;
    if (!messageToSend.trim()) return;

    setLastUserText(messageToSend);
    generateLabels(messageToSend);

    setMessages(prev => [
      ...prev,
      { text: messageToSend, sender: "user" }
    ]);

    setInput("");
    setLoading(true);

    try {
      const res = await fetch("https://backend-jb86.onrender.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageToSend,
          user_id: user?.id,
          conversation_id: currentChat
        })
      });

      const data = await res.json();

      if (data.conversation_id && !currentChat) {
        setCurrentChat(data.conversation_id);
        loadConversations();
      }

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
      {/* SIDEBAR */}
      <div style={styles.sidebar}>
        <h3>Chats</h3>

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
          <span style={{ fontSize: "18px" }}>＋</span>
          <span>New Chat</span>
        </button>

        <div style={styles.chatList}>
          {conversations.map(c => (
            <div key={c.id} style={styles.chatItem}>
              
              <div
                onClick={() => loadMessages(c.id)}
                style={{ 
                  flex: 1,
                  cursor: "pointer",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                 }}
              >
                {c.title}
              </div>

              <div style={{ transform: "scale(0.75)" }}>
                <NativeDelete
                  size="sm"
                  showIcon={true}
                  buttonText=""
                  confirmText=""
                  onConfirm={() => {}}
                  onDelete={() => deleteChat(c.id)}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={styles.sidebarBottom}>
          <button style={styles.logoutBtn} onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {/* MAIN CHAT */}
      <div style={styles.chatContainer}>
        <div style={styles.header}>
            <div>Customer Support</div>

            <div style={styles.headerRight}>
              {!user && (
                <div style={styles.loginIcon} onClick={login}>
                  <img
                    src="https://developers.google.com/identity/images/g-logo.png"
                    style={{ width: 20 }}
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
                </div>
              )}
            </div>
          </div>

        <div style={styles.chatBox}>
          {messages.map((m, i) => (
            <div key={i} style={{
              ...styles.messageRow,
              justifyContent: m.sender === "user" ? "flex-end" : "flex-start"
            }}>
              {m.sender === "bot" && <div>🤖</div>}

              <div style={{
                ...styles.message,
                background: m.sender === "user"
                  ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                  : "#1f2937"
              }}>
                {m.text}
              </div>
            </div>
          ))}

          {loading && <div>Typing...</div>}

          <div style={styles.quickActions}>
            <button onClick={() => send("Track my order")}>{labels.track}</button>
            <button onClick={() => send("Refund request")}>{labels.refund}</button>
            <button onClick={() => send("Account help")}>{labels.account}</button>
            <button onClick={() => send("Talk to human")}>{labels.human}</button>
          </div>

          <div ref={chatEndRef}></div>
        </div>

        <div style={styles.inputArea}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            style={styles.sendBtn}
            onClick={send}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

// 🎨 STYLES
const styles = {
 page: {
    display: "flex",
    height: "100vh",
    background: "#0f172a"
  },
  chatList: {
    flex: 1,
    overflowY: "auto",
    marginTop: "10px",
    paddingRight: "4px" // smoother scroll
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

sidebarBottom: {
  marginTop: "auto",
  borderTop: "1px solid #1f2937",
  paddingTop: "8px"
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
  position: "relative"
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
  flexShrink: 0
},


headerRight: {
  display: "flex",
  alignItems: "center"
},

chatBox: {
  flex: 1,
  overflowY: "auto",
  padding: "20px"
},
newChatBtn: {
  width: "100%",            
  padding: "10px",
  background: "#6366f1",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginBottom: "10px"
},

input: {
  flex: 1,
  padding: "10px"
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

logoutBtn: {
  width: "100%",         
  background: "#ef4444",
  border: "none",
  color: "white",
  padding: "10px",
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
  gap: "8px"
},

message: {
  padding: "10px 14px",
  borderRadius: "16px",
  maxWidth: "70%",
  color: "white"
},

typing: {
  display: "flex",
  gap: "5px"
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
deleteBtn: {
  background: "transparent",
  border: "none",
  color: "#ef4444",
  cursor: "pointer",
  fontSize: "14px",
  marginLeft: "8px"
},

footer: {
  textAlign: "center",
  fontSize: "11px",
  color: "#6b7280",
  padding: "8px"
}
};
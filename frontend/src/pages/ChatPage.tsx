import { useEffect, useState, useCallback, useRef } from "react";
import { safeJson } from "../lib/api";
import { AuthContext } from "../App";
import { useContext } from "react";

interface Conversation {
  id: string;
  type: string;
  otherUsers: Array<{ userId: string; userName: string; userEmail: string; userRole: string }>;
  lastMessage: {
    id: string;
    senderId: string;
    content: string;
    createdAt: string;
    senderName: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  leadId: string | null;
  status: string;
  createdAt: string;
  senderName: string;
  senderRole: string;
}

interface OnlineUser {
  userId: string;
  userName: string;
  role: string;
}

export default function ChatPage() {
  const { user } = useContext(AuthContext);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [allAgents, setAllAgents] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations", { credentials: "include" });
      const data = await safeJson(res);
      setConversations(data.conversations || []);
    } catch {}
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { credentials: "include" });
      const data = await safeJson(res);
      setAllAgents(data.users || []);
    } catch {}
  }, []);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/online", { credentials: "include" });
      const data = await safeJson(res);
      if (data.online) setOnlineUsers(data.online);
    } catch {}
  }, []);

  useEffect(() => { fetchConversations(); fetchAgents(); fetchOnlineUsers(); }, [fetchConversations, fetchAgents, fetchOnlineUsers]);

  // Poll online status every 15s via REST (covers agents with active sessions)
  useEffect(() => {
    const interval = setInterval(fetchOnlineUsers, 15000);
    return () => clearInterval(interval);
  }, [fetchOnlineUsers]);

  // WebSocket connection — cookie is httpOnly, so token comes from query OR backend reads cookie
  useEffect(() => {
    if (!user) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // No token in URL — backend accepts crm_token cookie on /ws/chat
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;

    let socket: WebSocket | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      try {
        socket = new WebSocket(wsUrl);
        socket.onopen = () => { setWs(socket); };
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "message") {
              fetchConversations();
              if (selectedConv && data.message?.conversationId === selectedConv.id) {
                setMessages((prev) => [...prev, data.message]);
              }
            }
          } catch {}
        };
        socket.onclose = () => {
          if (closed) return;
          retryTimer = setTimeout(connect, 3000);
        };
      } catch {}
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try { socket?.close(); } catch {}
      setWs(null);
    };
  }, [user, fetchConversations, selectedConv]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`, { credentials: "include" });
      const data = await safeJson(res);
      setMessages(data.messages || []);

      // Mark as read
      await fetch(`/api/chat/conversations/${convId}/read`, {
        method: "POST",
        credentials: "include",
      });
      fetchConversations();
    } catch {}
  }, [fetchConversations]);

  const selectConversation = (conv: Conversation) => {
    setSelectedConv(conv);
    fetchMessages(conv.id);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv) return;
    const content = newMessage.trim();
    setNewMessage("");

    try {
      const res = await fetch(`/api/chat/conversations/${selectedConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      const data = await safeJson(res);
      if (data.message) {
        setMessages(prev => [...prev, data.message]);
      }
      fetchConversations();
    } catch {}
  };

  const startConversation = async (agentId: string) => {
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ participantId: agentId }),
      });
      const data = await safeJson(res);
      if (data.conversation) {
        fetchConversations();
        const conv = conversations.find(c => c.id === data.conversation.id);
        if (conv) {
          selectConversation(conv);
        } else {
          // Refetch and select
          setTimeout(() => {
            fetchConversations().then(() => {
              // Will be selected on next render
            });
          }, 500);
        }
      }
    } catch {}
  };

  const isOnline = (userId: string) => onlineUsers.some(u => u.userId === userId);

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  const formatLastSeen = (iso: string) => {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      if (diff < 60000) return "Just now";
      if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return new Date(iso).toLocaleDateString();
    } catch { return ""; }
  };

  // Filter agents not in conversations
  const agentsWithoutConv = allAgents.filter(a =>
    a.role === "AGENT" && !conversations.some(c =>
      c.otherUsers.some(o => o.userId === a.id)
    )
  );

  const filteredAgents = agentsWithoutConv.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Left sidebar - Conversations */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Chat</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Existing conversations */}
              {conversations.map((conv) => {
                const other = conv.otherUsers[0];
                if (!other) return null;
                return (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      selectedConv?.id === conv.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                          {other.userName.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                          isOnline(other.userId) ? "bg-green-500" : "bg-gray-300"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-gray-900 truncate">{other.userName}</span>
                          {conv.lastMessage && (
                            <span className="text-xs text-gray-400">{formatTime(conv.lastMessage.createdAt)}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-xs text-gray-500 truncate">
                            {conv.lastMessage?.content || "No messages yet"}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {isOnline(other.userId) ? "Online" : `Last seen ${formatLastSeen(conv.updatedAt)}`}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Agents without conversations */}
              {filteredAgents.length > 0 && (
                <div className="px-4 py-2">
                  <p className="text-xs font-medium text-gray-400 uppercase">Start new conversation</p>
                </div>
              )}
              {filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => startConversation(agent.id)}
                  className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-sm">
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                        isOnline(agent.id) ? "bg-green-500" : "bg-gray-300"
                      }`} />
                    </div>
                    <div>
                      <span className="font-medium text-sm text-gray-900">{agent.name}</span>
                      <p className="text-xs text-gray-400">{isOnline(agent.id) ? "Online" : "Offline"}</p>
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right side - Conversation */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedConv ? (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                  {selectedConv.otherUsers[0]?.userName?.charAt(0).toUpperCase()}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                  isOnline(selectedConv.otherUsers[0]?.userId) ? "bg-green-500" : "bg-gray-300"
                }`} />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">{selectedConv.otherUsers[0]?.userName}</p>
                <p className="text-xs text-gray-500">
                  {isOnline(selectedConv.otherUsers[0]?.userId) ? "Online" : "Offline"}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.senderId === user?.id ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-md px-4 py-2 rounded-2xl ${
                    msg.senderId === user?.id
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-white text-gray-900 border border-gray-200 rounded-bl-sm"
                  }`}>
                    <p className="text-sm">{msg.content}</p>
                    <div className={`flex items-center gap-1 mt-1 ${msg.senderId === user?.id ? "justify-end" : ""}`}>
                      <span className={`text-xs ${msg.senderId === user?.id ? "text-blue-200" : "text-gray-400"}`}>
                        {formatTime(msg.createdAt)}
                      </span>
                      {msg.senderId === user?.id && (
                        <span className={`text-xs ${msg.status === "READ" ? "text-blue-200" : "text-blue-300"}`}>
                          {msg.status === "READ" ? "✓✓" : msg.status === "DELIVERED" ? "✓✓" : "✓"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-gray-200 px-6 py-3">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">Select a conversation or start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

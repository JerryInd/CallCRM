import { useEffect, useState, useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { safeJson } from "../lib/api";
import { AuthContext } from "../App";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  referenceId: string | null;
  referenceType: string | null;
  read: boolean;
  createdAt: string;
  readAt: string | null;
}

type Category = "ALL" | "MESSAGES" | "LEADS" | "FOLLOW-UPS" | "SYSTEM";

export default function NotificationsPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category>("ALL");

  // Compose modal state
  const [showCompose, setShowCompose] = useState(false);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeType, setComposeType] = useState("ADMIN_ANNOUNCEMENT");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?category=${category}`, { credentials: "include" });
      const data = await safeJson(res);
      setNotifications(data.notifications || []);
    } catch {}
    setLoading(false);
  }, [category]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        credentials: "include",
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const handleBroadcast = async () => {
    if (!composeTitle.trim() || !composeMessage.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: composeTitle.trim(),
          message: composeMessage.trim(),
          type: composeType,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setSendResult({ success: true, message: `Sent to ${data.sent} agents` });
      setComposeTitle("");
      setComposeMessage("");
      setTimeout(() => { setShowCompose(false); setSendResult(null); }, 2000);
    } catch (err: unknown) {
      setSendResult({ success: false, message: err instanceof Error ? err.message : "Failed to send" });
    }
    setSending(false);
  };

  const handleClick = (notif: Notification) => {
    markAsRead(notif.id);
    if (notif.referenceType === "CHAT" && notif.referenceId) {
      navigate("/admin/chat");
    } else if (notif.referenceType === "LEAD") {
      navigate("/admin/leads");
    } else if (notif.referenceType === "FOLLOW_UP") {
      navigate("/admin/followups");
    }
  };

  const formatTime = (iso: string) => {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      if (diff < 60000) return "Just now";
      if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return new Date(iso).toLocaleDateString();
    } catch { return ""; }
  };

  const getIcon = (type: string) => {
    const icons: Record<string, string> = {
      NEW_MESSAGE: "💬",
      NEW_LEAD: "📞",
      FOLLOW_UP_DUE: "📅",
      FOLLOW_UP_ASSIGNED: "📅",
      ADMIN_ANNOUNCEMENT: "📢",
      DEVICE_SUSPENDED: "🔐",
      DEVICE_REVOKED: "🔐",
      ACCOUNT_ACTION: "⚡",
      IMPORTANT_SYSTEM_ALERT: "⚠️",
    };
    return icons[type] || "🔔";
  };

  const categories: Category[] = ["ALL", "MESSAGES", "LEADS", "FOLLOW-UPS", "SYSTEM"];

  const notificationTypes = [
    { value: "ADMIN_ANNOUNCEMENT", label: "📢 Announcement" },
    { value: "IMPORTANT_SYSTEM_ALERT", label: "⚠️ System Alert" },
    { value: "NEW_LEAD", label: "📞 New Lead" },
    { value: "FOLLOW_UP_DUE", label: "📅 Follow-up Reminder" },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
        <div className="flex items-center gap-3">
          {notifications.some(n => !n.read) && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Mark all as read
            </button>
          )}
          <button
            onClick={() => { setShowCompose(true); setSendResult(null); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Send Notification
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              category === cat
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                  !notif.read ? "bg-blue-50/50" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">{getIcon(notif.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${!notif.read ? "text-gray-900" : "text-gray-700"}`}>
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{notif.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatTime(notif.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Send Notification</h2>

            {sendResult && (
              <div className={`mb-4 px-3 py-2 rounded-lg text-sm font-medium ${
                sendResult.success
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {sendResult.message}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={composeType}
                  onChange={(e) => setComposeType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {notificationTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={composeTitle}
                  onChange={(e) => setComposeTitle(e.target.value)}
                  placeholder="Notification title"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={composeMessage}
                  onChange={(e) => setComposeMessage(e.target.value)}
                  placeholder="Write your message..."
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>

              <p className="text-xs text-gray-500">This will be sent as an in-app notification and push notification to all active agents.</p>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowCompose(false); setSendResult(null); }}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBroadcast}
                disabled={sending || !composeTitle.trim() || !composeMessage.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send to All Agents"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

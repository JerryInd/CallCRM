import { useNavigate, useLocation } from "react-router-dom";
import { useContext, useState, useEffect, useCallback } from "react";
import { AuthContext } from "../App";
import { safeJson } from "../lib/api";
import { localMode, clearStoredUser } from "../lib/localAuth";

const NAV = [
  { path: "/admin", label: "Dashboard", icon: "dashboard" },
  { path: "/admin/leads", label: "Lead Database", icon: "leads" },
  { path: "/admin/chat", label: "Chat", icon: "chat" },
  { path: "/admin/followups", label: "Follow-ups", icon: "followups" },
  { path: "/admin/agents", label: "Agents", icon: "agents" },
  { path: "/admin/devices", label: "Devices", icon: "devices" },
  { path: "/admin/attendance", label: "Attendance", icon: "attendance" },
  { path: "/admin/responses", label: "Calling Activity", icon: "activity" },
  { path: "/admin/notifications", label: "Notifications", icon: "notifications" },
  { path: "/admin/audit", label: "Audit Logs", icon: "audit" },
  { path: "/admin/sync", label: "Sheet Sync", icon: "sync" },
  { path: "/admin/settings", label: "Settings", icon: "settings" },
];

function NavIcon({ icon }: { icon: string }) {
  const cls = "w-5 h-5";
  switch (icon) {
    case "dashboard":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-1a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5z" /></svg>;
    case "leads":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case "followups":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
    case "agents":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
    case "devices":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
    case "attendance":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case "activity":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>;
    case "audit":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    case "settings":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case "sync":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
    case "chat":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
    case "notifications":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 8.165 8.68 9 10 9h1a2 2 0 012 2v3.172c0 .53.21 1.04.59 1.41l.58.58a2 2 0 002.83 0l.58-.58c.38-.37.59-.88.59-1.41V11a2 2 0 012-2h1a2 2 0 002-2V9a2 2 0 10-4 0v.341c0 .53-.21 1.04-.59 1.41L15 17z" /></svg>;
    default:
      return null;
  }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [headerSearch, setHeaderSearch] = useState("");

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      const data = await safeJson(res);
      setUnreadCount(data.count || 0);
    } catch {}
  }, []);

  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  // Poll for unread count every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  };

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-navy-700">
        <div className="flex items-center gap-3">
          <img src="/icon.png" alt="CallCRM" className="w-9 h-9 rounded-xl object-contain" />
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">CallCRM</h1>
            <p className="text-[10px] text-slate-400">Admin Panel</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => (
          <button
            key={item.path}
            onClick={() => { navigate(item.path); setMobileOpen(false); }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors ${
              isActive(item.path)
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:bg-navy-700 hover:text-white"
            }`}
          >
            <NavIcon icon={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-navy-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user?.name?.charAt(0) || "A"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-[11px] text-slate-400">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={() => {
            if (!localMode) fetch("/api/auth/logout", { method: "POST", credentials: "include" });
            clearStoredUser();
            setUser(null);
            navigate("/login");
          }}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-navy-700 hover:text-white transition-colors flex items-center gap-3"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="hidden lg:flex w-[250px] bg-navy-900 flex-col shrink-0">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[250px] bg-navy-900 flex flex-col">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="relative hidden sm:block">
              <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && headerSearch.trim()) {
                    navigate(`/admin/leads?q=${encodeURIComponent(headerSearch.trim())}`);
                  }
                }}
                placeholder="Search leads..."
                className="pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none w-64 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/admin/notifications")} className="relative p-2 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 8.165 8.68 9 10 9h1a2 2 0 012 2v3.172c0 .53.21 1.04.59 1.41l.58.58a2 2 0 002.83 0l.58-.58c.38-.37.59-.88.59-1.41V11a2 2 0 012-2h1a2 2 0 002-2V9a2 2 0 10-4 0v.341c0 .53-.21 1.04-.59 1.41L15 17z" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.charAt(0) || "A"}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

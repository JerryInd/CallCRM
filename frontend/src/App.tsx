import { Routes, Route, Navigate } from "react-router-dom";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import AgentPage from "./pages/AgentPage";
import Settings from "./pages/Settings";
import LeadsAdmin from "./pages/LeadsAdmin";
import ResponsesAdmin from "./pages/ResponsesAdmin";
import FollowUps from "./pages/FollowUps";
import AgentsAdmin from "./pages/AgentsAdmin";
import DevicesAdmin from "./pages/DevicesAdmin";
import AttendanceAdmin from "./pages/AttendanceAdmin";
import AuditLogs from "./pages/AuditLogs";
import SyncMonitor from "./pages/SyncMonitor";
import ChatPage from "./pages/ChatPage";
import NotificationsPage from "./pages/NotificationsPage";
import AdminLayout from "./components/AdminLayout";
import { safeJson } from "./lib/api";
import { localMode, getStoredUser } from "./lib/localAuth";
import { useIdleLogout } from "./lib/useIdleLogout";

interface User {
  id: string;
  name: string;
  email: string;
  role: "SUPERADMIN" | "ADMIN" | "AGENT";
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const AuthContext = createContext<AuthContextType>({ user: null, setUser: () => {} });

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user } = useContext(AuthContext);
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={["SUPERADMIN", "ADMIN"]}>
      <AdminLayout>{children}</AdminLayout>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  const { user } = useContext(AuthContext);
  return (
    <Routes>
      <Route path="/login" element={
        user
          ? (user.role === "ADMIN" || user.role === "SUPERADMIN"
              ? <Navigate to="/admin" />
              : <LoginPage />)
          : <LoginPage />
      } />
      <Route path="/admin" element={<AdminRoute><Dashboard /></AdminRoute>} />
      <Route path="/admin/leads" element={<AdminRoute><LeadsAdmin /></AdminRoute>} />
      <Route path="/admin/responses" element={<AdminRoute><ResponsesAdmin /></AdminRoute>} />
      <Route path="/admin/followups" element={<AdminRoute><FollowUps /></AdminRoute>} />
      <Route path="/admin/agents" element={<AdminRoute><AgentsAdmin /></AdminRoute>} />
      <Route path="/admin/devices" element={<AdminRoute><DevicesAdmin /></AdminRoute>} />
      <Route path="/admin/attendance" element={<AdminRoute><AttendanceAdmin /></AdminRoute>} />
      <Route path="/admin/audit" element={<AdminRoute><AuditLogs /></AdminRoute>} />
      <Route path="/admin/sync" element={<AdminRoute><SyncMonitor /></AdminRoute>} />
      <Route path="/admin/chat" element={<AdminRoute><ChatPage /></AdminRoute>} />
      <Route path="/admin/notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><Settings /></AdminRoute>} />
      <Route path="/agent" element={<ProtectedRoute allowedRoles={["AGENT"]}><AgentPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={user?.role === "ADMIN" || user?.role === "SUPERADMIN" ? "/admin" : "/login"} />} />
    </Routes>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const handleIdleLogout = useCallback(() => setUser(null), []);
  useIdleLogout(handleIdleLogout, user?.role === "AGENT");

  useEffect(() => {
    if (localMode) {
      const stored = getStoredUser();
      if (stored) {
        setUser(stored);
        setLoading(false);
        return;
      }
    }
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.ok ? safeJson(r) : Promise.reject())
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <AppRoutes />
    </AuthContext.Provider>
  );
}

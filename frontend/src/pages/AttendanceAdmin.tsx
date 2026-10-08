import { useEffect, useState, useCallback } from "react";
import { safeJson } from "../lib/api";

interface Attendance {
  id: string;
  agentId: string;
  agentName: string;
  deviceId: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: string;
  displayStatus: string;
  totalPauseSeconds: number;
  netWorkSeconds: number;
  callsCompleted: number;
  updatedAt: string;
}

interface HistorySession {
  id: string;
  agentId: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: string;
  totalPauseSeconds: number;
  netWorkSeconds: number;
  callsCompleted: number;
  agentName: string;
}

const KPI_CARDS = [
  { key: "online", label: "Online", color: "text-green-600", bg: "bg-green-50" },
  { key: "offline", label: "Offline", color: "text-gray-500", bg: "bg-gray-50" },
  { key: "paused", label: "Paused", color: "text-yellow-600", bg: "bg-yellow-50" },
  { key: "out", label: "Out", color: "text-red-600", bg: "bg-red-50" },
] as const;

export default function AttendanceAdmin() {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showHistory, setShowHistory] = useState(false);
  const [historyAgent, setHistoryAgent] = useState<{ id: string; name: string } | null>(null);
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date());

  const fetchAttendance = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (agentFilter) params.set("agentId", agentFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (selectedDate) params.set("date", selectedDate);
    try {
      const res = await fetch(`/api/sessions/attendance?${params}`, { credentials: "include" });
      const data = await safeJson(res);
      setRecords(data.sessions || []);
    } catch {}
    if (!silent) setLoading(false);
  }, [agentFilter, statusFilter, selectedDate]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  useEffect(() => {
    const interval = setInterval(() => fetchAttendance(true), 60000);
    return () => clearInterval(interval);
  }, [fetchAttendance]);

  const kpiValues = {
    online: records.filter((r) => r.displayStatus === "ONLINE").length,
    offline: records.filter((r) => r.displayStatus === "OFFLINE").length,
    paused: records.filter((r) => r.displayStatus === "PAUSED").length,
    out: records.filter((r) => r.displayStatus === "ENDED").length,
  };

  const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
    ONLINE: { label: "Online", color: "bg-green-100 text-green-800", dot: "bg-green-500" },
    OFFLINE: { label: "Offline", color: "bg-gray-100 text-gray-500", dot: "bg-gray-400" },
    PAUSED: { label: "Paused", color: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-500" },
    ENDED: { label: "Out", color: "bg-red-100 text-red-600", dot: "bg-red-500" },
  };

  const statusBadge = (s: string) => statusConfig[s] || statusConfig.ENDED;

  const formatWorkingTime = (r: Attendance) => {
    if (r.clockInAt) {
      const end = r.clockOutAt ? new Date(r.clockOutAt).getTime() : Date.now();
      const diff = Math.floor((end - new Date(r.clockInAt).getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      return `${h}:${m.toString().padStart(2, "0")}`;
    }
    return "0:00";
  };

  const formatPauseTime = (r: Attendance) => {
    if (r.totalPauseSeconds) {
      const h = Math.floor(r.totalPauseSeconds / 3600);
      const m = Math.floor((r.totalPauseSeconds % 3600) / 60);
      return `${h}:${m.toString().padStart(2, "0")}`;
    }
    return "0:00";
  };

  const openHistory = async (agentId: string, agentName: string) => {
    setHistoryAgent({ id: agentId, name: agentName });
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const res = await fetch(`/api/sessions/attendance/history?agentId=${agentId}`, { credentials: "include" });
      const data = await safeJson(res);
      setHistorySessions(data.sessions || []);
    } catch {}
    setHistoryLoading(false);
  };

  const getCalDays = () => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  };

  const getSessionForDate = (day: number) => {
    const dateStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return historySessions.filter((s) => s.clockInAt && s.clockInAt.startsWith(dateStr));
  };

  const formatDuration = (start: string, end: string | null) => {
    const s = new Date(start + (start.endsWith("Z") || start.includes("+") ? "" : "Z")).getTime();
    const e = end ? new Date(end + (end.endsWith("Z") || end.includes("+") ? "" : "Z")).getTime() : Date.now();
    const mins = Math.floor((e - s) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monitor agent attendance and working hours.</p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CARDS.map((c) => (
          <div key={c.key} className={`${c.bg} rounded-xl border border-gray-200 p-4`}>
            <p className="text-sm font-medium text-gray-600 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{kpiValues[c.key]}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            placeholder="Search agents..."
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Online</option>
          <option value="PAUSED">Paused</option>
          <option value="ENDED">Out</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">IN Time</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Working Time</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pause Time</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Calls</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No attendance records found</td>
              </tr>
            ) : (
              records.map((r) => {
                const badge = statusBadge(r.displayStatus);
                return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                          {r.agentName?.charAt(0) || "A"}
                        </div>
                        <span className="font-medium text-gray-900">{r.agentName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{r.clockInAt ? new Date(r.clockInAt + (r.clockInAt.endsWith('Z') || r.clockInAt.includes('+') ? '' : 'Z')).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono text-xs">{formatWorkingTime(r)}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono text-xs">{formatPauseTime(r)}</td>
                    <td className="px-5 py-3 text-gray-600">{r.callsCompleted || 0}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => openHistory(r.agentId, r.agentName)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">View</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showHistory && historyAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowHistory(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{historyAgent.name}</h2>
                <p className="text-sm text-gray-500">Attendance History</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))} className="p-1 hover:bg-gray-100 rounded">&larr;</button>
                <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">{calMonth.toLocaleString("default", { month: "long", year: "numeric" })}</span>
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))} className="p-1 hover:bg-gray-100 rounded">&rarr;</button>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
              {historyLoading ? (
                <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 mb-4">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
                    ))}
                    {getCalDays().map((day, i) => {
                      if (day === null) return <div key={`empty-${i}`} />;
                      const sessions = getSessionForDate(day);
                      const hasData = sessions.length > 0;
                      const hasActive = sessions.some((s) => s.status === "ACTIVE" || s.status === "PAUSED");
                      const isToday = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` === new Date().toISOString().slice(0, 10);
                      return (
                        <div key={day} className={`relative p-1.5 rounded-lg text-center text-sm min-h-[48px] border transition-colors ${
                          isToday ? "border-blue-400 bg-blue-50" : hasData ? "border-gray-200 bg-gray-50" : "border-gray-100"
                        }`}>
                          <span className={`text-xs ${isToday ? "font-bold text-blue-600" : "text-gray-700"}`}>{day}</span>
                          {hasData && (
                            <div className="mt-0.5">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${hasActive ? "bg-green-500" : "bg-gray-400"}`} />
                              <div className="text-[9px] text-gray-500">{sessions.length} session{sessions.length > 1 ? "s" : ""}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {historySessions.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-700">All Sessions ({historySessions.length})</h3>
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {[...historySessions].reverse().map((s) => (
                          <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-xs">
                            <div>
                              <span className="font-medium text-gray-900">{new Date(s.clockInAt + (s.clockInAt.endsWith("Z") ? "" : "Z")).toLocaleDateString()}</span>
                              <span className="text-gray-500 ml-2">{new Date(s.clockInAt + (s.clockInAt.endsWith("Z") ? "" : "Z")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              {s.clockOutAt && <span className="text-gray-400"> → {new Date(s.clockOutAt + (s.clockOutAt.endsWith("Z") ? "" : "Z")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-gray-600 font-mono">{formatDuration(s.clockInAt, s.clockOutAt)}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${s.status === "ACTIVE" ? "bg-green-100 text-green-700" : s.status === "PAUSED" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>{s.status}</span>
                              <span className="text-gray-500">{s.callsCompleted || 0} calls</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

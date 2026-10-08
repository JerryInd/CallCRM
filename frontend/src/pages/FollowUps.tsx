import { useEffect, useState, useCallback, useMemo } from "react";
import { safeJson } from "../lib/api";

interface FollowUp {
  id: string;
  leadName: string;
  phone: string;
  email: string;
  agent: string;
  response: string;
  followUpDate: string;
  followUpTime: string;
  followUpStatus?: string;
  followUpAssignedTo?: string | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { firstDay, daysInMonth };
}

export default function FollowUps() {
  const today = new Date();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [currentDate, setCurrentDate] = useState(today);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { firstDay, daysInMonth } = getMonthDays(year, month);

  const monthLabel = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      const res = await fetch(`/api/leads/admin/followups?from=${startStr}&to=${endStr}`, { credentials: "include" });
      const data = await safeJson(res);
      setFollowUps(data.followUps || data.followups || []);
    } catch {}
    setLoading(false);
  }, [year, month, daysInMonth]);

  useEffect(() => { fetchFollowUps(); }, [fetchFollowUps]);

  const byDate = useMemo(() => {
    const map: Record<string, FollowUp[]> = {};
    followUps.forEach((f) => {
      if (!map[f.followUpDate]) map[f.followUpDate] = [];
      map[f.followUpDate].push(f);
    });
    return map;
  }, [followUps]);

  const calendarCells = useMemo(() => {
    const cells: { day: number | null; dateStr: string }[] = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: "" });
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, dateStr: ds });
    }
    return cells;
  }, [firstDay, daysInMonth, year, month]);

  const navigateMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const overdueCount = useMemo(() => {
    const todayStr = today.toISOString().slice(0, 10);
    return followUps.filter((f) => f.followUpDate < todayStr).length;
  }, [followUps]);

  const eventColors = ["bg-blue-100 text-blue-800", "bg-green-100 text-green-800", "bg-purple-100 text-purple-800", "bg-amber-100 text-amber-800", "bg-pink-100 text-pink-800"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Follow-ups</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage scheduled follow-ups.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView("calendar")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === "calendar" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Calendar
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              List
            </button>
          </div>
          {overdueCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {overdueCount} Overdue
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[160px] text-center">{monthLabel}</span>
          <button onClick={() => navigateMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          Today
        </button>
      </div>

      {view === "calendar" ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAYS.map((d) => (
              <div key={d} className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarCells.map((cell, i) => {
              const items = cell.dateStr ? byDate[cell.dateStr] || [] : [];
              const isToday = cell.dateStr === today.toISOString().slice(0, 10);
              return (
                <div
                  key={i}
                  className={`min-h-[100px] border-b border-r border-gray-100 p-1.5 ${!cell.day ? "bg-gray-50/50" : ""}`}
                >
                  {cell.day && (
                    <>
                      <span className={`text-xs font-medium inline-block w-6 h-6 leading-6 text-center rounded-full ${isToday ? "bg-blue-600 text-white" : "text-gray-700"}`}>
                        {cell.day}
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {items.slice(0, 3).map((item, idx) => (
                          <div
                            key={item.id}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium truncate ${eventColors[idx % eventColors.length]}`}
                            title={`${item.leadName} - ${item.response}`}
                          >
                            {item.leadName || item.response}
                          </div>
                        ))}
                        {items.length > 3 && (
                          <div className="text-[10px] text-gray-500 font-medium px-1">+{items.length - 3} more</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Response</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Follow-up Date</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : followUps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No follow-ups for this month</td>
                </tr>
              ) : (
                followUps.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{f.leadName || "-"}</td>
                    <td className="px-5 py-3 text-gray-600">{f.phone || "-"}</td>
                    <td className="px-5 py-3 text-gray-900">{f.agent}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        {f.response}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{f.followUpDate}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono text-xs">{f.followUpTime}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        f.followUpStatus === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        f.followUpStatus === 'ASSIGNED' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {f.followUpStatus === 'COMPLETED' ? 'Completed' :
                         f.followUpStatus === 'ASSIGNED' ? `Assigned${f.followUpAssignedTo ? ` to ${f.followUpAssignedTo}` : ''}` :
                         'Pending'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

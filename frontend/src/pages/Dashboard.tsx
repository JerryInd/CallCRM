import { useEffect, useState, useCallback } from "react";
import { safeJson } from "../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface Stats {
  totalAgents: number;
  agentsIn: number;
  agentsPaused: number;
  agentsOut: number;
  callsToday: number;
  responseBreakdown: Record<string, number>;
}

const KPI_CARDS = [
  { key: "totalAgents", label: "Total Agents", color: "bg-blue-500", light: "bg-blue-50 text-blue-700" },
  { key: "agentsIn", label: "Active / IN", color: "bg-green-500", light: "bg-green-50 text-green-700" },
  { key: "agentsPaused", label: "Paused", color: "bg-yellow-500", light: "bg-yellow-50 text-yellow-700" },
  { key: "agentsOut", label: "Out", color: "bg-red-500", light: "bg-red-50 text-red-700" },
] as const;

const CHART_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

const RESPONSE_LABELS: Record<string, string> = {
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  CALLBACK: "Callback",
  NO_ANSWER: "No Answer",
  WRONG_NUMBER: "Wrong Number",
  DNC: "DNC",
  CONVERTED: "Converted",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/stats?date=${selectedDate}`, { credentials: "include" });
      const data = await safeJson(res);
      setStats(data);
    } catch {}
  }, [selectedDate]);

  useEffect(() => {
    setLoading(true);
    fetchStats().finally(() => setLoading(false));
  }, [fetchStats]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const barData = stats?.responseBreakdown
    ? Object.entries(stats.responseBreakdown).map(([key, value]) => ({
        name: RESPONSE_LABELS[key] || key,
        count: value,
      }))
    : [];

  const donutData = stats?.responseBreakdown
    ? Object.entries(stats.responseBreakdown).map(([key, value]) => ({
        name: RESPONSE_LABELS[key] || key,
        value,
      }))
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here&apos;s what&apos;s happening today.</p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {KPI_CARDS.map((c) => (
              <div key={c.key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">{c.label}</span>
                  <div className={`w-2.5 h-2.5 rounded-full ${c.color}`} />
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {stats ? (stats as unknown as Record<string, number>)[c.key] ?? 0 : 0}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Calls &amp; Responses</h2>
              <div className="h-[300px]">
                {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data available</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Response Summary</h2>
              <div className="h-[300px]">
                {donutData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {donutData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data available</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { safeJson } from "../lib/api";

interface AuditEntry {
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);
    try {
      const res = await fetch(`/api/audit?${params}`, { credentials: "include" });
      const data = await safeJson(res);
      setLogs(data.logs || []);
    } catch {}
    setLoading(false);
  }, [actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const actionBadge = (action: string) => {
    const map: Record<string, string> = {
      LOGIN: "bg-blue-100 text-blue-800",
      LEAD_RESPONSE: "bg-green-100 text-green-800",
      DEVICE_APPROVE: "bg-green-100 text-green-800",
      DEVICE_REVOKE: "bg-red-100 text-red-800",
      DEVICE_REACTIVATE: "bg-yellow-100 text-yellow-800",
      CREATE_AGENT: "bg-purple-100 text-purple-800",
    };
    return map[action] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Audit Logs</h1>

      <div className="flex gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Actions</option>
          <option value="LOGIN">Login</option>
          <option value="LEAD_RESPONSE">Lead Response</option>
          <option value="DEVICE_APPROVE">Device Approve</option>
          <option value="DEVICE_REVOKE">Device Revoke</option>
          <option value="DEVICE_REACTIVATE">Device Reactivate</option>
          <option value="CREATE_AGENT">Create Agent</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-400">No audit logs found</td>
              </tr>
            ) : (
              logs.map((l, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 text-xs font-mono whitespace-nowrap">{l.timestamp ? new Date(l.timestamp).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{l.user || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionBadge(l.action)}`}>
                      {l.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate max-w-[300px]">{l.details || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

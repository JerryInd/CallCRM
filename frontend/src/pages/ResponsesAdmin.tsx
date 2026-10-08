import { useEffect, useState, useCallback } from "react";
import { safeJson } from "../lib/api";

interface Response {
  id: string;
  date: string;
  time: string;
  agent: string;
  leadName: string;
  phone: string;
  response: string;
  notes: string;
  followUpDate: string;
}

export default function ResponsesAdmin() {
  const [responses, setResponses] = useState<Response[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchResponses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("q", search);
    if (typeFilter) params.set("type", typeFilter);
    if (agentFilter) params.set("agent", agentFilter);
    try {
      const res = await fetch(`/api/leads/admin/responses?${params}`, { credentials: "include" });
      const data = await safeJson(res);
      setResponses(data.responses || []);
      setTotal(data.total || 0);
    } catch {}
    setLoading(false);
  }, [page, limit, search, typeFilter, agentFilter]);

  useEffect(() => { fetchResponses(); }, [fetchResponses]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Responses</h1>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search agent, lead, response..."
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Types</option>
        </select>
        <select
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Agents</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Response</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Follow-up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : responses.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">No responses found</td>
              </tr>
            ) : (
              responses.map((r, idx) => (
                <tr key={r.id} className={`transition-colors hover:bg-gray-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                  <td className="px-4 py-3 text-gray-600">{r.date}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{r.time}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.agent}</td>
                  <td className="px-4 py-3 text-gray-900">{r.leadName || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.phone || "-"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {r.response}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">{r.notes || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.followUpDate || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} of {total}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

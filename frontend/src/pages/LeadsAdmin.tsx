import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { safeJson } from "../lib/api";

interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  account: string | null;
  address: string | null;
  brand: string | null;
  type: string | null;
}

interface HistoryEntry {
  date: string;
  time: string;
  agent: string;
  response: string;
  notes: string;
  followUpDate: string;
  followUpTime: string;
}

export default function LeadsAdmin() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    if (brandFilter) params.set("brand", brandFilter);
    try {
      const res = await fetch(`/api/leads/admin/all?${params}`, { credentials: "include" });
      const data = await safeJson(res);
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch {}
    setLoading(false);
  }, [page, limit, search, statusFilter, brandFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleExpand = async (lead: Lead) => {
    if (expandedId === lead.id) {
      setExpandedId(null);
      setHistory([]);
      return;
    }
    setExpandedId(lead.id);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/history`, { credentials: "include" });
      const data = await safeJson(res);
      setHistory(data.history || []);
    } catch {}
    setHistoryLoading(false);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Leads</h1>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search name, phone, email..."
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
        </select>
        <select
          value={brandFilter}
          onChange={(e) => { setBrandFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Brands</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">No leads found</td>
              </tr>
            ) : (
              leads.map((lead, idx) => (
                <React.Fragment key={lead.id}>
                  <tr
                    onClick={() => handleExpand(lead)}
                    className={`cursor-pointer transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50 ${expandedId === lead.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{lead.name || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.phone || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.email || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.account || "-"}</td>
                    <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">{lead.address || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.brand || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.type || "-"}</td>
                  </tr>
                  {expandedId === lead.id && (
                    <tr key={`${lead.id}-history`}>
                      <td colSpan={7} className="px-4 py-4 bg-blue-50/30">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Response History</p>
                        {historyLoading ? (
                          <p className="text-xs text-gray-400">Loading...</p>
                        ) : history.length === 0 ? (
                          <p className="text-xs text-gray-400">No responses yet</p>
                        ) : (
                          <div className="space-y-2">
                            {history.map((h, i) => (
                              <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 text-xs">
                                <div className="flex justify-between mb-1">
                                  <span className="text-gray-500">{h.date} {h.time}</span>
                                  <span className="font-medium text-gray-700">{h.agent}</span>
                                </div>
                                <p className="font-medium text-gray-900">{h.response}</p>
                                {h.notes && <p className="text-gray-600 mt-1">{h.notes}</p>}
                                {h.followUpDate && <p className="text-blue-600 mt-1">Follow-up: {h.followUpDate} {h.followUpTime}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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

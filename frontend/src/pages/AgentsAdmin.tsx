import { useEffect, useState, useCallback } from "react";
import { safeJson } from "../lib/api";

interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  deviceCode: string | null;
  deviceStatus: string | null;
}

export default function AgentsAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("AGENT");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [createdDeviceCode, setCreatedDeviceCode] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportAgent, setReportAgent] = useState<{ id: string; name: string } | null>(null);
  const [reportSessions, setReportSessions] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date());

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents", { credentials: "include" });
      const data = await safeJson(res);
      setAgents(data.users || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const openCreate = () => {
    setEditAgent(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("AGENT");
    setError("");
    setShowModal(true);
  };

  const openEdit = (agent: Agent) => {
    setEditAgent(agent);
    setName(agent.name);
    setEmail(agent.email);
    setPassword("");
    setRole(agent.role);
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    try {
      if (editAgent) {
        const body: Record<string, string> = { id: editAgent.id, name, email };
        if (password) body.password = password;
        const res = await fetch("/api/agents", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error);
      } else {
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, email, password, role }),
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error);
        if (data.deviceCode) {
          setCreatedDeviceCode(data.deviceCode);
        }
      }
      setShowModal(false);
      fetchAgents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
    setSubmitting(false);
  };

  const handleToggleActive = async (agent: Agent) => {
    try {
      await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: agent.id, active: !agent.active }),
      });
      fetchAgents();
    } catch {}
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteConfirmName !== deleteTarget.name) return;
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await fetch("/api/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setDeleteTarget(null);
      setDeleteConfirmName("");
      fetchAgents();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed");
    }
    setDeleting(false);
  };

  const handleGenerateCode = async (agentId: string) => {
    setGeneratingFor(agentId);
    try {
      const res = await fetch("/api/agents/generate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agentId }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setCreatedDeviceCode(data.deviceCode);
      fetchAgents();
    } catch {}
    setGeneratingFor(null);
  };

  const openReport = async (agent: Agent) => {
    setReportAgent({ id: agent.id, name: agent.name });
    setShowReport(true);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/sessions/attendance/history?agentId=${agent.id}`, { credentials: "include" });
      const data = await safeJson(res);
      setReportSessions(data.sessions || []);
    } catch {}
    setReportLoading(false);
  };

  const reportCalDays = () => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  };

  const reportGetSessions = (day: number) => {
    const dateStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return reportSessions.filter((s) => s.clockInAt && s.clockInAt.startsWith(dateStr));
  };

  const reportFormatDuration = (start: string, end: string | null) => {
    const s = new Date(start + (start.endsWith("Z") || start.includes("+") ? "" : "Z")).getTime();
    const e = end ? new Date(end + (end.endsWith("Z") || end.includes("+") ? "" : "Z")).getTime() : Date.now();
    const mins = Math.floor((e - s) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="p-6 space-y-5">
      {createdDeviceCode && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">Agent created! Share this registration code with the agent:</p>
              <p className="text-2xl font-mono font-bold text-blue-700 mt-1">{createdDeviceCode}</p>
              <p className="text-xs text-blue-600 mt-1">The agent should enter this code in the CallCRM mobile app to register their device.</p>
            </div>
            <button onClick={() => setCreatedDeviceCode(null)} className="text-blue-400 hover:text-blue-600 text-sm">Dismiss</button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Agents</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add Agent
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">No agents found</td>
              </tr>
            ) : (
              agents.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-3 text-gray-600">{a.email}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.role === "SUPERADMIN" ? "bg-purple-100 text-purple-800" :
                      a.role === "ADMIN" ? "bg-blue-100 text-blue-800" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {a.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                      {a.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.role === "AGENT" ? (
                      a.deviceCode ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{a.deviceCode}</span>
                          <span className={`text-xs ${a.deviceStatus === "ACTIVE" ? "text-green-600" : a.deviceStatus === "PENDING" ? "text-yellow-600" : "text-red-600"}`}>
                            ({a.deviceStatus})
                          </span>
                          {a.role === "AGENT" && (
                            <button
                              onClick={() => handleGenerateCode(a.id)}
                              disabled={generatingFor === a.id}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              {generatingFor === a.id ? "Generating..." : "Regenerate"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleGenerateCode(a.id)}
                          disabled={generatingFor === a.id}
                          className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {generatingFor === a.id ? "Generating..." : "Generate Code"}
                        </button>
                      )
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => openReport(a)} className="text-purple-600 hover:text-purple-800 text-xs font-medium">Report</button>
                      <button onClick={() => openEdit(a)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                      {a.role !== "SUPERADMIN" && (
                        <button onClick={() => handleToggleActive(a)} className={`text-xs font-medium ${a.active ? "text-red-600 hover:text-red-800" : "text-green-600 hover:text-green-800"}`}>
                          {a.active ? "Deactivate" : "Activate"}
                        </button>
                      )}
                      {a.role !== "SUPERADMIN" && (
                        <button onClick={() => { setDeleteTarget(a); setDeleteConfirmName(""); setDeleteError(""); }} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editAgent ? "Edit Agent" : "Add Agent"}</h2>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
            <div className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editAgent ? "New password (leave blank to keep)" : "Password"}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              {!editAgent && (
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="AGENT">Agent</option>
                  <option value="ADMIN">Admin</option>
                </select>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !name || !email}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Saving..." : editAgent ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Agent</h2>
            <p className="text-sm text-gray-600 mb-4">
              Type <span className="font-semibold text-gray-900">{deleteTarget.name}</span> to confirm deletion.
            </p>
            {deleteError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{deleteError}</div>}
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder="Enter agent name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmName(""); }}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirmName !== deleteTarget.name}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete Agent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReport && reportAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReport(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{reportAgent.name}</h2>
                <p className="text-sm text-gray-500">Attendance Report</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))} className="p-1 hover:bg-gray-100 rounded">&larr;</button>
                <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">{calMonth.toLocaleString("default", { month: "long", year: "numeric" })}</span>
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))} className="p-1 hover:bg-gray-100 rounded">&rarr;</button>
              </div>
              <button onClick={() => setShowReport(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
              {reportLoading ? (
                <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 mb-4">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
                    ))}
                    {reportCalDays().map((day, i) => {
                      if (day === null) return <div key={`empty-${i}`} />;
                      const sessions = reportGetSessions(day);
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
                  {reportSessions.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-700">All Sessions ({reportSessions.length})</h3>
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {[...reportSessions].reverse().map((s) => (
                          <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-xs">
                            <div>
                              <span className="font-medium text-gray-900">{new Date(s.clockInAt + (s.clockInAt.endsWith("Z") ? "" : "Z")).toLocaleDateString()}</span>
                              <span className="text-gray-500 ml-2">{new Date(s.clockInAt + (s.clockInAt.endsWith("Z") ? "" : "Z")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              {s.clockOutAt && <span className="text-gray-400"> → {new Date(s.clockOutAt + (s.clockOutAt.endsWith("Z") ? "" : "Z")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-gray-600 font-mono">{reportFormatDuration(s.clockInAt, s.clockOutAt)}</span>
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

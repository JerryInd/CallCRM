import { useEffect, useState, useCallback } from "react";
import { safeJson } from "../lib/api";

interface Device {
  id: string;
  name: string;
  status: string;
  agentId: string | null;
  agentName: string | null;
  lastSeen: string | null;
  registrationCode: string | null;
}

interface Agent {
  id: string;
  name: string;
  email: string;
}

export default function DevicesAdmin() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [regCode, setRegCode] = useState("");
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateAgentId, setGenerateAgentId] = useState("");
  const [assignDeviceId, setAssignDeviceId] = useState<string | null>(null);
  const [assignAgentId, setAssignAgentId] = useState("");

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/devices", { credentials: "include" });
      const data = await safeJson(res);
      setDevices(data.devices || []);
    } catch {}
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents?role=AGENT", { credentials: "include" });
      const data = await safeJson(res);
      setAgents(data.users || []);
    } catch {}
  }, []);

  useEffect(() => { fetchDevices(); fetchAgents(); }, [fetchDevices, fetchAgents]);

  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [actionMenu]);

  const handleCreate = async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/devices/register-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: deviceName, agentId: selectedAgentId || undefined }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setNewDeviceId(data.deviceId);
      setRegCode(data.code);
      setNewAgentName(data.agentName || "");
      setDeviceName("");
      setShowModal(false);
      fetchDevices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
    setSubmitting(false);
  };

  const handleDelete = async (deviceId: string) => {
    setActionMenu(null);
    try {
      await fetch("/api/devices/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ deviceId }),
      });
      fetchDevices();
    } catch {}
  };

  const handleAction = async (action: string, deviceId: string, agentId?: string | null) => {
    setActionMenu(null);
    if (action === "assign") {
      fetchAgents();
      setAssignDeviceId(deviceId);
      setAssignAgentId(agentId || "");
      return;
    }
    try {
      const body = action === "force-logout" && agentId
        ? { agentId }
        : { deviceId };
      await fetch(`/api/devices/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      fetchDevices();
    } catch {}
  };

  const handleAssignConfirm = async () => {
    if (!assignDeviceId || !assignAgentId) return;
    try {
      await fetch("/api/devices/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ deviceId: assignDeviceId, agentId: assignAgentId }),
      });
    } catch {}
    setAssignDeviceId(null);
    setAssignAgentId("");
    fetchDevices();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      ACTIVE: "bg-green-100 text-green-800",
      PENDING: "bg-yellow-100 text-yellow-800",
      REVOKED: "bg-red-100 text-red-800",
    };
    return map[s] || "bg-gray-100 text-gray-500";
  };

  const handleGenerateCode = async () => {
    if (!generateAgentId) return;
    setError("");
    setSubmitting(true);
    try {
      const agent = agents.find(a => a.id === generateAgentId);
      const res = await fetch("/api/devices/register-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: `${agent?.name || "Agent"}'s Device`, agentId: generateAgentId }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setNewDeviceId(data.deviceId);
      setRegCode(data.code);
      setNewAgentName(data.agentName || "");
      setShowGenerateModal(false);
      setGenerateAgentId("");
      fetchDevices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
    setSubmitting(false);
  };

  const agentsWithoutDevice = agents.filter(a => !devices.some(d => d.agentId === a.id));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Devices</h1>
        <div className="flex gap-2">
          {agentsWithoutDevice.length > 0 && (
            <button
              onClick={() => { setShowGenerateModal(true); fetchAgents(); setGenerateAgentId(""); setError(""); }}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              Generate Code
            </button>
          )}
          <button
            onClick={() => { setShowModal(true); setRegCode(""); setNewDeviceId(""); setNewAgentName(""); setSelectedAgentId(""); fetchAgents(); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Device
          </button>
        </div>
      </div>

      {regCode && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-medium text-blue-900">Registration Code</p>
          <p className="text-2xl font-mono font-bold text-blue-700 mt-1">{regCode}</p>
          <p className="text-xs text-blue-600 mt-1">Device ID: {newDeviceId}</p>
          {newAgentName && <p className="text-xs text-blue-600">Assigned to: {newAgentName}</p>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">No devices found</td>
              </tr>
            ) : (
              devices.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                  <td className="px-4 py-3 text-gray-600">{d.agentName || d.agentId || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(d.status)}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{d.lastSeen ? new Date(d.lastSeen).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3 relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setActionMenu(actionMenu === d.id ? null : d.id); }}
                      className="text-gray-500 hover:text-gray-700 text-xs font-medium px-2 py-1 rounded hover:bg-gray-100"
                    >
                      Actions &#9662;
                    </button>
                    {actionMenu === d.id && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                        {d.status === "PENDING" && (
                          <button onClick={() => handleAction("approve", d.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-green-700">Approve</button>
                        )}
                        {d.status === "ACTIVE" && (
                          <>
                            <button onClick={() => handleAction("assign", d.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Assign Agent</button>
                            <button onClick={() => handleAction("revoke", d.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-red-700">Revoke</button>
                            <button onClick={() => handleAction("force-logout", d.id, d.agentId)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-yellow-700">Force Logout</button>
                          </>
                        )}
                        {d.status === "REVOKED" && (
                          <button onClick={() => handleAction("reactivate", d.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-green-700">Reactivate</button>
                        )}
                        <button onClick={() => handleDelete(d.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-red-700">Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {assignDeviceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Assign Agent</h2>
            <select
              value={assignAgentId}
              onChange={(e) => setAssignAgentId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
              ))}
            </select>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setAssignDeviceId(null)}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignConfirm}
                disabled={!assignAgentId}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Device</h2>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Device name (e.g. PC-001)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-3"
            >
              <option value="">No agent (assign later)</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
              ))}
            </select>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !deviceName}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Generate Code"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

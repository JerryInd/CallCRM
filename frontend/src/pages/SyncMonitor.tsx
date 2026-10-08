import { useEffect, useState, useCallback } from "react";
import { safeJson } from "../lib/api";

interface SyncStatus {
  last_sync_timestamp?: string;
  last_sync_status?: string;
  leads_checked?: string;
  leads_added?: string;
  leads_updated?: string;
  leads_removed?: string;
  responses_added?: string;
  pending_crm_to_sheet?: string;
  sync_errors?: string;
  sync_health?: string;
  error_message?: string;
}

export default function SyncMonitor() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastManualSync, setLastManualSync] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status", { credentials: "include" });
      const data = await safeJson(res);
      setStatus(data.status || null);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/now", {
        method: "POST",
        credentials: "include",
      });
      const data = await safeJson(res);
      if (data.result) {
        setLastManualSync(new Date().toLocaleTimeString());
      }
      fetchStatus();
    } catch {}
    setSyncing(false);
  };

  const healthColor = (health?: string) => {
    if (health === "HEALTHY") return "text-green-700 bg-green-50 border-green-200";
    if (health === "WARNING") return "text-yellow-700 bg-yellow-50 border-yellow-200";
    if (health === "ERROR") return "text-red-700 bg-red-50 border-red-200";
    return "text-gray-500 bg-gray-50 border-gray-200";
  };

  const formatTime = (iso?: string) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Google Sheets Sync</h1>
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Health Status */}
          <div className={`rounded-xl border p-4 ${healthColor(status?.sync_health)}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${
                status?.sync_health === "HEALTHY" ? "bg-green-500" :
                status?.sync_health === "WARNING" ? "bg-yellow-500" :
                status?.sync_health === "ERROR" ? "bg-red-500" : "bg-gray-400"
              }`} />
              <span className="font-semibold text-lg">
                Sync Health: {status?.sync_health || "UNKNOWN"}
              </span>
            </div>
            {status?.error_message && (
              <p className="mt-2 text-sm opacity-80">{status.error_message}</p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">Leads in DB</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{status?.leads_checked || "0"}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">Added</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{status?.leads_added || "0"}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">Updated</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{status?.leads_updated || "0"}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">Removed</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{status?.leads_removed || "0"}</p>
            </div>
          </div>

          {/* Detail Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700 w-1/3">Connection</td>
                  <td className="px-4 py-3 text-gray-900">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      status?.sync_health !== "ERROR" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                      {status?.sync_health !== "ERROR" ? "CONNECTED" : "DISCONNECTED"}
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">Last Successful Sync</td>
                  <td className="px-4 py-3 text-gray-900 font-mono text-xs">{formatTime(status?.last_sync_timestamp)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">Sync Interval</td>
                  <td className="px-4 py-3 text-gray-900">Every ~60 seconds (automatic)</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">Records Checked</td>
                  <td className="px-4 py-3 text-gray-900">{status?.leads_checked || "0"}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">Records Added</td>
                  <td className="px-4 py-3 text-green-600 font-medium">{status?.leads_added || "0"}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">Records Updated</td>
                  <td className="px-4 py-3 text-blue-600 font-medium">{status?.leads_updated || "0"}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">Records Removed</td>
                  <td className="px-4 py-3 text-red-600 font-medium">{status?.leads_removed || "0"}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">Pending CRM → Sheet</td>
                  <td className="px-4 py-3 text-gray-900">{status?.pending_crm_to_sheet || "0"}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">Errors</td>
                  <td className="px-4 py-3 text-gray-900">{status?.sync_errors || "0"}</td>
                </tr>
                {lastManualSync && (
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-700">Last Manual Sync</td>
                    <td className="px-4 py-3 text-gray-900">{lastManualSync}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Architecture Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Data Architecture</h3>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• <strong>Google Sheets</strong> = Authoritative Master / God Lead File</li>
              <li>• <strong>Operational DB</strong> = Fast Operational Copy + CRM Engine</li>
              <li>• <strong>Sync</strong> = Google Sheets ↔ DB every ~60 seconds</li>
              <li>• Google Sheets wins all lead-data conflicts</li>
              <li>• The operational DB provides the speed required for the CRM</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useCallback, useEffect } from "react";
import { safeJson } from "../lib/api";

export default function Settings() {
  const [tab, setTab] = useState<"sheets" | "restrictions">("sheets");

  const [sheetUrl, setSheetUrl] = useState("");
  const [saJson, setSaJson] = useState("");
  const [sheetMsg, setSheetMsg] = useState("");
  const [sheetStatus, setSheetStatus] = useState<{ connected: boolean; url: string | null; serviceAccountEmail: string | null } | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);

  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");

  const fetchSheetStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sheets/status", { credentials: "include" });
      const data = await safeJson(res);
      setSheetStatus(data);
    } catch {}
  }, []);

  useEffect(() => { fetchSheetStatus(); }, [fetchSheetStatus]);

  const handleConnectSheet = async () => {
    setSheetMsg("");
    setLoadingSheet(true);
    try {
      const res = await fetch("/api/sheets/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: sheetUrl, serviceAccount: saJson }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setSheetMsg(`Connected: ${data.title}. Share sheet with: ${data.serviceAccountEmail}`);
      setSaJson("");
      fetchSheetStatus();
    } catch (err: unknown) {
      setSheetMsg(err instanceof Error ? err.message : "Failed");
    }
    setLoadingSheet(false);
  };

  const handleAddDomain = () => {
    if (newDomain && !domains.includes(newDomain)) {
      setDomains([...domains, newDomain]);
      setNewDomain("");
    }
  };

  const handleRemoveDomain = (d: string) => {
    setDomains(domains.filter((x) => x !== d));
  };

  const tabs = [
    { key: "sheets" as const, label: "Google Sheets" },
    { key: "restrictions" as const, label: "Website Restrictions" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sheets" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Google Sheets Connection</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sheet URL</label>
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Account JSON</label>
              <textarea
                value={saJson}
                onChange={(e) => setSaJson(e.target.value)}
                placeholder="Paste service account JSON here..."
                rows={5}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <button
              onClick={handleConnectSheet}
              disabled={loadingSheet}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loadingSheet ? "Connecting..." : "Connect"}
            </button>
            {sheetMsg && (
              <div className={`text-sm px-3 py-2 rounded-lg ${sheetMsg.includes("Connected") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {sheetMsg}
              </div>
            )}
            {sheetStatus?.connected && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                Connected: {sheetStatus.url}
                {sheetStatus.serviceAccountEmail && <div className="text-xs mt-1">SA: {sheetStatus.serviceAccountEmail}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "restrictions" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Website Restrictions</h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
              placeholder="Add domain to block..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleAddDomain}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add
            </button>
          </div>
          {domains.length === 0 ? (
            <p className="text-sm text-gray-400">No restricted domains</p>
          ) : (
            <div className="space-y-2">
              {domains.map((d) => (
                <div key={d} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="text-sm text-gray-700">{d}</span>
                  <button
                    onClick={() => handleRemoveDomain(d)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

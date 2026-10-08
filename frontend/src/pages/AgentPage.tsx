import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../App";
import { safeJson } from "../lib/api";

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  account: string | null;
  address: string | null;
  brand: string | null;
  comments: string | null;
  socialTrading: string | null;
  type: string | null;
  originalDate: string | null;
  poi: string | null;
}

interface ResponseHistory {
  date: string;
  time: string;
  agent: string;
  response: string;
  notes: string;
  followUpDate: string;
  followUpTime: string;
}

interface Session {
  id: string;
  agentId: string;
  deviceId: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: string;
  totalPauseSeconds: number;
  netWorkSeconds: number;
  callsCompleted: number;
}

interface Reservation {
  id: string;
  expiresAt: string;
}

const RESPONSES = [
  "Interested", "Not Interested", "Call Back / Follow-up", "No Answer", "Busy",
  "Wrong Number", "Not Reachable / Switched Off", "Connected – Information Provided",
  "Already Purchased / Existing Customer", "Do Not Call (DNC)", "Language Barrier",
  "Invalid Number", "Appointment/Meeting Scheduled", "Sale/Conversion Completed", "Other",
];

const FOLLOWUP_RESPONSES = new Set(["Interested", "Call Back / Follow-up", "Appointment/Meeting Scheduled"]);
const NOTES_REQUIRED_RESPONSES = new Set(["Sale/Conversion Completed", "Other"]);

export default function AgentPage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState<Lead | null>(null);
  const [history, setHistory] = useState<ResponseHistory[]>([]);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [response, setResponse] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ lead: Lead; history: ResponseHistory[] }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [deviceId] = useState(() => {
    let id = localStorage.getItem("crm_device_id");
    if (!id) {
      id = "browser-" + crypto.randomUUID().slice(0, 8);
      localStorage.setItem("crm_device_id", id);
    }
    return id;
  });
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const copyToClipboard = async (text: string, field: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 1500); } catch {}
  };

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions/current", { credentials: "include" });
      if (res.ok) {
        const data = await safeJson(res);
        setSession(data.session);
        if (data.session?.status === "ACTIVE") {
          const ts = data.session.clockInAt;
          const clockIn = new Date(ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z").getTime();
          setElapsed(Math.max(0, Math.floor((Date.now() - clockIn) / 1000) - data.session.totalPauseSeconds));
        }
      }
    } catch {}
  }, []);

  const fetchNextLead = useCallback(async () => {
    if (!session || session.status !== "ACTIVE" || !deviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/leads/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ deviceId, sessionId: session.id }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        if (data.error === "No leads available") { setLead(null); return; }
        throw new Error(data.error || "Failed to load lead");
      }
      const data = await safeJson(res);
      setLead(data.lead);
      setHistory(data.history || []);
      setReservation(data.reservation);
      setResponse(""); setNotes(""); setFollowUpDate(""); setFollowUpTime("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load lead");
    } finally {
      setLoading(false);
    }
  }, [session, deviceId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  useEffect(() => {
    if (session?.status === "ACTIVE" && !lead) {
      fetchNextLead();
    }
  }, [session?.status, lead, fetchNextLead]);

  useEffect(() => {
    if (session?.status === "ACTIVE") {
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    } else if (session?.status === "PAUSED") {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [session?.status]);

  const handleClockIn = async () => {
    if (!deviceId) { setError("No device registered. Contact admin."); return; }
    try {
      const res = await fetch("/api/sessions/clock-in", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ deviceId }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setSession(data.session);
      setElapsed(0);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Clock-in failed"); }
  };

  const handlePause = async () => {
    try {
      const res = await fetch("/api/sessions/pause", { method: "POST", credentials: "include" });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setSession((s) => s ? { ...s, status: "PAUSED" } : null);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Pause failed"); }
  };

  const handleResume = async () => {
    try {
      const res = await fetch("/api/sessions/resume", { method: "POST", credentials: "include" });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setSession((s) => s ? { ...s, status: "ACTIVE" } : null);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Resume failed"); }
  };

  const handleClockOut = async () => {
    try {
      const res = await fetch("/api/sessions/clock-out", { method: "POST", credentials: "include" });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setSession(data.session);
      setLead(null);
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Clock-out failed"); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !response || !reservation) return;
    if (FOLLOWUP_RESPONSES.has(response) && (!followUpDate || !followUpTime)) { setError("Follow-up date and time required."); return; }
    if (NOTES_REQUIRED_RESPONSES.has(response) && !notes.trim()) { setError("Notes required for this response."); return; }

    setSubmitting(true); setError("");
    const submissionId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/leads/${lead.id}/response`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ response, notes: notes.trim(), followUpDate, followUpTime, submissionId, reservationId: reservation.id }),
      });
      if (!res.ok) { const data = await safeJson(res); throw new Error(data.error); }
      showToast("Response saved.");
      fetchNextLead();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Submission failed"); }
    finally { setSubmitting(false); }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setSearching(true); setSearchError(""); setSearchResults([]);
    try {
      const res = await fetch(`/api/leads/search?q=${encodeURIComponent(searchQuery.trim())}`, { credentials: "include" });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error);
      setSearchResults(data.results || []);
      if (data.results?.length === 0) setSearchError("No leads found.");
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleSearchSelect = (item: { lead: Lead; history: ResponseHistory[] }) => {
    setLead(item.lead);
    setHistory(item.history);
    setReservation(null);
    setResponse(""); setNotes(""); setFollowUpDate(""); setFollowUpTime("");
    setShowSearch(false); setSearchResults([]); setSearchQuery("");
  };

  const handleLogout = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (session && (session.status === "ACTIVE" || session.status === "PAUSED")) {
      try {
        await fetch("/api/sessions/clock-out", { method: "POST", credentials: "include" });
      } catch {}
    }
    await fetch("/api/auth/logout", { method: "POST" });
    navigate("/login");
  };

  const showFollowUp = response && FOLLOWUP_RESPONSES.has(response);
  const showNotes = response && NOTES_REQUIRED_RESPONSES.has(response);
  const isIn = session?.status === "ACTIVE";
  const isPaused = session?.status === "PAUSED";

  return (
    <div className="min-h-screen bg-gray-200 font-sans">
      {toast && <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded shadow-lg text-sm font-medium">{toast}</div>}

      {/* Header */}
      <header className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-bold">CallCRM</h1>
          <span className="text-xs text-gray-400">{user?.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isIn ? "bg-green-400" : isPaused ? "bg-yellow-400" : "bg-gray-500"}`} />
            <span className="text-xs font-medium">{isIn ? "IN" : isPaused ? "PAUSED" : "OUT"}</span>
          </div>
          <span className="text-lg font-mono font-bold text-green-400">{formatTime(elapsed)}</span>
          <span className="text-xs text-gray-400">Calls: {session?.callsCompleted || 0}</span>
          <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300">Logout</button>
        </div>
      </header>

      <div className="p-4 max-w-3xl mx-auto">
        {/* Not clocked in */}
        {!session || session.status === "ENDED" ? (
          <div className="flex flex-col items-center justify-center h-64">
            <p className="text-lg text-gray-600 mb-4">Click IN to start your shift</p>
            <button onClick={handleClockIn} className="px-8 py-3 bg-green-600 text-white text-lg font-bold rounded-lg hover:bg-green-700">IN</button>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex gap-2 mb-4 items-center">
              {isIn && <button onClick={handlePause} className="px-4 py-2 bg-yellow-500 text-white text-sm font-bold rounded hover:bg-yellow-600">PAUSE</button>}
              {isPaused && <button onClick={handleResume} className="px-4 py-2 bg-green-500 text-white text-sm font-bold rounded hover:bg-green-600">RESUME</button>}
              <button onClick={handleClockOut} className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded hover:bg-red-700">OUT</button>
              {isIn && !lead && <button onClick={fetchNextLead} disabled={loading} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:opacity-50">NEXT LEAD</button>}
              {isIn && (
                <div className="relative ml-auto">
                  <button onClick={() => { setShowSearch(!showSearch); setSearchResults([]); setSearchError(""); }} className="px-4 py-2 bg-gray-600 text-white text-sm font-bold rounded hover:bg-gray-700">SEARCH</button>
                  {showSearch && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
                      <div className="flex gap-2">
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="Phone, email, or name..." className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm" autoFocus />
                        <button onClick={handleSearch} disabled={searching} className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:opacity-50">Go</button>
                      </div>
                      {searchError && <p className="text-red-600 text-xs mt-2">{searchError}</p>}
                      {searchResults.length > 0 && (
                        <div className="mt-2 max-h-60 overflow-y-auto divide-y divide-gray-100">
                          {searchResults.map((item, i) => (
                            <button key={i} onClick={() => handleSearchSelect(item)} className="w-full text-left p-2 hover:bg-gray-50 rounded">
                              <div className="text-sm font-medium text-gray-900">{item.lead.name || "No name"}</div>
                              <div className="text-xs text-gray-500">{item.lead.phone || "-"} {item.lead.email ? `/ ${item.lead.email}` : ""}</div>
                              {item.history.length > 0 && <div className="text-[10px] text-blue-600 mt-0.5">{item.history.length} previous response{item.history.length > 1 ? "s" : ""}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-3 text-sm">{error}</div>}

            {/* Loading */}
            {loading && <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}

            {/* No leads */}
            {!loading && isIn && !lead && <div className="text-center text-gray-500 py-8">No leads available. Click NEXT LEAD.</div>}

            {/* Lead Card */}
            {!loading && lead && (
              <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-gray-700 w-24">Name:</label>
                    <span className="text-sm text-gray-900">{lead.name || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-gray-700 w-24">Phone:</label>
                    <span className="text-sm text-gray-900">{lead.phone || "-"}</span>
                    {lead.phone && <button onClick={() => copyToClipboard(lead.phone!, "phone")} className="ml-1 px-1.5 py-0.5 text-[10px] font-bold border border-blue-300 text-blue-600 rounded hover:bg-blue-50">{copiedField === "phone" ? "✓" : "COPY"}</button>}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-gray-700 w-24">Email:</label>
                    <span className="text-sm text-gray-900">{lead.email || "-"}</span>
                    {lead.email && <button onClick={() => copyToClipboard(lead.email!, "email")} className="ml-1 px-1.5 py-0.5 text-[10px] font-bold border border-blue-300 text-blue-600 rounded hover:bg-blue-50">{copiedField === "email" ? "✓" : "COPY"}</button>}
                  </div>
                  {lead.account && <div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-700 w-24">Account:</label><span className="text-sm text-gray-900">{lead.account}</span></div>}
                  {lead.address && <div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-700 w-24">Address:</label><span className="text-sm text-gray-900">{lead.address}</span></div>}
                  {lead.brand && <div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-700 w-24">Brand:</label><span className="text-sm text-gray-900">{lead.brand}</span></div>}
                  {lead.comments && <div className="flex gap-2"><label className="text-sm font-semibold text-gray-700 w-24 shrink-0">Comments:</label><p className="text-sm text-gray-600 bg-gray-50 rounded p-2 flex-1">{lead.comments}</p></div>}
                  {lead.type && <div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-700 w-24">Type:</label><span className="text-sm text-gray-900">{lead.type}</span></div>}
                  {lead.originalDate && <div className="flex items-center gap-2"><label className="text-sm font-semibold text-gray-700 w-24">Date:</label><span className="text-sm text-gray-900">{lead.originalDate}</span></div>}
                </div>

                {/* History */}
                {history.length > 0 && (
                  <div className="border-t border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Previous Responses</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {history.map((h, i) => (
                        <div key={i} className="bg-gray-50 border border-gray-200 rounded p-2 text-xs">
                          <div className="flex justify-between text-gray-500 mb-1">
                            <span>{h.date} {h.time}</span>
                            <span className="font-medium text-gray-700">{h.agent}</span>
                          </div>
                          <div className="font-medium text-gray-900">{h.response}</div>
                          {h.notes && <div className="text-gray-600 mt-1">{h.notes}</div>}
                          {h.followUpDate && <div className="text-blue-600 mt-1">Follow-up: {h.followUpDate} {h.followUpTime}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Response Form */}
                {isIn && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Call Response:</label>
                        <select value={response} onChange={(e) => { setResponse(e.target.value); setError(""); }} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500">
                          <option value="">Select a response...</option>
                          {RESPONSES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      {showFollowUp && (
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-sm font-semibold text-gray-700 mb-1">Follow-up Date:</label><input type="date" required value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
                          <div><label className="block text-sm font-semibold text-gray-700 mb-1">Follow-up Time:</label><input type="time" required value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
                        </div>
                      )}
                      {showNotes ? (
                        <div><label className="block text-sm font-semibold text-gray-700 mb-1">Notes (required):</label><textarea required rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
                      ) : response && !showFollowUp ? (
                        <div><label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional):</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
                      ) : null}
                      <button type="submit" disabled={submitting || !response} className="w-full bg-blue-600 text-white py-2.5 rounded font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
                        {submitting ? "Submitting..." : "SUBMIT RESPONSE"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

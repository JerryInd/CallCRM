import { useEffect } from "react";
import { localMode, clearStoredUser } from "./localAuth";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"] as const;

// Logs the agent out after 30 minutes without any interaction.
// Resets on pointer/keyboard/touch activity; also checks when the tab becomes visible again.
export function useIdleLogout(onLogout: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let lastActive = Date.now();
    let loggingOut = false;

    const activity = () => {
      lastActive = Date.now();
    };

    const logout = async () => {
      if (loggingOut) return;
      loggingOut = true;
      try {
        if (!localMode) await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {}
      if (localMode) clearStoredUser();
      onLogout();
    };

    const check = () => {
      if (Date.now() - lastActive >= IDLE_TIMEOUT_MS) void logout();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, activity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(check, 30_000);

    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, activity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [enabled, onLogout]);
}

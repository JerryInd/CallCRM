import { storage } from './storage';

export const BASE_URL = 'https://api.lakshmiclub.com';
export const WS_URL = 'wss://api.lakshmiclub.com';

type RefreshResult = 'ok' | 'invalid' | 'error';

let refreshPromise: Promise<RefreshResult> | null = null;

function tryRefreshToken(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshToken = await storage.getRefreshToken();
        if (!refreshToken) return 'invalid';
        const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return 'invalid';
        const data: any = await res.json().catch(() => null);
        if (!data || !data.token) return 'invalid';
        await storage.setToken(data.token);
        if (data.refreshToken) await storage.setRefreshToken(data.refreshToken);
        return 'ok';
      } catch {
        return 'error';
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function apiRequest(path: string, options: any = {}) {
  const token = await storage.getToken();
  const headers: any = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Access tokens expire after 24h — transparently refresh and retry once
  const isAuthAttempt =
    path === '/api/auth/login' || path === '/api/auth/device-login' || path === '/api/auth/refresh';
  if (response.status === 401 && !isAuthAttempt) {
    const refreshed = await tryRefreshToken();
    if (refreshed === 'ok') {
      const newToken = await storage.getToken();
      headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
      });
    } else if (refreshed === 'invalid') {
      // Refresh token rejected — session is dead, force a clean re-login
      await storage.clearAuth();
    }
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Request failed (${response.status})`;
    throw { status: response.status, message, data };
  }

  return data;
}

export const api = {
  registerDevice: (data: { deviceId: string; code: string; publicKey: string; deviceName: string }) =>
    apiRequest('/api/devices/register', { method: 'POST', body: JSON.stringify(data) }),

  deviceLogin: (data: { email: string; password: string; deviceId: string }) =>
    apiRequest('/api/auth/device-login', { method: 'POST', body: JSON.stringify(data) }),

  getCurrentSession: async () => {
    const data = await apiRequest('/api/sessions/current');
    return data.session;
  },

  createSession: async (deviceId: string) => {
    const data = await apiRequest('/api/sessions/clock-in', { method: 'POST', body: JSON.stringify({ deviceId }) });
    return data.session;
  },

  endSession: () =>
    apiRequest('/api/sessions/clock-out', { method: 'POST' }),

  pauseSession: () =>
    apiRequest('/api/sessions/pause', { method: 'POST' }),

  resumeSession: () =>
    apiRequest('/api/sessions/resume', { method: 'POST' }),

  getCurrentLead: async () => {
    const data = await apiRequest('/api/leads/current');
    return data;
  },

  getNextLead: async (deviceId: string, sessionId: string) => {
    const data = await apiRequest('/api/leads/next', {
      method: 'POST',
      body: JSON.stringify({ deviceId, sessionId }),
    });
    return data;
  },

  getLeadById: async (leadId: string) => {
    const data = await apiRequest(`/api/leads/${leadId}`);
    return data;
  },

  heartbeat: (sessionId: string) =>
    apiRequest(`/api/sessions/${sessionId}/heartbeat`, { method: 'POST' }),

  submitResponse: (leadId: string, data: any) =>
    apiRequest(`/api/leads/${leadId}/respond`, { method: 'POST', body: JSON.stringify(data) }),

  getFollowUps: () => apiRequest('/api/followups/mine'),

  getActivities: () => apiRequest('/api/leads/my/responses'),

  getProfile: () => apiRequest('/api/auth/profile'),
};

export default api;

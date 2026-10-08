import { storage } from './storage';

export const BASE_URL = 'http://192.168.1.100:8787';
export const WS_URL = 'ws://192.168.1.100:8787';

async function apiRequest(path: string, options: any = {}) {
  const token = await storage.getToken();
  const headers: any = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

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

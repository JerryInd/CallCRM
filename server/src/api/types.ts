export interface Bindings {
  DB: D1Database;
  ASSETS: { fetch: typeof fetch };
  ENVIRONMENT: string;
  JWT_SECRET: string;
  LEAD_RESERVATION: DurableObjectNamespace;
  CHAT_ROOM: DurableObjectNamespace;
  NOTIFICATION_QUEUE: Queue;
}

export interface Variables {
  user: {
    userId: string;
    name: string;
    email: string;
    role: 'SUPERADMIN' | 'ADMIN' | 'AGENT';
  };
}

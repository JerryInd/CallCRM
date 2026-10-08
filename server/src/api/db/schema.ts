import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// === AUTH / SESSION tables (D1 owns these) ===

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["SUPERADMIN", "ADMIN", "AGENT"] }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull(),
  registrationCode: text("registration_code"),
  status: text("status", { enum: ["PENDING", "ACTIVE", "REVOKED"] }).notNull().default("PENDING"),
  agentId: text("agent_id"),
  pushToken: text("push_token"),
  platform: text("platform"),
  registeredAt: text("registered_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentSessions = sqliteTable("agent_sessions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  deviceId: text("device_id").notNull(),
  clockInAt: text("clock_in_at").notNull(),
  clockOutAt: text("clock_out_at"),
  status: text("status", { enum: ["ACTIVE", "PAUSED", "ENDED"] }).notNull().default("ACTIVE"),
  totalPauseSeconds: integer("total_pause_seconds").notNull().default(0),
  netWorkSeconds: integer("net_work_seconds").notNull().default(0),
  callsCompleted: integer("calls_completed").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessionPauses = sqliteTable("session_pauses", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  agentId: text("agent_id").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  durationSeconds: integer("duration_seconds"),
  createdAt: text("created_at").notNull(),
});

// === OPERATIONAL (not CRM data) ===

export const leadReservations = sqliteTable("lead_reservations", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  agentId: text("agent_id").notNull(),
  deviceId: text("device_id").notNull(),
  sessionId: text("session_id").notNull(),
  reservedAt: text("reserved_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  status: text("status", { enum: ["ACTIVE", "COMPLETED", "EXPIRED", "RELEASED"] }).notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// === LEADS (D1 operational copy — Google Sheets is master) ===

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().unique(),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  account: text("account"),
  address: text("address"),
  brand: text("brand"),
  comments: text("comments"),
  socialTrading: text("social_trading"),
  type: text("type"),
  originalDate: text("original_date"),
  poi: text("poi"),
  leadStatus: text("lead_status"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastCalled: text("last_called"),
  lastResponse: text("last_response"),
  followUpDate: text("follow_up_date"),
  followUpTime: text("follow_up_time"),
  followUpAssignedTo: text("follow_up_assigned_to"),
  followUpStatus: text("follow_up_status", { enum: ["PENDING", "ASSIGNED", "COMPLETED"] }).default("PENDING"),
  followUpAssignedAt: text("follow_up_assigned_at"),
  dnc: integer("dnc", { mode: "boolean" }).notNull().default(false),
  conversion: text("conversion"),
  appointment: text("appointment"),
  pendingSync: integer("pending_sync", { mode: "boolean" }).notNull().default(false),
  sheetRow: integer("sheet_row"),
  lastSyncedAt: text("last_synced_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// === RESPONSES (D1 operational copy — Google Sheets Responses tab is master) ===

export const responses = sqliteTable("responses", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  phone: text("phone"),
  email: text("email"),
  agentName: text("agent_name").notNull(),
  response: text("response").notNull(),
  notes: text("notes"),
  followUpDate: text("follow_up_date"),
  followUpTime: text("follow_up_time"),
  date: text("date").notNull(),
  time: text("time").notNull(),
  pendingSync: integer("pending_sync", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

// === SYNC STATE ===

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// === CHAT ===

export const chatConversations = sqliteTable("chat_conversations", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["DIRECT", "GROUP"] }).notNull().default("DIRECT"),
  title: text("title"),
  leadId: text("lead_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chatParticipants = sqliteTable("chat_participants", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  userId: text("user_id").notNull(),
  lastReadAt: text("last_read_at"),
  muted: integer("muted", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  senderId: text("sender_id").notNull(),
  content: text("content").notNull(),
  leadId: text("lead_id"),
  status: text("status", { enum: ["SENT", "DELIVERED", "READ"] }).notNull().default("SENT"),
  createdAt: text("created_at").notNull(),
  deliveredAt: text("delivered_at"),
  readAt: text("read_at"),
});

// === NOTIFICATIONS ===

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type", { enum: [
    "NEW_MESSAGE", "NEW_LEAD", "FOLLOW_UP_DUE", "FOLLOW_UP_ASSIGNED",
    "ADMIN_ANNOUNCEMENT", "DEVICE_SUSPENDED", "DEVICE_REVOKED",
    "ACCOUNT_ACTION", "IMPORTANT_SYSTEM_ALERT"
  ]}).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  referenceId: text("reference_id"),
  referenceType: text("reference_type"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  readAt: text("read_at"),
});

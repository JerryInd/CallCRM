import { Hono } from 'hono';
import { eq, and, desc, inArray, ne } from 'drizzle-orm';
import { chatConversations, chatParticipants, chatMessages, users, agentSessions } from '../db/schema';
import { createDB } from '../db';
import { requireAuth } from '../lib/auth';
import { uuid, now } from '../lib/utils';
import { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

router.use('*', requireAuth);

// List conversations for current user
router.get('/conversations', async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);

  // Get all conversation IDs where user is a participant
  const participations = await db.select().from(chatParticipants)
    .where(eq(chatParticipants.userId, user.userId));

  const conversationIds = participations.map(p => p.conversationId);
  if (conversationIds.length === 0) return c.json({ conversations: [] });

  const conversations = await db.select().from(chatConversations)
    .where(
      conversationIds.length === 1
        ? eq(chatConversations.id, conversationIds[0])
        : inArray(chatConversations.id, conversationIds)
    );

  // For each conversation, get the other participant and last message
  const results = await Promise.all(conversations.map(async (conv) => {
    const otherParticipants = await db.select({
      userId: chatParticipants.userId,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
    }).from(chatParticipants)
      .innerJoin(users, eq(chatParticipants.userId, users.id))
      .where(eq(chatParticipants.conversationId, conv.id));

    const other = otherParticipants.filter(p => p.userId !== user.userId);

    const lastMessage = await db.select().from(chatMessages)
      .where(eq(chatMessages.conversationId, conv.id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);

    const myParticipation = participations.find(p => p.conversationId === conv.id);
    const unreadCount = await db.select().from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, conv.id),
        )
      );

    // Count messages after lastReadAt
    let unread = 0;
    if (myParticipation?.lastReadAt) {
      const allMessages = await db.select().from(chatMessages)
        .where(eq(chatMessages.conversationId, conv.id));
      unread = allMessages.filter(m =>
        m.senderId !== user.userId && m.createdAt > myParticipation.lastReadAt!
      ).length;
    } else {
      const allMessages = await db.select().from(chatMessages)
        .where(eq(chatMessages.conversationId, conv.id));
      unread = allMessages.filter(m => m.senderId !== user.userId).length;
    }

    return {
      ...conv,
      otherUsers: other,
      lastMessage: lastMessage[0] || null,
      unreadCount: unread,
    };
  }));

  return c.json({ conversations: results });
});

// Create or get existing direct conversation
router.post('/conversations', async (c) => {
  const user = c.get('user');
  const { participantId } = await c.req.json<{ participantId: string }>();
  if (!participantId) return c.json({ error: 'participantId required' }, 400);

  const db = createDB(c.env);
  const timestamp = now();

  // Check if direct conversation already exists between these two users
  const myParticipations = await db.select().from(chatParticipants)
    .where(eq(chatParticipants.userId, user.userId));

  for (const p of myParticipations) {
    const conv = await db.select().from(chatConversations)
      .where(and(eq(chatConversations.id, p.conversationId), eq(chatConversations.type, 'DIRECT')))
      .limit(1);

    if (conv[0]) {
      const otherParticipant = await db.select().from(chatParticipants)
        .where(and(
          eq(chatParticipants.conversationId, conv[0].id),
          eq(chatParticipants.userId, participantId)
        )).limit(1);

      if (otherParticipant[0]) {
        return c.json({ conversation: conv[0] });
      }
    }
  }

  // Create new conversation
  const convId = uuid();
  await db.insert(chatConversations).values({
    id: convId,
    type: 'DIRECT',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.insert(chatParticipants).values([
    { id: uuid(), conversationId: convId, userId: user.userId, createdAt: timestamp },
    { id: uuid(), conversationId: convId, userId: participantId, createdAt: timestamp },
  ]);

  return c.json({ conversation: { id: convId, type: 'DIRECT', createdAt: timestamp, updatedAt: timestamp } });
});

// Get messages for a conversation
router.get('/conversations/:id/messages', async (c) => {
  const user = c.get('user');
  const convId = c.req.param('id');
  const db = createDB(c.env);

  // Verify user is a participant
  const participation = await db.select().from(chatParticipants)
    .where(and(
      eq(chatParticipants.conversationId, convId),
      eq(chatParticipants.userId, user.userId)
    )).limit(1);

  if (!participation[0]) return c.json({ error: 'Access denied' }, 403);

  const messages = await db.select({
    id: chatMessages.id,
    conversationId: chatMessages.conversationId,
    senderId: chatMessages.senderId,
    content: chatMessages.content,
    leadId: chatMessages.leadId,
    status: chatMessages.status,
    createdAt: chatMessages.createdAt,
    deliveredAt: chatMessages.deliveredAt,
    readAt: chatMessages.readAt,
    senderName: users.name,
    senderRole: users.role,
  }).from(chatMessages)
    .innerJoin(users, eq(chatMessages.senderId, users.id))
    .where(eq(chatMessages.conversationId, convId))
    .orderBy(chatMessages.createdAt);

  return c.json({ messages });
});

// Send a message
router.post('/conversations/:id/messages', async (c) => {
  const user = c.get('user');
  const convId = c.req.param('id');
  const { content, leadId } = await c.req.json<{ content: string; leadId?: string }>();
  if (!content) return c.json({ error: 'Message content required' }, 400);

  const db = createDB(c.env);

  // Verify user is a participant
  const participation = await db.select().from(chatParticipants)
    .where(and(
      eq(chatParticipants.conversationId, convId),
      eq(chatParticipants.userId, user.userId)
    )).limit(1);

  if (!participation[0]) return c.json({ error: 'Access denied' }, 403);

  const timestamp = now();
  const msgId = uuid();

  await db.insert(chatMessages).values({
    id: msgId,
    conversationId: convId,
    senderId: user.userId,
    content,
    leadId: leadId || null,
    status: 'SENT',
    createdAt: timestamp,
  });

  await db.update(chatConversations).set({ updatedAt: timestamp })
    .where(eq(chatConversations.id, convId));

  const message = {
    id: msgId,
    conversationId: convId,
    senderId: user.userId,
    senderName: user.name,
    content,
    leadId: leadId || null,
    status: 'SENT' as const,
    createdAt: timestamp,
  };

  // Broadcast via Durable Object WebSocket — clients connect to the "global" room
  try {
    const roomId = `global`;
    const doId = c.env.CHAT_ROOM.idFromName(roomId);
    const stub = c.env.CHAT_ROOM.get(doId);
    await stub.fetch(new URL(`https://fake-host/broadcast`).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: convId,
        senderId: user.userId,
        senderName: user.name,
        message,
      }),
    });
  } catch {}

  return c.json({ message });
});

// Mark conversation as read
router.post('/conversations/:id/read', async (c) => {
  const user = c.get('user');
  const convId = c.req.param('id');
  const db = createDB(c.env);
  const timestamp = now();

  await db.update(chatParticipants)
    .set({ lastReadAt: timestamp })
    .where(and(
      eq(chatParticipants.conversationId, convId),
      eq(chatParticipants.userId, user.userId)
    ));

  // Mark unread messages from others as READ (not own messages)
  await db.update(chatMessages)
    .set({ status: 'READ', readAt: timestamp })
    .where(and(
      eq(chatMessages.conversationId, convId),
      ne(chatMessages.senderId, user.userId)
    ));

  return c.json({ success: true });
});

// Get online users — merges WebSocket presence + active session presence
router.get('/online', async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);

  // 1) WebSocket-connected users
  let wsOnline: Array<{ userId: string; userName: string; role: string }> = [];
  try {
    const roomId = `global`;
    const doId = c.env.CHAT_ROOM.idFromName(roomId);
    const stub = c.env.CHAT_ROOM.get(doId);
    const resp = await stub.fetch(new URL(`https://fake-host/presence`).toString());
    const data = await resp.json<{ online: Array<{ userId: string; userName: string; role: string }> }>();
    wsOnline = data.online || [];
  } catch {}

  // 2) Agents with active sessions (ACTIVE or PAUSED) — considered "online"
  const activeSessions = await db.select({
    agentId: agentSessions.agentId,
  }).from(agentSessions)
    .where(
      inArray(agentSessions.status, ['ACTIVE', 'PAUSED'])
    );

  const sessionAgentIds = [...new Set(activeSessions.map(s => s.agentId).filter(Boolean))] as string[];

  if (sessionAgentIds.length > 0) {
    const sessionUsers = await db.select({
      id: users.id,
      name: users.name,
      role: users.role,
    }).from(users)
      .where(inArray(users.id, sessionAgentIds));

    for (const su of sessionUsers) {
      if (!wsOnline.some(u => u.userId === su.id)) {
        wsOnline.push({ userId: su.id, userName: su.name, role: su.role });
      }
    }
  }

  return c.json({ online: wsOnline });
});

export default router;

import { createDB, type DB } from '../db';
import { devices, notifications } from '../db/schema';
import { eq } from 'drizzle-orm';

interface PushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: string;
  badge?: number;
}

export async function sendExpoPush(pushToken: string, title: string, body: string, data?: Record<string, any>): Promise<boolean> {
  const payload: PushPayload = {
    to: pushToken,
    title,
    body,
    data: data || {},
    sound: 'default',
  };

  try {
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.error('Push send failed:', resp.status);
      return false;
    }

    const result = await resp.json<any>();
    if (result.data?.status === 'error') {
      console.error('Push error:', result.data.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Push request failed:', err);
    return false;
  }
}

export async function sendPushToUser(
  db: DB,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  const userDevices = await db.select().from(devices)
    .where(eq(devices.agentId, userId));

  for (const device of userDevices) {
    if (device.pushToken && device.status === 'ACTIVE') {
      await sendExpoPush(device.pushToken, title, body, {
        ...data,
        deviceId: device.id,
      });
    }
  }
}

export async function processNotificationQueue(
  env: { DB: D1Database },
  message: any
): Promise<void> {
  const db = createDB(env);
  const { userId, type, title, message: notifMessage, referenceId, referenceType } = message.body as {
    notificationId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    referenceId?: string;
    referenceType?: string;
  };

  // Send push notification
  await sendPushToUser(db, userId, title, notifMessage, {
    type,
    referenceId,
    referenceType,
  });
}

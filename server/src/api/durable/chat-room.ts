import { DurableObject } from "cloudflare:workers";

interface ConnectedClient {
  userId: string;
  userName: string;
  role: string;
  ws: WebSocket;
}

export class ChatRoom extends DurableObject {
  private clients: Map<string, ConnectedClient> = new Map();

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      // Restore any existing Alarm
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const userId = url.searchParams.get("userId");
      const userName = url.searchParams.get("userName");
      const role = url.searchParams.get("role");
      if (!userId || !userName || !role) {
        return new Response("Missing auth params", { status: 401 });
      }

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      this.ctx.acceptWebSocket(server, [userId, userName, role]);
      this.clients.set(userId, { userId, userName, role, ws: server });

      // Broadcast presence update
      this.broadcastPresence();

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const body = await request.json<{
        senderId: string;
        senderName: string;
        message: any;
      }>();

      // Broadcast to all connected clients
      for (const [, client] of this.clients) {
        try {
          client.ws.send(JSON.stringify({
            type: "message",
            senderId: body.senderId,
            senderName: body.senderName,
            message: body.message,
          }));
        } catch {}
      }

      return Response.json({ success: true, clientCount: this.clients.size });
    }

    if (url.pathname === "/presence") {
      const onlineUsers: Array<{ userId: string; userName: string; role: string }> = [];
      for (const [, client] of this.clients) {
        onlineUsers.push({ userId: client.userId, userName: client.userName, role: client.role });
      }
      return Response.json({ online: onlineUsers });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    // Handle incoming WebSocket messages (ping/pong, typing indicators, etc.)
    try {
      const msg = JSON.parse(data as string);
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
      if (msg.type === "typing") {
        // Broadcast typing indicator to other clients
        for (const [, client] of this.clients) {
          if (client.ws !== ws) {
            try {
              client.ws.send(JSON.stringify({
                type: "typing",
                userId: msg.userId,
                userName: msg.userName,
              }));
            } catch {}
          }
        }
      }
    } catch {}
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // Remove disconnected client
    for (const [userId, client] of this.clients) {
      if (client.ws === ws) {
        this.clients.delete(userId);
        break;
      }
    }
    this.broadcastPresence();
  }

  async webSocketError(ws: WebSocket, error: any): Promise<void> {
    // Handle error - same as close
    for (const [userId, client] of this.clients) {
      if (client.ws === ws) {
        this.clients.delete(userId);
        break;
      }
    }
    this.broadcastPresence();
  }

  private broadcastPresence(): void {
    const onlineUsers: Array<{ userId: string; userName: string; role: string }> = [];
    for (const [, client] of this.clients) {
      onlineUsers.push({ userId: client.userId, userName: client.userName, role: client.role });
    }

    const payload = JSON.stringify({ type: "presence", online: onlineUsers });
    for (const [, client] of this.clients) {
      try {
        client.ws.send(payload);
      } catch {}
    }
  }
}

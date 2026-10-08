import { DurableObject } from "cloudflare:workers";

interface ReservationState {
  leadId: string;
  agentId: string;
  deviceId: string;
  sessionId: string;
  reservedAt: string;
  expiresAt: string;
  status: string;
}

export class LeadReservation extends DurableObject {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/reserve" && request.method === "POST") {
      const body = await request.json<{
        leadId: string;
        agentId: string;
        deviceId: string;
        sessionId: string;
        ttlMs?: number;
      }>();

      const existing = await this.ctx.storage.get<ReservationState>(`lead:${body.leadId}`);
      if (existing && existing.status === "ACTIVE" && new Date(existing.expiresAt).getTime() > Date.now()) {
        if (existing.agentId !== body.agentId) {
          return Response.json({ error: "Lead already reserved by another agent" }, { status: 409 });
        }
        return Response.json({ reservation: existing });
      }

      const ttlMs = body.ttlMs || 10 * 60 * 1000;
      const reservation: ReservationState = {
        leadId: body.leadId,
        agentId: body.agentId,
        deviceId: body.deviceId,
        sessionId: body.sessionId,
        reservedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        status: "ACTIVE",
      };

      await this.ctx.storage.put(`lead:${body.leadId}`, reservation);
      return Response.json({ reservation });
    }

    if (url.pathname === "/check") {
      const leadId = url.searchParams.get("leadId");
      if (!leadId) return Response.json({ error: "leadId required" }, { status: 400 });

      const reservation = await this.ctx.storage.get<ReservationState>(`lead:${leadId}`);
      if (!reservation || reservation.status !== "ACTIVE" || new Date(reservation.expiresAt).getTime() < Date.now()) {
        return Response.json({ reserved: false });
      }
      return Response.json({ reserved: true, reservation });
    }

    if (url.pathname === "/release" && request.method === "POST") {
      const { leadId, agentId } = await request.json<{ leadId: string; agentId: string }>();
      const reservation = await this.ctx.storage.get<ReservationState>(`lead:${leadId}`);
      if (reservation && reservation.agentId === agentId) {
        reservation.status = "RELEASED";
        await this.ctx.storage.put(`lead:${leadId}`, reservation);
      }
      return Response.json({ success: true });
    }

    if (url.pathname === "/complete" && request.method === "POST") {
      const { leadId, agentId } = await request.json<{ leadId: string; agentId: string }>();
      const reservation = await this.ctx.storage.get<ReservationState>(`lead:${leadId}`);
      if (reservation && reservation.agentId === agentId) {
        reservation.status = "COMPLETED";
        await this.ctx.storage.put(`lead:${leadId}`, reservation);
      }
      return Response.json({ success: true });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  async alarm(): Promise<void> {
    const entries = await this.ctx.storage.list<ReservationState>();
    for (const [key, reservation] of entries) {
      if (reservation.status === "ACTIVE" && new Date(reservation.expiresAt).getTime() < Date.now()) {
        reservation.status = "EXPIRED";
        await this.ctx.storage.put(key, reservation);
      }
    }
  }
}

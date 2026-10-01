import { endActivity, startActivity, type ApnsEnv } from "./apns";

interface Env extends ApnsEnv {
  DB: D1Database;
  API_SECRET: string;
  NOTION_WEBHOOK_SECRET?: string;
}

type Json = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function authorized(req: Request, env: Env) {
  return req.headers.get("authorization") === "Bearer " + env.API_SECRET;
}

async function registerDevice(req: Request, env: Env) {
  if (!authorized(req, env)) return json({ error: "unauthorized" }, 401);
  const body = await req.json<{ deviceId?: string; pushToStartToken?: string }>();
  if (!body.deviceId || !body.pushToStartToken) return json({ error: "deviceId and pushToStartToken required" }, 400);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO devices(device_id,push_to_start_token,updated_at) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET push_to_start_token=excluded.push_to_start_token, updated_at=excluded.updated_at"
  ).bind(body.deviceId, body.pushToStartToken, now).run();
  return json({ ok: true });
}

async function registerActivityToken(req: Request, env: Env) {
  if (!authorized(req, env)) return json({ error: "unauthorized" }, 401);
  const body = await req.json<{ notionPageId?: string; activityPushToken?: string }>();
  if (!body.notionPageId || !body.activityPushToken) return json({ error: "notionPageId and activityPushToken required" }, 400);
  await env.DB.prepare(
    "UPDATE activities SET activity_push_token=?, status='active', updated_at=? WHERE notion_page_id=?"
  ).bind(body.activityPushToken, Date.now(), body.notionPageId).run();
  return json({ ok: true });
}

function extractNotion(body: Json) {
  const data = (body.data ?? body) as Json;
  const page = (data.page ?? data) as Json;
  const properties = (page.properties ?? {}) as Json;
  const statusObj = (properties.Status ?? properties.status ?? {}) as Json;
  const status = String(((statusObj.status as Json | undefined)?.name ?? statusObj.name ?? data.status ?? ""));
  const titleProp = (properties.Name ?? properties.Title ?? properties.title ?? {}) as Json;
  const titleItems = (titleProp.title ?? []) as Json[];
  const title = String(((titleItems[0]?.plain_text ?? data.title ?? "Current Activity")));
  return {
    eventId: String(body.id ?? body.event_id ?? ""),
    pageId: String(page.id ?? data.id ?? ""),
    editedAt: String(page.last_edited_time ?? data.last_edited_time ?? ""),
    status,
    title
  };
}

async function notionWebhook(req: Request, env: Env) {
  if (env.NOTION_WEBHOOK_SECRET && req.headers.get("x-life-activities-secret") !== env.NOTION_WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  const body = await req.json<Json>();

  // Notion webhook verification sends a verification_token. Return success so the
  // deployment logs can expose it for the one-time subscription setup.
  if (typeof body.verification_token === "string") {
    console.log("NOTION_VERIFICATION_TOKEN", body.verification_token);
    return json({ ok: true, verification: "received" });
  }

  const event = extractNotion(body);
  if (!event.pageId || !event.status) return json({ ignored: true, reason: "not a task status event" });

  const eventId = event.eventId || [event.pageId, event.editedAt, event.status].join(":");
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO processed_events(event_id,notion_page_id,received_at) VALUES(?,?,?)"
  ).bind(eventId, event.pageId, Date.now()).run();
  if (!inserted.meta.changes) return json({ ok: true, duplicate: true });

  if (event.status === "In Progress") {
    const device = await env.DB.prepare(
      "SELECT device_id,push_to_start_token FROM devices ORDER BY updated_at DESC LIMIT 1"
    ).first<{ device_id: string; push_to_start_token: string }>();
    if (!device) return json({ error: "no registered device" }, 409);

    const existing = await env.DB.prepare(
      "SELECT notion_edited_at,status FROM activities WHERE notion_page_id=?"
    ).bind(event.pageId).first<{ notion_edited_at: string | null; status: string }>();
    if (existing?.notion_edited_at && event.editedAt && existing.notion_edited_at > event.editedAt) {
      return json({ ok: true, stale: true });
    }

    const startedAt = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT INTO activities(notion_page_id,device_id,title,status,notion_edited_at,started_at,updated_at) VALUES(?,?,?,'starting',?,?,?) ON CONFLICT(notion_page_id) DO UPDATE SET device_id=excluded.device_id,title=excluded.title,status='starting',notion_edited_at=excluded.notion_edited_at,started_at=excluded.started_at,updated_at=excluded.updated_at"
    ).bind(event.pageId, device.device_id, event.title, event.editedAt || null, startedAt, Date.now()).run();

    const apns = await startActivity(env, device.push_to_start_token, event.pageId, event.title, startedAt);
    return json({ ok: true, action: "start", apns });
  }

  if (event.status === "Done") {
    const activity = await env.DB.prepare(
      "SELECT title,activity_push_token,started_at,notion_edited_at,status FROM activities WHERE notion_page_id=?"
    ).bind(event.pageId).first<{ title: string; activity_push_token: string | null; started_at: number; notion_edited_at: string | null; status: string }>();
    if (!activity) return json({ ok: true, action: "none", reason: "activity not found" });
    if (activity.notion_edited_at && event.editedAt && activity.notion_edited_at > event.editedAt) {
      return json({ ok: true, stale: true });
    }
    if (!activity.activity_push_token) {
      await env.DB.prepare("UPDATE activities SET status='ending',notion_edited_at=?,updated_at=? WHERE notion_page_id=?")
        .bind(event.editedAt || null, Date.now(), event.pageId).run();
      return json({ ok: true, pendingEnd: true, reason: "waiting for activity push token" }, 202);
    }
    const apns = await endActivity(env, activity.activity_push_token, activity.title, activity.started_at);
    await env.DB.prepare("UPDATE activities SET status='ended',notion_edited_at=?,updated_at=? WHERE notion_page_id=?")
      .bind(event.editedAt || null, Date.now(), event.pageId).run();
    return json({ ok: true, action: "end", apns });
  }

  return json({ ignored: true, status: event.status });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "life-activities" });
      if (req.method === "POST" && url.pathname === "/v1/devices") return registerDevice(req, env);
      if (req.method === "POST" && url.pathname === "/v1/activity-token") return registerActivityToken(req, env);
      if (req.method === "POST" && url.pathname === "/webhooks/notion") return notionWebhook(req, env);
      return json({ error: "not found" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: error instanceof Error ? error.message : "internal error" }, 500);
    }
  }
};

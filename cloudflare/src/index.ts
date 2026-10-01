import { endActivity, startActivity, type ApnsEnv } from "./apns";

interface Env extends ApnsEnv {
  DB: D1Database;
  API_SECRET: string;
  NOTION_API_KEY: string;
  NOTION_VERIFICATION_TOKEN?: string;
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
  await env.DB.prepare(
    "INSERT INTO devices(device_id,push_to_start_token,updated_at) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET push_to_start_token=excluded.push_to_start_token, updated_at=excluded.updated_at"
  ).bind(body.deviceId, body.pushToStartToken, Date.now()).run();
  return json({ ok: true });
}

async function registerActivityToken(req: Request, env: Env) {
  if (!authorized(req, env)) return json({ error: "unauthorized" }, 401);
  const body = await req.json<{ notionPageId?: string; activityPushToken?: string }>();
  if (!body.notionPageId || !body.activityPushToken) return json({ error: "notionPageId and activityPushToken required" }, 400);

  const activity = await env.DB.prepare(
    "SELECT title,started_at,status FROM activities WHERE notion_page_id=?"
  ).bind(body.notionPageId).first<{ title: string; started_at: number; status: string }>();
  if (!activity) return json({ error: "activity not found" }, 404);

  if (activity.status === "ending") {
    const apns = await endActivity(env, body.activityPushToken, activity.title, activity.started_at);
    await env.DB.prepare(
      "UPDATE activities SET activity_push_token=?, status='ended', updated_at=? WHERE notion_page_id=?"
    ).bind(body.activityPushToken, Date.now(), body.notionPageId).run();
    return json({ ok: true, action: "end-after-token", apns });
  }

  await env.DB.prepare(
    "UPDATE activities SET activity_push_token=?, status='active', updated_at=? WHERE notion_page_id=?"
  ).bind(body.activityPushToken, Date.now(), body.notionPageId).run();
  return json({ ok: true });
}

async function verifyNotion(rawBody: string, signature: string | null, token: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const calculated = "sha256=" + Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
  if (calculated.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < calculated.length; i++) mismatch |= calculated.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

async function retrieveTask(env: Env, pageId: string) {
  const response = await fetch("https://api.notion.com/v1/pages/" + pageId, {
    headers: {
      authorization: "Bearer " + env.NOTION_API_KEY,
      "Notion-Version": "2026-03-11"
    }
  });
  if (!response.ok) throw new Error("Notion retrieve page " + response.status + ": " + await response.text());
  const page = await response.json<Json>();
  const properties = (page.properties ?? {}) as Json;
  const statusProp = (properties.Status ?? properties.status ?? {}) as Json;
  const status = String((statusProp.status as Json | undefined)?.name ?? "");

  const titleProp = (properties.Name ?? properties.Title ?? properties.title ?? {}) as Json;
  const titleItems = (titleProp.title ?? []) as Json[];
  const title = String(titleItems[0]?.plain_text ?? "Current Activity");

  return {
    status,
    title,
    editedAt: String(page.last_edited_time ?? "")
  };
}

async function notionWebhook(req: Request, env: Env) {
  const rawBody = await req.text();
  const body = JSON.parse(rawBody) as Json;

  if (typeof body.verification_token === "string") {
    console.log("NOTION_VERIFICATION_TOKEN", body.verification_token);
    return json({ ok: true, verification: "received" });
  }

  if (!env.NOTION_VERIFICATION_TOKEN) return json({ error: "NOTION_VERIFICATION_TOKEN not configured" }, 503);
  const trusted = await verifyNotion(rawBody, req.headers.get("x-notion-signature"), env.NOTION_VERIFICATION_TOKEN);
  if (!trusted) return json({ error: "invalid Notion signature" }, 401);

  if (body.type !== "page.properties_updated") return json({ ignored: true, type: body.type });

  const entity = (body.entity ?? {}) as Json;
  if (entity.type !== "page" || typeof entity.id !== "string") return json({ ignored: true, reason: "not a page event" });

  const eventId = String(body.id ?? "");
  const eventTimestamp = String(body.timestamp ?? "");
  const pageId = entity.id;
  if (!eventId) return json({ error: "event id missing" }, 400);

  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO processed_events(event_id,notion_page_id,received_at) VALUES(?,?,?)"
  ).bind(eventId, pageId, Date.now()).run();
  if (!inserted.meta.changes) return json({ ok: true, duplicate: true });

  // Webhook events are signals only; fetch the current authoritative task state.
  const task = await retrieveTask(env, pageId);
  if (task.status !== "In Progress" && task.status !== "Done") {
    return json({ ignored: true, status: task.status });
  }

  const orderingKey = task.editedAt || eventTimestamp;

  if (task.status === "In Progress") {
    const device = await env.DB.prepare(
      "SELECT device_id,push_to_start_token FROM devices ORDER BY updated_at DESC LIMIT 1"
    ).first<{ device_id: string; push_to_start_token: string }>();
    if (!device) return json({ error: "no registered device" }, 409);

    const existing = await env.DB.prepare(
      "SELECT notion_edited_at,status FROM activities WHERE notion_page_id=?"
    ).bind(pageId).first<{ notion_edited_at: string | null; status: string }>();
    if (existing?.notion_edited_at && orderingKey && existing.notion_edited_at > orderingKey) {
      return json({ ok: true, stale: true });
    }
    if (existing && ["starting", "active"].includes(existing.status) && existing.notion_edited_at === orderingKey) {
      return json({ ok: true, duplicateState: true });
    }

    const startedAt = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT INTO activities(notion_page_id,device_id,title,status,notion_edited_at,started_at,updated_at) VALUES(?,?,?,'starting',?,?,?) ON CONFLICT(notion_page_id) DO UPDATE SET device_id=excluded.device_id,title=excluded.title,status='starting',activity_push_token=NULL,notion_edited_at=excluded.notion_edited_at,started_at=excluded.started_at,updated_at=excluded.updated_at"
    ).bind(pageId, device.device_id, task.title, orderingKey || null, startedAt, Date.now()).run();

    const apns = await startActivity(env, device.push_to_start_token, pageId, task.title, startedAt);
    return json({ ok: true, action: "start", apns });
  }

  const activity = await env.DB.prepare(
    "SELECT title,activity_push_token,started_at,notion_edited_at,status FROM activities WHERE notion_page_id=?"
  ).bind(pageId).first<{ title: string; activity_push_token: string | null; started_at: number; notion_edited_at: string | null; status: string }>();
  if (!activity) return json({ ok: true, action: "none", reason: "activity not found" });
  if (activity.notion_edited_at && orderingKey && activity.notion_edited_at > orderingKey) {
    return json({ ok: true, stale: true });
  }
  if (activity.status === "ended") return json({ ok: true, duplicateState: true });

  if (!activity.activity_push_token) {
    await env.DB.prepare(
      "UPDATE activities SET status='ending',notion_edited_at=?,updated_at=? WHERE notion_page_id=?"
    ).bind(orderingKey || null, Date.now(), pageId).run();
    return json({ ok: true, pendingEnd: true, reason: "waiting for activity push token" }, 202);
  }

  const apns = await endActivity(env, activity.activity_push_token, activity.title, activity.started_at);
  await env.DB.prepare(
    "UPDATE activities SET status='ended',notion_edited_at=?,updated_at=? WHERE notion_page_id=?"
  ).bind(orderingKey || null, Date.now(), pageId).run();
  return json({ ok: true, action: "end", apns });
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

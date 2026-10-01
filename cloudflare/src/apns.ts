export interface ApnsEnv {
  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY: string;
  APPLE_BUNDLE_ID: string;
  APNS_ENVIRONMENT?: string;
}

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToBytes(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}

async function bearer(env: ApnsEnv): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = header + "." + claims;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(env.APPLE_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );
  return signingInput + "." + b64url(signature);
}

async function send(env: ApnsEnv, token: string, aps: Record<string, unknown>) {
  const host = env.APNS_ENVIRONMENT === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
  const response = await fetch(host + "/3/device/" + token, {
    method: "POST",
    headers: {
      authorization: "bearer " + await bearer(env),
      "apns-topic": env.APPLE_BUNDLE_ID + ".push-type.liveactivity",
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "content-type": "application/json"
    },
    body: JSON.stringify({ aps })
  });
  const body = await response.text();
  if (!response.ok) throw new Error("APNs " + response.status + ": " + body);
  return { status: response.status, apnsId: response.headers.get("apns-id") };
}

export function startActivity(env: ApnsEnv, token: string, pageId: string, title: string, startedAt: number) {
  return send(env, token, {
    timestamp: Math.floor(Date.now() / 1000),
    event: "start",
    "content-state": { title, startedAt },
    "attributes-type": "CurrentActivityAttributes",
    attributes: { notionPageId: pageId },
    alert: { title: "Current Activity", body: title },
    "input-push-token": 1
  });
}

export function endActivity(env: ApnsEnv, token: string, title: string, startedAt: number) {
  return send(env, token, {
    timestamp: Math.floor(Date.now() / 1000),
    event: "end",
    "content-state": { title, startedAt },
    "dismissal-date": Math.floor(Date.now() / 1000)
  });
}

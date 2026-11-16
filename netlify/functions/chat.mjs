const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed. Use POST." });

  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Server is missing DIFY_API_KEY. Add it in Netlify environment variables and redeploy." });
  }
  const baseUrl = (process.env.DIFY_BASE_URL || "https://api.dify.ai/v1").replace(/\/+$/, "");

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON." });
  }

  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!query) return json(400, { error: "The 'query' field is required." });

  const callDify = (conversationId) =>
    fetch(`${baseUrl}/chat-messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "blocking",
        conversation_id: conversationId || "",
        user: payload.user || "corvit-student",
      }),
    });

  try {
    let res = await callDify(payload.conversation_id);

    // Stale or unknown conversation: start a fresh one automatically.
    if (res.status === 404 && payload.conversation_id) res = await callDify("");

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }

    if (!res.ok) {
      return json(res.status, {
        error: data.message || data.error || `Dify returned an error (HTTP ${res.status}).`,
        code: data.code,
      });
    }

    return json(200, {
      answer: data.answer || "",
      conversation_id: data.conversation_id || "",
      message_id: data.message_id || "",
    });
  } catch (err) {
    return json(502, { error: "Could not reach Dify. Check DIFY_BASE_URL and try again.", detail: String(err?.message || err) });
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestGet({ env }) {
  let state = { app: {}, ov: {}, ts: 0 };
  try {
    const raw = await env.PM_KV.get('state');
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d === 'object') state = d;
    }
  } catch (e) {}
  state.required = !!env.EDIT_TOKEN;
  return json(state);
}

export async function onRequestPost({ request, env }) {
  if (env.EDIT_TOKEN) {
    const token = request.headers.get('X-Edit-Token') || new URL(request.url).searchParams.get('token') || '';
    if (token !== env.EDIT_TOKEN) return json({ ok: false, error: 'unauthorized' }, 403);
  }
  try {
    const d = await request.json();
    if (!d || !d.app || !d.ov) return json({ ok: false, error: 'bad payload' }, 400);
    let oldTs = 0;
    try {
      const raw = await env.PM_KV.get('state');
      if (raw) {
        const old = JSON.parse(raw);
        oldTs = Number(old && old.ts) || 0;
      }
    } catch (e) {}
    const ts = Math.max(Date.now(), oldTs + 1);
    const payload = { app: d.app, ov: d.ov, ts: ts };
    await env.PM_KV.put('state', JSON.stringify(payload));
    return json({ ok: true, ts: payload.ts });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 400);
  }
}
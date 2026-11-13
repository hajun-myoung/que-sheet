import { createClient } from "npm:@supabase/supabase-js@2.95.3";
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
export const validId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function authenticate(req: Request) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: header } },
      auth: { persistSession: false },
    },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return { user: data.user, client, admin };
}
export async function readBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("요청이 비어 있습니다.");
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) {
      await reader.cancel();
      throw Error("요청이 너무 큽니다.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

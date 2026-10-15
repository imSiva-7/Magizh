import getDatabase from "@/database/connectToMongoDB";
import { parsePunches, savePunches } from "@/lib/iclock";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
const reply = (body = "OK", status = 200) => new Response(body, { status, headers: HEADERS });

function deviceFrom(request) {
  const params = new URL(request.url).searchParams;
  const deviceId = (params.get("SN") || params.get("sn") || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(deviceId)) return { error: reply("INVALID SN", 400) };
  const allowed = (process.env.ICLOCK_ALLOWED_SERIALS || "").split(",").map((sn) => sn.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(deviceId)) return { error: reply("UNKNOWN DEVICE", 403) };
  return { deviceId, params };
}

async function readBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new RangeError("Upload too large");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Upload too large");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

// Keep the existing plain-text handshake until the terminal firmware can be
// checked. No browser login, redirects, or JSON responses on this hardware route.
export async function GET(request) {
  const { error } = deviceFrom(request);
  return error || reply();
}

export async function POST(request) {
  const { deviceId, params, error } = deviceFrom(request);
  if (error) return error;
  // Operation/enrollment uploads are not attendance. Acknowledge without parsing
  // them as punches or writing biometric/user template data to employee records.
  const table = (params.get("table") || "ATTLOG").toUpperCase();
  if (table !== "ATTLOG") return reply();

  try {
    const text = await readBody(request);
    const { records, invalidCount } = parsePunches(text, deviceId);
    if (invalidCount) {
      console.warn("[iclock] Invalid attendance upload", { deviceId, invalidCount });
      return reply("INVALID ATTLOG", 400);
    }
    if (!records.length) return reply();
    const db = await getDatabase();
    const result = await savePunches(db, records);
    console.info("[iclock] Attendance upload saved", { deviceId, records: records.length, ...result });
    return reply();
  } catch (error) {
    if (error instanceof RangeError) return reply("UPLOAD TOO LARGE", 413);
    console.error("[iclock] Attendance upload failed", { deviceId, message: error.message });
    // The device can retry a failed upload. Earlier successful writes are safe
    // to resend because event merging and the unmatched queue are idempotent.
    return new Response("ERROR", { status: 503, headers: { ...HEADERS, "Retry-After": "10" } });
  }
}

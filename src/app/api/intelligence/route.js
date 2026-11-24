import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import getDatabase from "@/database/connectToMongoDB";
import { HISTORY_LIMIT, INTELLIGENCE_ROLES, QUESTION_LIMIT } from "@/lib/magizh-intelligence";
import { readIntelligenceOverview } from "@/lib/magizh-intelligence-data";
import { askIntelligence, briefIntelligence, intelligenceConfig, IntelligenceProviderError } from "@/lib/magizh-intelligence-provider";

export const runtime = "nodejs";
export const maxDuration = 45;

function reply(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...headers, "Cache-Control": "private, no-store" } });
}

async function authorize(adminOnly = false) {
  // The NextAuth JWT callback refreshes the role against MongoDB on each request.
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return reply({ error: "Sign in to use Magizh Intelligence." }, 401);
  if (!INTELLIGENCE_ROLES.includes(user.role) || (adminOnly && user.role !== "admin")) {
    return reply({ error: "Your account doesn’t have access to this view." }, 403);
  }
  return user;
}

export async function GET(request) {
  try {
    const overview = new URL(request.url).searchParams.get("overview") === "1";
    const user = await authorize(overview);
    if (user instanceof Response) return user;
    const configured = Boolean(intelligenceConfig());
    if (!overview) return reply({ configured });
    return reply({ configured, overview: await readIntelligenceOverview(await getDatabase(), user.role) });
  } catch {
    return reply({ error: "Could not load Magizh Intelligence. Please try again." }, 503);
  }
}

const MAX_BODY_BYTES = 32_000; // Up to 5 bounded question strings, including UTF-8 and JSON escaping.

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body required");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let json = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(json + decoder.decode());
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("Request too large");
      json += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function parseChat(body) {
  const validQuestion = value => typeof value === "string" && value.length <= QUESTION_LIMIT && value.trim().length > 0;
  const history = body?.history === undefined ? [] : body.history;
  if (body?.action !== "chat" || !validQuestion(body.question) || !Array.isArray(history) ||
    history.length > HISTORY_LIMIT || !history.every(validQuestion)) return null;
  return { question: body.question.trim(), history: history.map(item => item.trim()) };
}

// A small, instance-local cost/concurrency guard; no writes to business data.
const usage = new Map();
let active = 0;
let windowStart = 0;
let requestsThisWindow = 0;
function enter(userId) {
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    requestsThisWindow = 0;
    for (const [id, entry] of usage) {
      if (entry.active) entry.count = 0;
      else usage.delete(id);
    }
  }
  const entry = usage.get(userId) || { count: 0, active: false };
  if (entry.active || entry.count >= 6 || active >= 5 || requestsThisWindow >= 30) return null;
  entry.active = true;
  entry.count++;
  usage.set(userId, entry);
  active++;
  requestsThisWindow++;
  return () => { entry.active = false; active--; };
}

const providerErrors = {
  provider_setup: [503, "The AI provider rejected its configuration. Ask your workspace admin to check the key and model."],
  provider_busy: [429, "The AI provider is busy or at its usage limit. Try again in a moment."],
  provider_timeout: [504, "The AI provider took too long to reply. Please try again."],
  provider_error: [502, "The AI provider couldn’t complete this request. Please try again."],
};

export async function POST(request) {
  let release;
  try {
    const user = await authorize();
    if (user instanceof Response) return user;
    if (request.headers.get("sec-fetch-site") === "cross-site" ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return reply({ error: "Send an application/json request from the workspace." }, 400);
    }
    let body;
    try { body = await readBody(request); } catch { return reply({ error: "Invalid or oversized request." }, 400); }
    const briefing = body?.action === "briefing";
    if (briefing && user.role !== "admin") return reply({ error: "Only admins can generate the overview briefing." }, 403);
    const chat = briefing ? null : parseChat(body);
    if (!briefing && !chat) return reply({ error: `Enter a question of up to ${QUESTION_LIMIT} characters.` }, 400);
    const config = intelligenceConfig();
    if (!config) return reply({ code: "not_configured", error: "AI isn’t configured for this workspace. Ask your workspace admin to connect a provider." }, 503);
    release = enter(user.id);
    if (!release) return reply({ error: "Magizh Intelligence is busy. Please try again shortly." }, 429, { "Retry-After": "60" });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(18_000)]);
    if (briefing) {
      const overview = await readIntelligenceOverview(await getDatabase(), user.role);
      return reply({ answer: await briefIntelligence(config, signal, overview), overview });
    }
    return reply(await askIntelligence({ config, signal, role: user.role, getDb: getDatabase, ...chat }));
  } catch (error) {
    if (error instanceof IntelligenceProviderError) {
      const [status, message] = providerErrors[error.code] || providerErrors.provider_error;
      return reply({ error: message, code: error.code }, status);
    }
    return reply({ error: "Could not read the operational data. Please try again." }, 503);
  } finally {
    release?.();
  }
}

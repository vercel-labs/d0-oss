// app/api/agent/route.ts

export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agent";

type Phase = "planning" | "building" | "execution" | "reporting";

export async function POST(req: NextRequest) {
  try {
    const { messages, model } = await req.json();

    const result = await runAgent({ messages, model });

    return result.toUIMessageStreamResponse();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

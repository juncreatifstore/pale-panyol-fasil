import { NextResponse } from "next/server";
import { supabaseUrl } from "@/lib/supabase/config";

async function proxy(request: Request) {
  const upstream = await fetch(`${supabaseUrl}/functions/v1/storefront`, {
    method: request.method,
    headers: { "content-type": "application/json" },
    body: request.method === "POST" ? await request.text() : undefined,
    cache: "no-store",
  });
  const body = await upstream.text();
  return new NextResponse(body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
}

export async function GET(request: Request) { return proxy(request); }
export async function POST(request: Request) { return proxy(request); }

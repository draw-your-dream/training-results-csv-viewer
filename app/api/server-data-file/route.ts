import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const SERVER_ROOT_DIR = "server-data/";
const SERVER_DATA_ROOT = path.join(process.cwd(), "public", SERVER_ROOT_DIR);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path");
  const normalized = normalizeFilePath(rawPath);

  if (!normalized) {
    return NextResponse.json({ error: "缺少 path 参数" }, { status: 400 });
  }

  const target = path.join(SERVER_DATA_ROOT, normalized);
  const resolved = path.resolve(target);
  const root = path.resolve(SERVER_DATA_ROOT);
  if (!resolved.startsWith(root)) {
    return NextResponse.json({ error: "路径越界" }, { status: 400 });
  }

  try {
    const stats = await stat(resolved);
    if (!stats.isFile()) {
      return NextResponse.json({ error: "不是文件" }, { status: 404 });
    }
    const text = await readFile(resolved, "utf-8");
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "无法读取文件" }, { status: 404 });
  }
}

function normalizeFilePath(input: string | null): string | null {
  if (!input) return null;
  let value = input.trim();
  if (!value) {
    return null;
  }
  value = value.replace(/^\/+/, "");
  value = value.replace(/^\.\/+/, "");
  if (value.startsWith(SERVER_ROOT_DIR)) {
    value = value.slice(SERVER_ROOT_DIR.length);
  }
  value = value.replace(/\\/g, "/");
  if (!value) {
    return null;
  }
  // prevent simple ../ traversal before path.resolve check
  if (value.includes("..")) {
    return null;
  }
  return value;
}

import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import path from "node:path";

const SERVER_ROOT_DIR = "server-data/";
const SERVER_DATA_ROOT = path.join(process.cwd(), "public", "server-data");

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedPath = url.searchParams.get("path") ?? SERVER_ROOT_DIR;
  const normalized = normalizeDirectoryPath(requestedPath);
  const relative = normalized.replace(/^server-data\/?/, "");
  const target = path.join(SERVER_DATA_ROOT, relative);
  const resolved = path.resolve(target);

  if (!resolved.startsWith(path.resolve(SERVER_DATA_ROOT))) {
    return NextResponse.json({ error: "路径越界" }, { status: 400 });
  }

  try {
    const dirents = await readdir(resolved, { withFileTypes: true });
    const entries = dirents
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => {
        const entryPath = path.posix.join(normalized, entry.name) + (entry.isDirectory() ? "/" : "");
        return {
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory(),
        };
      });

    return NextResponse.json({ entries, path: normalized });
  } catch (error) {
    return NextResponse.json({ error: "无法访问目录" }, { status: 404 });
  }
}

function normalizeDirectoryPath(input: string): string {
  let normalized = input.trim();
  if (!normalized) {
    normalized = SERVER_ROOT_DIR;
  }
  normalized = normalized.replace(/^\.\/?/, "");
  normalized = normalized.replace(/^\//, "");
  if (!normalized.startsWith(SERVER_ROOT_DIR)) {
    normalized = `${SERVER_ROOT_DIR}${normalized}`;
  }
  if (!normalized.endsWith("/")) {
    normalized += "/";
  }
  return normalized;
}

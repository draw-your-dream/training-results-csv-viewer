import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const SERVER_DATA_ROOT = path.join(process.cwd(), "public", "server-data");
const REGION = process.env.S3_REGION ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const ENDPOINT = process.env.S3_ENDPOINT;
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";
const EXPIRES_IN_SECONDS = clampExpires(process.env.S3_PRESIGN_EXPIRES);

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: { path?: string[] } }) {
  const rawSegments = context.params.path ?? [];
  const relativePath = normalizeRelativePath(rawSegments.join("/"));
  if (!relativePath) {
    return NextResponse.json({ error: "缺少路径" }, { status: 400 });
  }

  const s3Root = parseS3RootUri(process.env.S3_SERVER_DATA_ROOT);
  if (s3Root) {
    const key = `${s3Root.prefix}${relativePath}`.replace(/\/+/g, "/");
    try {
      const signedUrl = await getSignedUrl(
        createS3Client(),
        new GetObjectCommand({
          Bucket: s3Root.bucket,
          Key: key,
        }),
        { expiresIn: EXPIRES_IN_SECONDS }
      );
      const response = NextResponse.redirect(signedUrl, 302);
      response.headers.set("Cache-Control", "no-store, must-revalidate");
      return response;
    } catch (error) {
      console.error("[server-data] s3 get failed", error);
      return NextResponse.json({ error: "无法读取文件" }, { status: 404 });
    }
  }

  return serveLocalFile(relativePath);
}

async function serveLocalFile(relativePath: string) {
  const target = path.join(SERVER_DATA_ROOT, relativePath);
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
    const buffer = await readFile(resolved);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": guessContentType(relativePath),
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "无法读取文件" }, { status: 404 });
  }
}

function normalizeRelativePath(input: string): string | null {
  const trimmed = (input ?? "").trim().replace(/\\/g, "/");
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    return null;
  }
  return normalized;
}

function guessContentType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function parseS3RootUri(raw?: string): { bucket: string; prefix: string } | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.toLowerCase().startsWith("s3://")) {
    console.warn("[server-data] invalid S3_SERVER_DATA_ROOT, expected s3://bucket/prefix");
    return null;
  }
  const withoutScheme = trimmed.replace(/^s3:\/\//i, "");
  const slashIndex = withoutScheme.indexOf("/");
  const bucket = slashIndex === -1 ? withoutScheme : withoutScheme.slice(0, slashIndex);
  let prefix = slashIndex === -1 ? "" : withoutScheme.slice(slashIndex + 1);
  prefix = prefix.replace(/^\/+/, "");
  prefix = prefix.replace(/\\/g, "/");
  if (prefix && !prefix.endsWith("/")) {
    prefix += "/";
  }
  if (!bucket) {
    return null;
  }
  return { bucket, prefix };
}

function createS3Client() {
  return new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    forcePathStyle: FORCE_PATH_STYLE,
  });
}

function clampExpires(raw?: string): number {
  const fallback = 300;
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(60 * 60 * 24 * 7, Math.max(60, Math.round(parsed)));
}

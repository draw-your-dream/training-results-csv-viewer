import { NextResponse } from "next/server";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Buffer } from "node:buffer";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const SERVER_ROOT_DIR = "server-data/";
const SERVER_DATA_ROOT = path.join(process.cwd(), "public", SERVER_ROOT_DIR);

const REGION = process.env.S3_REGION ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const ENDPOINT = process.env.S3_ENDPOINT;
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path");
  const normalized = normalizeFilePath(rawPath);

  if (!normalized) {
    return NextResponse.json({ error: "缺少 path 参数" }, { status: 400 });
  }

  const s3Root = parseS3RootUri(process.env.S3_SERVER_DATA_ROOT);
  if (s3Root) {
    const key = `${s3Root.prefix}${normalized}`.replace(/\/+/g, "/");
    try {
      const client = createS3Client();
      const response = await client.send(
        new GetObjectCommand({
          Bucket: s3Root.bucket,
          Key: key,
        })
      );
      const body = response.Body;
      if (!body) {
        return NextResponse.json({ error: "无法读取文件" }, { status: 404 });
      }
      const text = await readBodyAsText(body);
      return new NextResponse(text, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Cache-Control": "no-store, must-revalidate",
        },
      });
    } catch (error) {
      console.error("[api/server-data-file] s3 get failed", error);
      return NextResponse.json({ error: "无法读取文件" }, { status: 404 });
    }
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

function parseS3RootUri(raw?: string): { bucket: string; prefix: string } | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.toLowerCase().startsWith("s3://")) {
    console.warn("[api/server-data-file] invalid S3_SERVER_DATA_ROOT, expected s3://bucket/prefix");
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

async function readBodyAsText(body: unknown): Promise<string> {
  if (typeof body === "string") {
    return body;
  }
  if (body && typeof (body as any).transformToString === "function") {
    return (body as any).transformToString("utf-8");
  }
  if (body && typeof (body as any).arrayBuffer === "function") {
    const bytes = await (body as any).arrayBuffer();
    return Buffer.from(bytes).toString("utf-8");
  }
  if (body && typeof (body as any).getReader === "function") {
    const reader = (body as any).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf-8");
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = body as any;
    if (!stream || typeof stream.on !== "function") {
      reject(new Error("Unsupported S3 response body"));
      return;
    }
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", reject);
  });
}

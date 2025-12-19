import { NextResponse } from "next/server";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const SERVER_ROOT_DIR = "server-data/";
const SERVER_DATA_ROOT = path.join(process.cwd(), "public", "server-data");

const REGION = process.env.S3_REGION ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const ENDPOINT = process.env.S3_ENDPOINT;
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedPath = url.searchParams.get("path") ?? SERVER_ROOT_DIR;
  const normalized = normalizeDirectoryPath(requestedPath);

  const s3Root = parseS3RootUri(process.env.S3_SERVER_DATA_ROOT);
  if (s3Root) {
    const relative = normalized.replace(/^server-data\/?/, "");
    if (relative.includes("..")) {
      return NextResponse.json({ error: "路径越界" }, { status: 400 });
    }
    try {
      const entries = await listS3DirectoryEntries({
        bucket: s3Root.bucket,
        basePrefix: s3Root.prefix,
        relativePrefix: relative,
        normalizedPath: normalized,
      });
      return NextResponse.json({ entries, path: normalized });
    } catch (error) {
      console.error("[api/server-data] s3 list failed", error);
      return NextResponse.json({ error: "无法访问目录" }, { status: 404 });
    }
  }

  const relative = normalized.replace(/^server-data\/?/, "");
  const target = path.join(SERVER_DATA_ROOT, relative);
  const resolved = path.resolve(target);

  if (!resolved.startsWith(path.resolve(SERVER_DATA_ROOT))) {
    return NextResponse.json({ error: "路径越界" }, { status: 400 });
  }

  try {
    const dirents = await readdir(resolved, { withFileTypes: true });
    const entries = await filterEntriesWithCsv(dirents, resolved, normalized);

    return NextResponse.json({ entries, path: normalized });
  } catch (error) {
    return NextResponse.json({ error: "无法访问目录" }, { status: 404 });
  }
}

async function filterEntriesWithCsv(dirents: Dirent[], parentFsPath: string, normalizedPath: string) {
  const entries: Array<{ name: string; path: string; isDirectory: boolean }> = [];
  for (const entry of dirents) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const entryFsPath = path.join(parentFsPath, entry.name);
    if (entry.isFile()) {
      if (!isCsvFile(entry.name)) {
        continue;
      }
      entries.push(toResponseEntry(entry, normalizedPath));
      continue;
    }
    if (!entry.isDirectory()) {
      continue;
    }
    const containsCsv = await hasCsvWithin(entryFsPath);
    if (!containsCsv) {
      continue;
    }
    entries.push(toResponseEntry(entry, normalizedPath));
  }
  return entries;
}

async function hasCsvWithin(directoryPath: string): Promise<boolean> {
  const queue: string[] = [directoryPath];
  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    let dirents: Dirent[];
    try {
      dirents = await readdir(current, { withFileTypes: true });
    } catch (error) {
      continue;
    }
    for (const entry of dirents) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (entry.isFile() && isCsvFile(entry.name)) {
        return true;
      }
      if (entry.isDirectory()) {
        queue.push(path.join(current, entry.name));
      }
    }
  }
  return false;
}

function toResponseEntry(entry: Dirent, normalizedPath: string) {
  const entryPath = path.posix.join(normalizedPath, entry.name) + (entry.isDirectory() ? "/" : "");
  return {
    name: entry.name,
    path: entryPath,
    isDirectory: entry.isDirectory(),
  };
}

function isCsvFile(name: string): boolean {
  return name.toLowerCase().endsWith(".csv");
}

function normalizeDirectoryPath(input: string): string {
  let normalized = input.trim();
  if (!normalized) {
    normalized = SERVER_ROOT_DIR;
  }
  normalized = normalized.replace(/\\/g, "/");
  normalized = normalized.replace(/^\.\/?/, "");
  normalized = normalized.replace(/^\//, "");
  if (!normalized.startsWith(SERVER_ROOT_DIR)) {
    normalized = `${SERVER_ROOT_DIR}${normalized}`;
  }
  normalized = normalized.replace(/\/+/g, "/");
  if (!normalized.endsWith("/")) {
    normalized += "/";
  }
  return normalized;
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
    console.warn("[api/server-data] invalid S3_SERVER_DATA_ROOT, expected s3://bucket/prefix");
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

async function listS3DirectoryEntries({
  bucket,
  basePrefix,
  relativePrefix,
  normalizedPath,
}: {
  bucket: string;
  basePrefix: string;
  relativePrefix: string;
  normalizedPath: string;
}) {
  const client = createS3Client();
  const prefix = joinS3Prefix(basePrefix, relativePrefix);
  const directoryNames = new Set<string>();
  const fileNames = new Set<string>();

  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      })
    );

    for (const commonPrefix of response.CommonPrefixes ?? []) {
      const childPrefix = commonPrefix.Prefix;
      if (!childPrefix || !childPrefix.startsWith(prefix) || childPrefix === prefix) {
        continue;
      }
      const remainder = childPrefix.slice(prefix.length);
      const name = remainder.split("/").filter(Boolean)[0] ?? "";
      if (!name || name.startsWith(".")) {
        continue;
      }
      directoryNames.add(name);
    }

    for (const item of response.Contents ?? []) {
      const key = item.Key;
      if (!key || !key.startsWith(prefix) || key === prefix) {
        continue;
      }
      const remainder = key.slice(prefix.length);
      if (!remainder || remainder.includes("/")) {
        continue;
      }
      if (remainder.startsWith(".")) {
        continue;
      }
      if (!isCsvFile(remainder)) {
        continue;
      }
      fileNames.add(remainder);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  const entries: Array<{ name: string; path: string; isDirectory: boolean }> = [];
  for (const name of Array.from(directoryNames).sort((a, b) => a.localeCompare(b))) {
    entries.push({
      name,
      path: path.posix.join(normalizedPath, name) + "/",
      isDirectory: true,
    });
  }
  for (const name of Array.from(fileNames).sort((a, b) => a.localeCompare(b))) {
    entries.push({
      name,
      path: path.posix.join(normalizedPath, name),
      isDirectory: false,
    });
  }
  return entries;
}

function joinS3Prefix(basePrefix: string, relativePrefix: string): string {
  const normalizedBase = basePrefix.replace(/^\/+/, "").replace(/\\/g, "/");
  const normalizedRelative = relativePrefix.replace(/^\/+/, "").replace(/\\/g, "/");
  const joined = `${normalizedBase}${normalizedRelative}`;
  if (!joined || joined.endsWith("/")) {
    return joined;
  }
  return `${joined}/`;
}

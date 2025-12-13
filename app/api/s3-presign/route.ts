import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

const REGION = process.env.S3_REGION ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const ENDPOINT = process.env.S3_ENDPOINT;
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";
const EXPIRES_IN_SECONDS = clampExpires(process.env.S3_PRESIGN_EXPIRES);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawUri = url.searchParams.get("uri");
  if (!rawUri) {
    return NextResponse.json({ error: "缺少 uri 参数" }, { status: 400 });
  }
  let decodedUri: string;
  try {
    decodedUri = decodeURIComponent(rawUri);
  } catch (error) {
    console.error("[api/s3-presign] decode failed", error);
    return NextResponse.json({ error: "无效的 URI 编码" }, { status: 400 });
  }
  const parsed = parseS3Uri(decodedUri);
  if (!parsed) {
    return NextResponse.json({ error: "无效的 S3 URI" }, { status: 400 });
  }

  const client = createS3Client();

  try {
    const command = new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    });
    const signedUrl = await getSignedUrl(client, command, { expiresIn: EXPIRES_IN_SECONDS });
    return NextResponse.redirect(signedUrl, 302);
  } catch (error) {
    console.error("[api/s3-presign]", error);
    return NextResponse.json({ error: "无法生成签名链接" }, { status: 500 });
  }
}

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const trimmed = uri.trim();
  if (!trimmed.toLowerCase().startsWith("s3://")) {
    return null;
  }
  const withoutScheme = trimmed.replace(/^s3:\/\//i, "");
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }
  const bucket = withoutScheme.slice(0, slashIndex);
  const key = withoutScheme.slice(slashIndex + 1);
  if (!bucket || !key) {
    return null;
  }
  return { bucket, key };
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

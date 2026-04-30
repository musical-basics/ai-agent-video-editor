import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pianoProjectRoot } from "@/lib/seed-data";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  const relativePath = segments.join(path.sep);
  const projectRoot = path.resolve(
    process.env.VIDEO_EDITOR_PROJECT_ROOT ?? pianoProjectRoot,
  );
  const filePath = path.resolve(projectRoot, relativePath);

  if (!filePath.startsWith(`${projectRoot}${path.sep}`)) {
    return new Response("Forbidden", { status: 403 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[ext];

  if (!contentType) {
    return new Response("Unsupported media type", { status: 415 });
  }

  try {
    if (contentType.startsWith("video/")) {
      return streamVideo(request, filePath, contentType);
    }

    const bytes = await readFile(filePath);
    return new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": contentType,
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function streamVideo(request: Request, filePath: string, contentType: string) {
  const fileStat = await stat(filePath);
  const range = request.headers.get("range");

  if (!range) {
    return new Response(nodeStream(filePath), {
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(fileStat.size),
        "Content-Type": contentType,
      },
    });
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    return new Response("Invalid range", { status: 416 });
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : fileStat.size - 1;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end >= fileStat.size ||
    start > end
  ) {
    return new Response("Range not satisfiable", {
      status: 416,
      headers: {
        "Content-Range": `bytes */${fileStat.size}`,
      },
    });
  }

  return new Response(nodeStream(filePath, start, end), {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
      "Content-Type": contentType,
    },
  });
}

function nodeStream(filePath: string, start?: number, end?: number) {
  return Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
}

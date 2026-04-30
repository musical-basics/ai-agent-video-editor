import { readFile } from "node:fs/promises";
import path from "node:path";
import { pianoProjectRoot } from "@/lib/seed-data";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
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

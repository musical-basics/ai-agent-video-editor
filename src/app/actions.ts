"use server";

import { revalidatePath } from "next/cache";
import { addNote } from "@/lib/db";

function numberFromForm(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function createNote(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const passId = String(formData.get("passId") ?? "");
  const timelineItemId = String(formData.get("timelineItemId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const noteType = String(formData.get("noteType") ?? "general");
  const author = String(formData.get("author") ?? "user") === "ai" ? "ai" : "user";

  if (!projectId || !body) {
    return { ok: false };
  }

  addNote({
    projectId,
    passId: passId || undefined,
    timelineItemId: timelineItemId || undefined,
    author,
    noteType,
    body,
    timecodeStart: numberFromForm(formData.get("timecodeStart")),
    timecodeEnd: numberFromForm(formData.get("timecodeEnd")),
    status: author === "ai" ? "done" : "open",
  });

  revalidatePath("/");
  return { ok: true };
}

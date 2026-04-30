"use server";

import { revalidatePath } from "next/cache";
import { addNote } from "@/lib/db";

export async function createNote(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const passId = String(formData.get("passId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const noteType = String(formData.get("noteType") ?? "general");
  const author = String(formData.get("author") ?? "user") === "ai" ? "ai" : "user";

  if (!projectId || !body) return;

  addNote({
    projectId,
    passId: passId || undefined,
    author,
    noteType,
    body,
    status: author === "ai" ? "done" : "open",
  });

  revalidatePath("/");
}

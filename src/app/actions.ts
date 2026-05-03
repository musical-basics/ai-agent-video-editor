"use server";

import { revalidatePath } from "next/cache";
import {
  addNote,
  deleteTimelineItem,
  duplicateTimelineItem,
  restoreTimelineItem,
  splitTimelineItem,
  updateTimelineItem,
  type TimelineItemPatch,
} from "@/lib/db";
import type { TimelineItem, TimelineRole } from "@/lib/types";

const ALLOWED_ROLES: TimelineRole[] = [
  "a_roll",
  "b_roll",
  "ambient",
  "title_card",
  "placeholder",
  "still",
  "voiceover",
  "music",
];

const ALLOWED_ROTATIONS = new Set<TimelineItem["rotationOverride"]>([0, 90, 180, 270]);

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

export type ClipPatchInput = {
  projectId: string;
  itemId: string;
  patch: {
    timelineStart?: number;
    sourceIn?: number;
    sourceOut?: number;
    targetDuration?: number;
    role?: string;
    rotationOverride?: number | null;
    textOverlay?: string | null;
    notes?: string | null;
    section?: string;
    order?: number;
  };
};

function sanitizePatch(patch: ClipPatchInput["patch"]): TimelineItemPatch {
  const out: TimelineItemPatch = {};
  if (patch.timelineStart !== undefined && Number.isFinite(patch.timelineStart)) {
    out.timelineStart = Math.max(0, patch.timelineStart);
  }
  if (patch.sourceIn !== undefined && Number.isFinite(patch.sourceIn)) {
    out.sourceIn = Math.max(0, patch.sourceIn);
  }
  if (patch.sourceOut !== undefined && Number.isFinite(patch.sourceOut)) {
    out.sourceOut = Math.max(0, patch.sourceOut);
  }
  if (patch.targetDuration !== undefined && Number.isFinite(patch.targetDuration)) {
    out.targetDuration = Math.max(0.1, patch.targetDuration);
  }
  if (patch.role !== undefined && ALLOWED_ROLES.includes(patch.role as TimelineRole)) {
    out.role = patch.role as TimelineRole;
  }
  if (patch.rotationOverride !== undefined) {
    if (patch.rotationOverride === null) {
      out.rotationOverride = null;
    } else if (ALLOWED_ROTATIONS.has(patch.rotationOverride as TimelineItem["rotationOverride"])) {
      out.rotationOverride = patch.rotationOverride as TimelineItem["rotationOverride"];
    }
  }
  if (patch.textOverlay !== undefined) {
    out.textOverlay = patch.textOverlay === null ? null : String(patch.textOverlay);
  }
  if (patch.notes !== undefined) {
    out.notes = patch.notes === null ? null : String(patch.notes);
  }
  if (patch.section !== undefined) {
    out.section = String(patch.section);
  }
  if (patch.order !== undefined && Number.isFinite(patch.order)) {
    out.order = Math.max(0, Math.floor(patch.order));
  }
  return out;
}

function logClipChange(
  projectId: string,
  itemId: string,
  body: string,
  oldValue: unknown,
  newValue: unknown,
) {
  addNote({
    projectId,
    timelineItemId: itemId,
    author: "user",
    noteType: "decision",
    body,
    status: "done",
  });
  // metadata diff is captured via the body for now — keeps it visible in the ledger.
  void oldValue;
  void newValue;
}

export async function updateTimelineClipAction(input: ClipPatchInput) {
  if (!input.projectId || !input.itemId) {
    return { ok: false, error: "missing projectId or itemId" };
  }
  const sanitized = sanitizePatch(input.patch);
  const updated = updateTimelineItem(input.projectId, input.itemId, sanitized);
  if (!updated) return { ok: false, error: "not found" };

  revalidatePath("/");
  return { ok: true, item: updated };
}

export async function splitTimelineClipAction(input: {
  projectId: string;
  itemId: string;
  splitAtMasterTime: number;
  clipLabel?: string;
}) {
  if (!input.projectId || !input.itemId || !Number.isFinite(input.splitAtMasterTime)) {
    return { ok: false, error: "missing fields" };
  }
  const result = splitTimelineItem(input.projectId, input.itemId, input.splitAtMasterTime);
  if (!result) {
    return { ok: false, error: "split point outside clip" };
  }
  logClipChange(
    input.projectId,
    input.itemId,
    `Split ${input.clipLabel ?? "clip"} at ${input.splitAtMasterTime.toFixed(2)}s.`,
    null,
    null,
  );
  revalidatePath("/");
  return { ok: true, left: result.left, right: result.right };
}

export async function deleteTimelineClipAction(input: {
  projectId: string;
  itemId: string;
  clipLabel?: string;
}) {
  if (!input.projectId || !input.itemId) return { ok: false, error: "missing fields" };
  const updated = deleteTimelineItem(input.projectId, input.itemId);
  if (!updated) return { ok: false, error: "not found" };
  logClipChange(
    input.projectId,
    input.itemId,
    `Removed ${input.clipLabel ?? "clip"} from the timeline (soft delete).`,
    true,
    false,
  );
  revalidatePath("/");
  return { ok: true };
}

export async function restoreTimelineClipAction(input: {
  projectId: string;
  itemId: string;
  clipLabel?: string;
}) {
  if (!input.projectId || !input.itemId) return { ok: false, error: "missing fields" };
  const updated = restoreTimelineItem(input.projectId, input.itemId);
  if (!updated) return { ok: false, error: "not found" };
  logClipChange(
    input.projectId,
    input.itemId,
    `Restored ${input.clipLabel ?? "clip"} on the timeline.`,
    false,
    true,
  );
  revalidatePath("/");
  return { ok: true };
}

export async function duplicateTimelineClipAction(input: {
  projectId: string;
  itemId: string;
  clipLabel?: string;
}) {
  if (!input.projectId || !input.itemId) return { ok: false, error: "missing fields" };
  const created = duplicateTimelineItem(input.projectId, input.itemId);
  if (!created) return { ok: false, error: "not found" };
  logClipChange(
    input.projectId,
    input.itemId,
    `Duplicated ${input.clipLabel ?? "clip"} to a new timeline item.`,
    null,
    created.id,
  );
  revalidatePath("/");
  return { ok: true, item: created };
}

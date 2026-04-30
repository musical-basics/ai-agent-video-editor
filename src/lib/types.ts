export type ProjectStatus = "active" | "archived";

export type AssetKind =
  | "video"
  | "image"
  | "transcript"
  | "contact_sheet"
  | "render"
  | "audio"
  | "placeholder";

export type AssetStatus = "active" | "placeholder" | "skip" | "missing";

export type PassStatus = "planned" | "in_progress" | "done" | "needs_review";

export type NoteAuthor = "user" | "ai";

export type NoteType =
  | "general"
  | "clip_review"
  | "rotation"
  | "trim"
  | "reorder"
  | "issue"
  | "fix_log"
  | "render_note"
  | "decision";

export type NoteStatus = "open" | "resolved" | "rejected" | "done" | "needs_review";

export type TimelineRole =
  | "a_roll"
  | "b_roll"
  | "ambient"
  | "title_card"
  | "placeholder"
  | "still"
  | "voiceover"
  | "music";

export type RenderStatus = "queued" | "running" | "done" | "failed";

export type Project = {
  id: string;
  name: string;
  rootPath: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  metadata: {
    thesis?: string;
    targetRuntime?: string;
    currentPass?: string;
    currentPassId?: string;
    currentRenderJobId?: string;
    githubRepo?: string;
  };
};

export type Asset = {
  id: string;
  projectId: string;
  kind: AssetKind;
  path: string;
  basename: string;
  originalId?: string;
  sequence?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  rotation: 0 | 90 | 180 | 270;
  hasAudio?: boolean;
  status: AssetStatus;
  metadata: Record<string, unknown>;
};

export type Pass = {
  id: string;
  projectId: string;
  name: string;
  order: number;
  status: PassStatus;
  goal: string;
  startedAt?: string;
  completedAt?: string;
};

export type Note = {
  id: string;
  projectId: string;
  assetId?: string;
  passId?: string;
  timelineItemId?: string;
  author: NoteAuthor;
  noteType: NoteType;
  body: string;
  timecodeStart?: number;
  timecodeEnd?: number;
  status: NoteStatus;
  createdAt: string;
  updatedAt: string;
  metadata: {
    oldValue?: unknown;
    newValue?: unknown;
    severity?: "low" | "medium" | "high";
    linkedOutput?: string;
  };
};

export type TimelineItem = {
  id: string;
  projectId: string;
  assetId?: string;
  passId?: string;
  section: string;
  order: number;
  timelineStart?: number;
  sourceIn?: number;
  sourceOut?: number;
  targetDuration?: number;
  role: TimelineRole;
  enabled: boolean;
  rotationOverride?: 0 | 90 | 180 | 270;
  textOverlay?: string;
  notes?: string;
};

export type TimelineClip = TimelineItem & {
  asset?: Asset;
  timelineStart: number;
  timelineEnd: number;
  duration: number;
};

export type RenderJob = {
  id: string;
  projectId: string;
  passId?: string;
  name: string;
  status: RenderStatus;
  outputPath?: string;
  startedAt?: string;
  completedAt?: string;
  command?: string;
  logPath?: string;
};

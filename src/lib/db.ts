import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  pass6TimelineSeed,
  pass7TimelineSeed,
  pass8TimelineSeed,
  pianoProjectRoot,
  sourceRelativePaths,
  timelineSeed,
} from "./seed-data";
import type {
  Asset,
  Note,
  Pass,
  Project,
  RenderJob,
  TimelineClip,
  TimelineItem,
} from "./types";

const dataDir = path.join(/*turbopackIgnore: true*/ process.cwd(), ".cut-notes");
const dbPath = path.join(dataDir, "cut-notes.sqlite");

type DbProjectRow = Omit<Project, "metadata"> & { metadata: string };
type DbAssetRow = Omit<Asset, "metadata" | "hasAudio"> & {
  metadata: string;
  hasAudio: number | null;
};
type DbPassRow = Pass;
type DbNoteRow = Omit<Note, "metadata"> & { metadata: string };
type DbTimelineItemRow = Omit<TimelineItem, "enabled"> & {
  enabled: number;
};
type DbRenderJobRow = RenderJob;

let db: Database.Database | undefined;

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getDb() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    migrate(db);
    seed(db);
  }

  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rootPath TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      metadata TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      basename TEXT NOT NULL,
      originalId TEXT,
      sequence INTEGER,
      durationSeconds REAL,
      width INTEGER,
      height INTEGER,
      rotation INTEGER NOT NULL DEFAULT 0,
      hasAudio INTEGER,
      status TEXT NOT NULL,
      metadata TEXT NOT NULL,
      FOREIGN KEY (projectId) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS passes (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      status TEXT NOT NULL,
      goal TEXT NOT NULL,
      startedAt TEXT,
      completedAt TEXT,
      FOREIGN KEY (projectId) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS timeline_items (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      assetId TEXT,
      passId TEXT,
      section TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      timelineStart REAL,
      sourceIn REAL,
      sourceOut REAL,
      targetDuration REAL,
      role TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      rotationOverride INTEGER,
      textOverlay TEXT,
      notes TEXT,
      FOREIGN KEY (projectId) REFERENCES projects(id),
      FOREIGN KEY (assetId) REFERENCES assets(id),
      FOREIGN KEY (passId) REFERENCES passes(id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      assetId TEXT,
      passId TEXT,
      timelineItemId TEXT,
      author TEXT NOT NULL,
      noteType TEXT NOT NULL,
      body TEXT NOT NULL,
      timecodeStart REAL,
      timecodeEnd REAL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      metadata TEXT NOT NULL,
      FOREIGN KEY (projectId) REFERENCES projects(id),
      FOREIGN KEY (assetId) REFERENCES assets(id),
      FOREIGN KEY (passId) REFERENCES passes(id),
      FOREIGN KEY (timelineItemId) REFERENCES timeline_items(id)
    );

    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      passId TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      outputPath TEXT,
      startedAt TEXT,
      completedAt TEXT,
      command TEXT,
      logPath TEXT,
      FOREIGN KEY (projectId) REFERENCES projects(id),
      FOREIGN KEY (passId) REFERENCES passes(id)
    );
  `);

  const timelineColumns = database.prepare("PRAGMA table_info(timeline_items)").all() as Array<{
    name: string;
  }>;
  if (!timelineColumns.some((column) => column.name === "timelineStart")) {
    database.exec("ALTER TABLE timeline_items ADD COLUMN timelineStart REAL");
  }
}

function seed(database: Database.Database) {
  const timestamp = now();
  const projectId = "piano-hand-size-part-2";
  const projectCount = database
    .prepare("SELECT COUNT(*) as count FROM projects WHERE id = ?")
    .get(projectId) as { count: number };

  if (projectCount.count === 0) {
    database
      .prepare(
        `INSERT INTO projects (id, name, rootPath, status, createdAt, updatedAt, metadata)
         VALUES (@id, @name, @rootPath, @status, @createdAt, @updatedAt, @metadata)`,
      )
      .run({
        id: projectId,
        name: "Piano Hand Size Part 2",
        rootPath: pianoProjectRoot,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        metadata: JSON.stringify({
          thesis:
            "I drove overnight to pick up rare DS 6.0 and DS 5.5 piano keyboards because hand size changes the way you experience the piano.",
          targetRuntime: "11:30-12:30",
          currentPass: "Pass 8: Narration and Music",
          currentPassId: "pass-8-narration-music",
          currentRenderJobId: "render-v5-narration-music",
          githubRepo: "https://github.com/musical-basics/piano-hand-size-2-video",
        }),
      });
  }

  const passes = [
    ["pass-0-plan", "Pass 0: Plan", 0, "done", "Define thesis, structure, tone, and target length."],
    ["pass-1-descriptors", "Pass 1: Visual Descriptors", 1, "done", "Add visual descriptors to every transcript."],
    ["pass-2-shortlist", "Pass 2: Moment Shortlist", 2, "done", "Create an unordered pool of usable moments."],
    ["pass-3-paper-edit", "Pass 3: Paper Edit", 3, "done", "Turn the shortlist into a rough ordered story."],
    ["pass-4-assembly", "Pass 4: Assembly Notes", 4, "done", "Specify source ranges, b-roll, labels, and render notes."],
    ["pass-5-rough-cut", "Pass 5: Rough Review Cut", 5, "needs_review", "Review the first automated rough cut and collect fixes."],
    [
      "pass-6-vo-music-cleanup",
      "Pass 6: VO and Music Cleanup",
      6,
      "needs_review",
      "Keep generated voiceover off speaking clips and add music to travel montage sections.",
    ],
    [
      "pass-7-clip-note-fixes",
      "Pass 7: Clip Note Fixes",
      7,
      "needs_review",
      "Apply open clip notes, keep travel music, and comment on each requested fix.",
    ],
    [
      "pass-8-narration-music",
      "Pass 8: Narration and Music",
      8,
      "needs_review",
      "Use the current narration voiceovers and an original royalty-free music bed under travel montage sections.",
    ],
  ] as const;

  const insertPass = database.prepare(
    `INSERT OR IGNORE INTO passes (id, projectId, name, "order", status, goal, startedAt, completedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const [id, name, order, status, goal] of passes) {
    insertPass.run(id, projectId, name, order, status, goal, timestamp, status === "done" ? timestamp : null);
  }

  seedTimeline(database, projectId, timestamp, "pass-4-assembly", timelineSeed);
  seedTimeline(database, projectId, timestamp, "pass-6-vo-music-cleanup", pass6TimelineSeed);
  seedTimeline(database, projectId, timestamp, "pass-7-clip-note-fixes", pass7TimelineSeed);
  seedTimeline(database, projectId, timestamp, "pass-8-narration-music", pass8TimelineSeed);
  seedRenderJobs(database, projectId, timestamp);
  updateProjectCurrentPass(database, projectId);

  const insertNote = database.prepare(
    `INSERT OR IGNORE INTO notes (
      id, projectId, assetId, passId, timelineItemId, author, noteType, body,
      timecodeStart, timecodeEnd, status, createdAt, updatedAt, metadata
    ) VALUES (
      @id, @projectId, @assetId, @passId, @timelineItemId, @author, @noteType, @body,
      @timecodeStart, @timecodeEnd, @status, @createdAt, @updatedAt, @metadata
    )`,
  );

  const seedNotes = [
    {
      id: "note-user-rotation-example",
      author: "user",
      noteType: "rotation",
      body: "Example user note: mark any sideways clip here, e.g. rotate lake footage 90 degrees clockwise.",
      status: "open",
      metadata: { severity: "medium" },
    },
    {
      id: "note-ai-fix-log-example",
      author: "ai",
      noteType: "fix_log",
      body: "Example AI fix log: after changing a cut, write exactly what changed, which file/script was updated, and which render includes the fix.",
      status: "done",
      metadata: { linkedOutput: "renders/review_cuts/piano_hand_size_part2_rough_cut_v1.mp4" },
    },
  ];

  for (const note of seedNotes) {
    insertNote.run({
      id: note.id,
      projectId,
      assetId: null,
      passId: "pass-5-rough-cut",
      timelineItemId: null,
      author: note.author,
      noteType: note.noteType,
      body: note.body,
      timecodeStart: null,
      timecodeEnd: null,
      status: note.status,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: JSON.stringify(note.metadata),
    });
  }
}

function seedTimeline(
  database: Database.Database,
  projectId: string,
  timestamp: string,
  passId: string,
  timelineItems: typeof timelineSeed,
) {
  const insertAsset = database.prepare(
    `INSERT INTO assets (
      id, projectId, kind, path, basename, originalId, sequence,
      durationSeconds, width, height, rotation, hasAudio, status, metadata
    ) VALUES (
      @id, @projectId, @kind, @path, @basename, @originalId, @sequence,
      @durationSeconds, @width, @height, @rotation, @hasAudio, @status, @metadata
    )
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      path = excluded.path,
      basename = excluded.basename,
      originalId = excluded.originalId,
      sequence = excluded.sequence,
      durationSeconds = excluded.durationSeconds,
      width = excluded.width,
      height = excluded.height,
      rotation = excluded.rotation,
      hasAudio = excluded.hasAudio,
      status = excluded.status,
      metadata = excluded.metadata`,
  );
  const insertTimelineItem = database.prepare(
    `INSERT INTO timeline_items (
      id, projectId, assetId, passId, section, "order", timelineStart, sourceIn, sourceOut,
      targetDuration, role, enabled, rotationOverride, textOverlay, notes
    ) VALUES (
      @id, @projectId, @assetId, @passId, @section, @order, @timelineStart, @sourceIn, @sourceOut,
      @targetDuration, @role, @enabled, @rotationOverride, @textOverlay, @notes
    )
    ON CONFLICT(id) DO UPDATE SET
      assetId = excluded.assetId,
      passId = excluded.passId,
      section = excluded.section,
      "order" = excluded."order",
      timelineStart = excluded.timelineStart,
      sourceIn = excluded.sourceIn,
      sourceOut = excluded.sourceOut,
      targetDuration = excluded.targetDuration,
      role = excluded.role,
      enabled = excluded.enabled,
      rotationOverride = excluded.rotationOverride,
      textOverlay = excluded.textOverlay,
      notes = excluded.notes`,
  );

  for (const [order, item] of timelineItems.entries()) {
    const assetId = assetIdForSource(item.source);
    const basename = basenameForSource(item.source);
    const relativePath = relativePathForSource(item.source);
    const thumbnailPath = thumbnailPathForSource(item.source);
    const kind = assetKindForSource(item.source);
    const status = item.role === "placeholder" ? "placeholder" : "active";

    insertAsset.run({
      id: assetId,
      projectId,
      kind,
      path: relativePath ? path.join(pianoProjectRoot, relativePath) : pianoProjectRoot,
      basename,
      originalId: originalIdForSource(item.source),
      sequence: sequenceForSource(item.source),
      durationSeconds: null,
      width: null,
      height: null,
      rotation: 0,
      hasAudio: kind === "video" || kind === "audio" ? 1 : 0,
      status,
      metadata: JSON.stringify({
        source: item.source,
        relativePath,
        thumbnailPath,
        seededAt: timestamp,
      }),
    });

    insertTimelineItem.run({
      id: item.id,
      projectId,
      assetId,
      passId,
      section: item.section,
      order,
      timelineStart: item.timelineStart ?? null,
      sourceIn: item.sourceIn ?? null,
      sourceOut: item.sourceOut ?? null,
      targetDuration: item.targetDuration,
      role: item.role,
      enabled: 1,
      rotationOverride: item.rotationOverride ?? null,
      textOverlay: item.textOverlay ?? null,
      notes: item.notes,
    });
  }
}

function seedRenderJobs(database: Database.Database, projectId: string, timestamp: string) {
  database
    .prepare(
      `INSERT OR IGNORE INTO render_jobs (
        id, projectId, passId, name, status, outputPath, startedAt, completedAt, command, logPath
      ) VALUES (
        @id, @projectId, @passId, @name, @status, @outputPath, @startedAt, @completedAt, @command, @logPath
      )`,
    )
    .run({
      id: "render-v3-vo-music-cleanup",
      projectId,
      passId: "pass-6-vo-music-cleanup",
      name: "Rough review cut v3",
      status: "done",
      outputPath:
        "/Users/lionelyu/Music/Piano Hand Size Part 2/keyboard-trip/renders/review_cuts/piano_hand_size_part2_rough_cut_v3.mp4",
      startedAt: timestamp,
      completedAt: timestamp,
      command: "./make_rough_review_cut_v3.sh",
      logPath: "/Users/lionelyu/Music/Piano Hand Size Part 2/keyboard-trip/docs/PASS5_V3_FIX_LOG.md",
    });

  database
    .prepare(
      `INSERT OR IGNORE INTO render_jobs (
        id, projectId, passId, name, status, outputPath, startedAt, completedAt, command, logPath
      ) VALUES (
        @id, @projectId, @passId, @name, @status, @outputPath, @startedAt, @completedAt, @command, @logPath
      )`,
    )
    .run({
      id: "render-v4-clip-note-fixes",
      projectId,
      passId: "pass-7-clip-note-fixes",
      name: "Rough review cut v4",
      status: "done",
      outputPath:
        "/Users/lionelyu/Music/Piano Hand Size Part 2/keyboard-trip/renders/review_cuts/piano_hand_size_part2_rough_cut_v4.mp4",
      startedAt: timestamp,
      completedAt: timestamp,
      command: "./make_rough_review_cut_v4.sh",
      logPath: "/Users/lionelyu/Music/Piano Hand Size Part 2/keyboard-trip/docs/PASS7_V4_FIX_LOG.md",
    });

  database
    .prepare(
      `INSERT OR IGNORE INTO render_jobs (
        id, projectId, passId, name, status, outputPath, startedAt, completedAt, command, logPath
      ) VALUES (
        @id, @projectId, @passId, @name, @status, @outputPath, @startedAt, @completedAt, @command, @logPath
      )`,
    )
    .run({
      id: "render-v5-narration-music",
      projectId,
      passId: "pass-8-narration-music",
      name: "Rough review cut v5",
      status: "done",
      outputPath:
        "/Users/lionelyu/Music/Piano Hand Size Part 2/keyboard-trip/renders/review_cuts/piano_hand_size_part2_rough_cut_v5.mp4",
      startedAt: timestamp,
      completedAt: timestamp,
      command: "./make_rough_review_cut_v5.sh",
      logPath: "/Users/lionelyu/Music/Piano Hand Size Part 2/keyboard-trip/docs/PASS8_V5_VO_MUSIC_LOG.md",
    });
}

function updateProjectCurrentPass(database: Database.Database, projectId: string) {
  const row = database
    .prepare("SELECT metadata FROM projects WHERE id = ?")
    .get(projectId) as { metadata: string } | undefined;
  const metadata = parseJson(row?.metadata, {});

  database
    .prepare("UPDATE projects SET metadata = @metadata, updatedAt = @updatedAt WHERE id = @id")
    .run({
      id: projectId,
      updatedAt: now(),
      metadata: JSON.stringify({
        ...metadata,
        currentPass: "Pass 8: Narration and Music",
        currentPassId: "pass-8-narration-music",
        currentRenderJobId: "render-v5-narration-music",
      }),
    });
}

function assetIdForSource(source: string) {
  return `asset-${source
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;
}

function basenameForSource(source: string) {
  if (source === "technical-keyboard-stills") return "technical_keyboard_stills";
  if (source === "title-card-road-keyboard") return "cold_open_title_card";
  if (source.includes(path.sep) || source.includes("/")) return path.basename(source);
  return source;
}

function relativePathForSource(source: string) {
  return sourceRelativePaths[source] ?? (source.includes("/") ? source : undefined);
}

function thumbnailPathForSource(source: string) {
  const lower = source.toLowerCase();

  if (
    source.includes("/") &&
    (lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".webp"))
  ) {
    return source;
  }

  if (source === "technical-keyboard-stills") {
    return "footage/04_Keyboards_Technical_Stills/030_IMG_0286_technical_keyboard_still.JPG";
  }

  if (source === "055_PICKUP_front_facing_intro.MOV") {
    return "footage/90_Reference_Frames/055_PICKUP_front_facing_intro.jpg";
  }

  const match = source.match(/IMG_(\d{4})/);
  if (!match) return undefined;

  return `footage/90_Reference_Frames/IMG_${match[1]}.jpg`;
}

function originalIdForSource(source: string) {
  const match = source.match(/IMG_(\d{4})/);
  if (match) return `IMG_${match[1]}`;
  if (source.includes("PICKUP")) return source.replace(/\.[^.]+$/, "");
  return undefined;
}

function sequenceForSource(source: string) {
  const match = source.match(/^(\d{3})_/);
  return match ? Number(match[1]) : undefined;
}

function assetKindForSource(source: string) {
  if (source === "technical-keyboard-stills") return "image";
  if (source === "title-card-road-keyboard") return "placeholder";
  const lower = source.toLowerCase();
  if (lower.endsWith(".mov") || lower.endsWith(".mp4")) {
    return "video";
  }
  if (
    lower.endsWith(".wav") ||
    lower.endsWith(".mp3") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".aac")
  ) {
    return "audio";
  }
  if (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp")
  ) {
    return "image";
  }

  return "placeholder";
}

export function getActiveProject(): Project {
  const row = getDb()
    .prepare("SELECT * FROM projects WHERE status = 'active' ORDER BY createdAt LIMIT 1")
    .get() as DbProjectRow;

  return {
    ...row,
    metadata: parseJson(row.metadata, {}),
  };
}

export function getPasses(projectId: string): Pass[] {
  return getDb()
    .prepare(`SELECT * FROM passes WHERE projectId = ? ORDER BY "order" ASC`)
    .all(projectId) as DbPassRow[];
}

export function getAssets(projectId: string): Asset[] {
  const rows = getDb()
    .prepare("SELECT * FROM assets WHERE projectId = ? ORDER BY sequence ASC, basename ASC")
    .all(projectId) as DbAssetRow[];

  return rows.map((row) => ({
    ...row,
    originalId: row.originalId ?? undefined,
    sequence: row.sequence ?? undefined,
    durationSeconds: row.durationSeconds ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    hasAudio: row.hasAudio === null ? undefined : Boolean(row.hasAudio),
    metadata: parseJson(row.metadata, {}),
  }));
}

export function getTimelineItems(projectId: string, passId?: string): TimelineItem[] {
  const database = getDb();
  const rows = (
    passId
      ? database
          .prepare(
            `SELECT * FROM timeline_items
             WHERE projectId = ? AND passId = ?
             ORDER BY "order" ASC`,
          )
          .all(projectId, passId)
      : database
          .prepare(
            `SELECT * FROM timeline_items
             WHERE projectId = ?
             ORDER BY COALESCE(passId, ''), "order" ASC`,
          )
          .all(projectId)
  ) as DbTimelineItemRow[];

  return rows.map((row) => ({
    ...row,
    assetId: row.assetId ?? undefined,
    passId: row.passId ?? undefined,
    timelineStart: row.timelineStart ?? undefined,
    sourceIn: row.sourceIn ?? undefined,
    sourceOut: row.sourceOut ?? undefined,
    targetDuration: row.targetDuration ?? undefined,
    enabled: Boolean(row.enabled),
    rotationOverride: row.rotationOverride ?? undefined,
    textOverlay: row.textOverlay ?? undefined,
    notes: row.notes ?? undefined,
  }));
}

export function getTimelineClips(projectId: string, passId?: string): TimelineClip[] {
  const assets = getAssets(projectId);
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const items = getTimelineItems(projectId, passId).filter((item) => item.enabled);
  const cursorsByPass = new Map<string, number>();

  return items.map((item) => {
    const duration = item.targetDuration ?? Math.max(1, (item.sourceOut ?? 0) - (item.sourceIn ?? 0));
    const passKey = item.passId ?? "unassigned";
    const cursor = cursorsByPass.get(passKey) ?? 0;
    const timelineStart = item.timelineStart ?? cursor;
    const clip: TimelineClip = {
      ...item,
      asset: item.assetId ? assetsById.get(item.assetId) : undefined,
      timelineStart,
      timelineEnd: timelineStart + duration,
      duration,
    };
    if (item.timelineStart === undefined) {
      cursorsByPass.set(passKey, cursor + duration);
    }
    return clip;
  });
}

export function getRenderJobs(projectId: string): RenderJob[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM render_jobs
       WHERE projectId = ?
       ORDER BY completedAt DESC, startedAt DESC, name ASC`,
    )
    .all(projectId) as DbRenderJobRow[];

  return rows.map((row) => ({
    ...row,
    passId: row.passId ?? undefined,
    outputPath: row.outputPath ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    command: row.command ?? undefined,
    logPath: row.logPath ?? undefined,
  }));
}

export function getNotes(projectId: string): Note[] {
  const rows = getDb()
    .prepare("SELECT * FROM notes WHERE projectId = ? ORDER BY createdAt DESC")
    .all(projectId) as DbNoteRow[];

  return rows.map((row) => ({
    ...row,
    assetId: row.assetId ?? undefined,
    passId: row.passId ?? undefined,
    timelineItemId: row.timelineItemId ?? undefined,
    timecodeStart: row.timecodeStart ?? undefined,
    timecodeEnd: row.timecodeEnd ?? undefined,
    metadata: parseJson(row.metadata, {}),
  }));
}

export function addNote(input: {
  projectId: string;
  passId?: string;
  timelineItemId?: string;
  author: "user" | "ai";
  noteType: string;
  body: string;
  timecodeStart?: number;
  timecodeEnd?: number;
  status?: string;
}) {
  const timestamp = now();
  const database = getDb();
  const timelineItem = input.timelineItemId
    ? (database
        .prepare("SELECT assetId FROM timeline_items WHERE id = ? AND projectId = ?")
        .get(input.timelineItemId, input.projectId) as { assetId: string | null } | undefined)
    : undefined;

  database
    .prepare(
      `INSERT INTO notes (
        id, projectId, assetId, passId, timelineItemId, author, noteType, body,
        timecodeStart, timecodeEnd, status, createdAt, updatedAt, metadata
      ) VALUES (
        @id, @projectId, @assetId, @passId, @timelineItemId, @author, @noteType, @body,
        @timecodeStart, @timecodeEnd, @status, @createdAt, @updatedAt, @metadata
      )`,
    )
    .run({
      id: randomUUID(),
      projectId: input.projectId,
      assetId: timelineItem?.assetId ?? null,
      passId: input.passId ?? null,
      timelineItemId: input.timelineItemId ?? null,
      author: input.author,
      noteType: input.noteType,
      body: input.body,
      timecodeStart: input.timecodeStart ?? null,
      timecodeEnd: input.timecodeEnd ?? null,
      status: input.status ?? "open",
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: "{}",
    });
}

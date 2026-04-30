import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Note, Pass, Project } from "./types";

const dataDir = path.join(process.cwd(), ".cut-notes");
const dbPath = path.join(dataDir, "cut-notes.sqlite");

type DbProjectRow = Omit<Project, "metadata"> & { metadata: string };
type DbPassRow = Pass;
type DbNoteRow = Omit<Note, "metadata"> & { metadata: string };

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
}

function seed(database: Database.Database) {
  const count = database.prepare("SELECT COUNT(*) as count FROM projects").get() as {
    count: number;
  };

  if (count.count > 0) return;

  const timestamp = now();
  const projectId = "piano-hand-size-part-2";

  database
    .prepare(
      `INSERT INTO projects (id, name, rootPath, status, createdAt, updatedAt, metadata)
       VALUES (@id, @name, @rootPath, @status, @createdAt, @updatedAt, @metadata)`,
    )
    .run({
      id: projectId,
      name: "Piano Hand Size Part 2",
      rootPath: "/Users/lionelyu/Music/Piano Hand Size Part 2",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: JSON.stringify({
        thesis:
          "I drove overnight to pick up rare DS 6.0 and DS 5.5 piano keyboards because hand size changes the way you experience the piano.",
        targetRuntime: "11:30-12:30",
        currentPass: "Pass 5: Rough Review Cut",
        githubRepo: "https://github.com/musical-basics/piano-hand-size-2-video",
      }),
    });

  const passes = [
    ["pass-0-plan", "Pass 0: Plan", 0, "done", "Define thesis, structure, tone, and target length."],
    ["pass-1-descriptors", "Pass 1: Visual Descriptors", 1, "done", "Add visual descriptors to every transcript."],
    ["pass-2-shortlist", "Pass 2: Moment Shortlist", 2, "done", "Create an unordered pool of usable moments."],
    ["pass-3-paper-edit", "Pass 3: Paper Edit", 3, "done", "Turn the shortlist into a rough ordered story."],
    ["pass-4-assembly", "Pass 4: Assembly Notes", 4, "done", "Specify source ranges, b-roll, labels, and render notes."],
    ["pass-5-rough-cut", "Pass 5: Rough Review Cut", 5, "needs_review", "Review the first automated rough cut and collect fixes."],
  ] as const;

  const insertPass = database.prepare(
    `INSERT INTO passes (id, projectId, name, "order", status, goal, startedAt, completedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const [id, name, order, status, goal] of passes) {
    insertPass.run(id, projectId, name, order, status, goal, timestamp, status === "done" ? timestamp : null);
  }

  const insertNote = database.prepare(
    `INSERT INTO notes (
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
      metadata: { linkedOutput: "review_cuts/piano_hand_size_part2_rough_cut_v1.mp4" },
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
  author: "user" | "ai";
  noteType: string;
  body: string;
  status?: string;
}) {
  const timestamp = now();

  getDb()
    .prepare(
      `INSERT INTO notes (
        id, projectId, assetId, passId, timelineItemId, author, noteType, body,
        timecodeStart, timecodeEnd, status, createdAt, updatedAt, metadata
      ) VALUES (
        @id, @projectId, NULL, @passId, NULL, @author, @noteType, @body,
        NULL, NULL, @status, @createdAt, @updatedAt, @metadata
      )`,
    )
    .run({
      id: randomUUID(),
      projectId: input.projectId,
      passId: input.passId ?? null,
      author: input.author,
      noteType: input.noteType,
      body: input.body,
      status: input.status ?? "open",
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: "{}",
    });
}

# Editor App Plan

Working name: `Cut Notes`

Purpose: a reusable local web app for reviewing video projects, attaching structured notes to clips, tracking each editing pass, and generating edit manifests/scripts that an AI agent can act on.

The main function is **notes**. The video UI exists to make notes precise.

## Core Idea

Each video project gets one project record in the database. Everything belongs to that project:

- assets
- transcripts
- visual descriptors
- passes
- clip notes
- timeline decisions
- AI action logs
- render outputs

The app should let the user and AI write into the same project memory, so every editing decision has a visible trail.

## Recommended Stack

- Next.js
- TypeScript
- Tailwind / shadcn-ui
- SQLite for local persistence
- Drizzle ORM or Prisma
- ffprobe for media metadata
- ffmpeg for rendering rough/final cuts

Start as a local Next.js app. Wrap with Tauri/Electron later only if we want a packaged desktop app.

## Database Shape

Use one SQLite database file:

```text
.cut-notes/cut-notes.sqlite
```

The project folder can also keep a portable export:

```text
project.editor.json
```

SQLite is the source of truth during editing. JSON export is for backup, git diff, and agent handoff.

## Data Model

### projects

One row per video project.

```ts
type Project = {
  id: string;
  name: string;
  rootPath: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  metadata: {
    thesis?: string;
    targetRuntime?: string;
    currentPass?: string;
    githubRepo?: string;
  };
};
```

For this project:

```text
Piano Hand Size Part 2
```

### assets

One row per clip, still, contact sheet, transcript, or generated render.

```ts
type Asset = {
  id: string;
  projectId: string;
  kind: "video" | "image" | "transcript" | "contact_sheet" | "render" | "placeholder";
  path: string;
  basename: string;
  originalId?: string;
  sequence?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  rotation: 0 | 90 | 180 | 270;
  hasAudio?: boolean;
  status: "active" | "placeholder" | "skip" | "missing";
  metadata: Record<string, unknown>;
};
```

Important fields:

- `rotation`: user can mark clips that need rotation.
- `status`: user can mark skip/placeholder/missing.
- `metadata`: stores source folder, pass tags, transcript path, contact sheet path, etc.

### passes

One row per editing pass.

```ts
type Pass = {
  id: string;
  projectId: string;
  name: string;
  order: number;
  status: "planned" | "in_progress" | "done" | "needs_review";
  goal: string;
  startedAt?: string;
  completedAt?: string;
};
```

Example passes:

- Pass 0: Plan
- Pass 1: Visual Descriptors
- Pass 2: Moment Shortlist
- Pass 3: Paper Edit
- Pass 4: Assembly Notes
- Pass 5: Rough Review Cut
- Pass 6: User Review Fixes

### notes

This is the heart of the app.

Every user note and AI note is stored here.

```ts
type Note = {
  id: string;
  projectId: string;
  assetId?: string;
  passId?: string;
  timelineItemId?: string;
  author: "user" | "ai";
  noteType:
    | "general"
    | "clip_review"
    | "rotation"
    | "trim"
    | "reorder"
    | "issue"
    | "fix_log"
    | "render_note"
    | "decision";
  body: string;
  timecodeStart?: number;
  timecodeEnd?: number;
  status: "open" | "resolved" | "rejected" | "done";
  createdAt: string;
  updatedAt: string;
  metadata: {
    oldValue?: unknown;
    newValue?: unknown;
    severity?: "low" | "medium" | "high";
    linkedOutput?: string;
  };
};
```

Examples:

```text
User note:
Clip 042 is sideways. Rotate 90 clockwise.

AI fix log:
Set asset rotation for 042_IMG_0298_tionesta_lake_cutaway.MOV to 90 degrees clockwise and regenerated rough cut v2.
```

```text
User note:
At 6:42, cut the car monologue sooner. This section drags.

AI fix log:
Shortened 041_IMG_0297 segment from 31 seconds to 18 seconds and covered the cut with DS key-size b-roll from 018.
```

### timeline_items

The actual edit manifest.

```ts
type TimelineItem = {
  id: string;
  projectId: string;
  assetId?: string;
  passId?: string;
  section: string;
  order: number;
  sourceIn?: number;
  sourceOut?: number;
  targetDuration?: number;
  role: "a_roll" | "b_roll" | "ambient" | "title_card" | "placeholder" | "still";
  enabled: boolean;
  rotationOverride?: 0 | 90 | 180 | 270;
  textOverlay?: string;
  notes?: string;
};
```

This is what generates ffmpeg scripts.

### render_jobs

Tracks every rough cut or final render.

```ts
type RenderJob = {
  id: string;
  projectId: string;
  passId?: string;
  name: string;
  status: "queued" | "running" | "done" | "failed";
  outputPath?: string;
  startedAt?: string;
  completedAt?: string;
  command?: string;
  logPath?: string;
};
```

## Notes Workflow

### User Review Loop

1. User opens rough cut or individual clip in the app.
2. User adds notes:
   - rotate this clip
   - move this earlier
   - cut this line
   - this section drags
   - use this b-roll here
   - this placeholder still needs recording
3. Notes are saved immediately to SQLite.
4. Notes are grouped by project, pass, clip, and timeline item.

### AI Fix Loop

1. AI reads all open notes for the current project/pass.
2. AI updates the edit manifest, scripts, descriptors, or pass docs.
3. AI writes a `fix_log` note back into the same notes table.
4. AI marks the original user note as `resolved` or `needs_review`.
5. User verifies the change in the next rough cut.

Important: the AI should never silently change the edit. Every change should leave a note.

## App Screens

### 1. Project Home

Shows:

- project name
- current pass
- total clips
- open notes
- unresolved rotation issues
- latest render
- next action

Primary actions:

- scan project folder
- open clip review
- open timeline
- render rough cut
- export project JSON

### 2. Clip Notes

Main working screen.

Left:

- clip list
- filters: needs rotation, has notes, strong moments, placeholder, skipped

Center:

- video player
- transcript
- contact sheet thumbnails

Right:

- notes panel
- rotation control
- keep/skip
- source in/out
- pass tags

Keyboard shortcuts:

- `I`: set in
- `O`: set out
- `R`: rotate 90 clockwise
- `K`: keep
- `S`: skip
- `N`: new note
- `J/K/L`: playback navigation

### 3. Timeline Notes

Shows the current paper edit / assembly as cards.

Each card shows:

- source clip
- source in/out
- target duration
- role
- notes count
- rotation status
- thumbnail/contact-sheet frame

User can:

- drag earlier/later
- disable a moment
- adjust source in/out
- add timeline-specific notes
- mark a section as dragging/confusing/strong

### 4. Pass Review

Shows notes and AI logs by pass.

Example:

```text
Pass 5: Rough Review Cut

Open user notes:
- Rotate 042 lake clip.
- Cut down factory internals.
- Move car breakdown earlier.

AI fix logs:
- Rotated 042 by 90 degrees clockwise.
- Shortened 027 internals sequence from 35s to 18s.
- Moved 048 car-breakdown flash into cold open.
```

### 5. Render Panel

Shows:

- latest rough cut
- render history
- ffmpeg command/log
- unresolved notes before render

Actions:

- render rough cut
- render notes-only review
- export ffmpeg script

## Agent Contract

When the AI edits the project, it should always:

1. Read open notes for the active pass.
2. Apply changes to the manifest/docs/scripts.
3. Create a new AI `fix_log` note for each user note handled.
4. Mark user notes as `resolved` only if the fix is actually implemented.
5. Leave notes as `needs_review` when the AI made a judgment call.
6. Generate a new render if requested.

AI notes should be plain and verifiable:

```text
Done: shortened the DS standard explanation in 054 from 75s to 35s in make_rough_review_cut.sh and regenerated rough_cut_v2.mp4.
```

Bad AI note:

```text
Improved pacing.
```

## File Outputs

The app should generate:

```text
.cut-notes/cut-notes.sqlite
project.editor.json
edit_manifest.json
render_scripts/
review_cuts/
```

For git:

- Commit `project.editor.json`, manifests, scripts, pass docs, transcripts.
- Ignore raw video unless Git LFS is installed.
- Ignore generated review MP4s unless explicitly requested.

## MVP Build Order

1. Scaffold Next.js app inside `editor-app/`.
2. Add SQLite schema and project scan command.
3. Import current project assets, transcripts, Pass 2/3/4 docs.
4. Build clip list + notes panel.
5. Add rotation, keep/skip, in/out fields.
6. Build timeline card view from `PASS4_ASSEMBLY_NOTES.md`.
7. Generate `edit_manifest.json`.
8. Generate rough cut from manifest.
9. Add AI fix-log workflow.

## Reusability Rule

Nothing should be hardcoded to Piano Hand Size Part 2 except the initial imported project data.

The reusable concepts are:

- project
- asset
- pass
- note
- timeline item
- render job
- AI fix log

That makes the app reusable for future YouTube videos, courses, music demos, client edits, and any workflow where the edit is driven by review notes.

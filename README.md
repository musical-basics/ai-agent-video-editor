# AI Agent Video Editor

A reusable, notes-first review app for AI-assisted video editing.

The core idea is simple: the human marks what needs to change, the AI performs the next edit pass, and the AI writes a fix log back into the same project database so the next review can verify what actually changed.

## Current Scope

- Next.js App Router dashboard
- Local SQLite database at `.cut-notes/cut-notes.sqlite`
- One active seeded project for the Piano Hand Size Part 2 workflow
- Horizontal rough-cut timeline with clip blocks, tracks, time ruler, and thumbnails
- Preview pane for the selected timeline clip, including local video playback where supported
- Playback controls with start, pause, stop, previous/next clip, spacebar toggle, scroll-to-cursor, and follow-cursor mode
- Pass tracker for plan, descriptors, shortlist, paper edit, assembly, and rough cut review
- User review notes for clip rotation, trims, reorder requests, issues, decisions, and general comments
- AI fix-log notes in the same project ledger

## Workflow

1. Open the app during rough-cut review.
2. Select a timeline clip, scrub the playback cursor, or press start to move through the assembly.
3. Add notes against the current pass and timeline clip.
4. Run the next AI edit pass using the open notes as the checklist.
5. After the edit, the AI adds `fix_log` notes describing what changed.
6. Review the next render and keep iterating from the same database.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run lint
npm run build
```

## Data Model

The app keeps all project information under one project entry and connects related records by `projectId`.

- `projects`: root project state and metadata
- `assets`: source clips, transcripts, renders, contact sheets, and placeholders
- `passes`: named workflow stages
- `timeline_items`: ordered edit decisions for an assembly
- `notes`: user notes and AI fix logs
- `render_jobs`: render commands and outputs

The SQLite file is local-only and ignored by git. Future versions can add import/export commands when a project needs to move between machines.

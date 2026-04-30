# Workflow Notes

This app is the reusable layer for review-driven editing. It should stay project-agnostic, but it can seed a project when a local workflow starts.

## Project Loop

1. **Plan:** Define thesis, structure, tone, target runtime, and known pickup clips.
2. **Index:** Keep transcripts, visual descriptors, and source metadata near the source assets.
3. **Shortlist:** Tag useful moments without ordering them yet.
4. **Paper Edit:** Turn the shortlist into story order.
5. **Assembly:** Convert the paper edit into source ranges, placeholders, labels, and render instructions.
6. **Review Cut:** Generate a render for the human to watch.
7. **Write Back:** AI writes the pass-specific `timeline_items`, `render_jobs`, and `fix_log` notes to the project database.
8. **Timeline Review:** Human watches the rendered review cut, scans the matching horizontally scrollable timeline, uses the playback cursor and transport controls, presses space to toggle playback, selects clips, and checks the source preview pane for the exact region that needs work.
9. **Notes:** Human records corrections in this app, linked to the current pass and timeline clip where possible.
10. **Fix Pass:** AI edits against open notes and writes the next pass back to the same project database.

## Note Contract

User notes should be direct and actionable:

- clip name or timeline location when known
- requested edit: rotate, trim, move earlier, move later, replace, mute, add label, or investigate
- optional start/end timecodes

AI fix logs should be checkable:

- original user note being addressed
- actual change made
- file, script, or render affected
- any reason the request was not fully completed

## AI Pass Write-Back Contract

Every AI edit pass should create or update:

- `passes`: one row for the new pass, with `status = needs_review` when rendered
- `timeline_items`: the actual cut order for that pass, using the same `passId`
- `render_jobs`: the rendered MP4 path, command, status, and pass link
- `notes`: AI-authored `fix_log` notes describing the changes
- `projects.metadata`: `currentPassId`, `currentRenderJobId`, and `currentPass`

The render script can exist as an implementation detail, but the UI should be able to
reconstruct what the viewer is reviewing from SQLite.

## Reusable Direction

The first version stores notes locally in SQLite and renders a server-side dashboard. The next useful additions are:

- asset import from a project folder
- clip thumbnail/contact-sheet review
- timeline item editing
- note status updates
- JSON export for agents

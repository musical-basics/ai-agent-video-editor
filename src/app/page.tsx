import { Bot, Clock3, Database, Film, GitBranch, SlidersHorizontal } from "lucide-react";
import { EditorWorkbench } from "@/components/editor-workbench";
import {
  getActiveProject,
  getNotes,
  getPasses,
  getRenderJobs,
  getTimelineClips,
} from "@/lib/db";
import type { PassStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const passStatusStyles: Record<PassStatus, string> = {
  planned: "border-neutral-700 bg-neutral-900 text-neutral-400",
  in_progress: "border-blue-700 bg-blue-950 text-blue-300",
  done: "border-emerald-800 bg-emerald-950 text-emerald-300",
  needs_review: "border-amber-700 bg-amber-950 text-amber-300",
};

const noteTypeBadge: Record<string, string> = {
  general: "bg-neutral-800 text-neutral-300",
  clip_review: "bg-blue-900 text-blue-300",
  rotation: "bg-cyan-900 text-cyan-300",
  trim: "bg-amber-900 text-amber-300",
  reorder: "bg-violet-900 text-violet-300",
  issue: "bg-red-900 text-red-300",
  fix_log: "bg-green-900 text-green-300",
  render_note: "bg-orange-900 text-orange-300",
  decision: "bg-emerald-900 text-emerald-300",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

export default function Home() {
  const project = getActiveProject();
  const passes = getPasses(project.id);
  const timelineClips = getTimelineClips(project.id);
  const renderJobs = getRenderJobs(project.id);
  const timelinePassIds = new Set(timelineClips.map((clip) => clip.passId).filter(Boolean));
  const latestTimelinePass =
    [...passes].reverse().find((pass) => timelinePassIds.has(pass.id)) ?? passes.at(-1);
  const currentTimelineClips = latestTimelinePass
    ? timelineClips.filter((clip) => clip.passId === latestTimelinePass.id)
    : timelineClips;
  const notes = getNotes(project.id);
  const openNotes = notes.filter((note) => ["open", "needs_review"].includes(note.status));
  const aiLogs = notes.filter((note) => note.author === "ai");
  const userNotes = notes.filter((note) => note.author === "user");
  const passById = new Map(passes.map((pass) => [pass.id, pass]));
  const clipById = new Map(timelineClips.map((clip) => [clip.id, clip]));

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="grid gap-3 border-b border-neutral-800 pb-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500">
              <span className="inline-flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 py-0.5">
                <Database className="h-3 w-3" aria-hidden="true" />
                SQLite project notes
              </span>
              <span className="inline-flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 py-0.5">
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                {project.metadata.githubRepo ?? "no repo linked"}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
                {project.name}
              </h1>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-neutral-400">
                {project.metadata.thesis}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:w-[460px] sm:grid-cols-4">
            <Metric label="Passes" value={`${passes.length}`} />
            <Metric label="Clips" value={`${currentTimelineClips.length}`} />
            <Metric label="Open Notes" value={`${openNotes.length}`} />
            <Metric label="AI Logs" value={`${aiLogs.length}`} />
          </div>
        </header>

        <EditorWorkbench
          project={project}
          passes={passes}
          timelineClips={timelineClips}
          renderJobs={renderJobs}
          notes={notes}
        />

        <section className="grid gap-3 lg:grid-cols-2">
          <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[10px] uppercase tracking-widest text-neutral-500">
                Current Pass
              </h2>
              <Clock3 className="h-4 w-4 text-neutral-600" aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-neutral-100">
              {project.metadata.currentPass}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Info label="Runtime" value={project.metadata.targetRuntime ?? "Unset"} />
              <Info label="Root" value={project.rootPath} />
            </dl>
          </div>

          <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[10px] uppercase tracking-widest text-neutral-500">
                Agent Loop
              </h2>
              <Bot className="h-4 w-4 text-neutral-600" aria-hidden="true" />
            </div>
            <div className="grid gap-2 text-xs leading-5 text-neutral-400">
              <p>
                User notes stay open until the next edit pass. AI notes are written back as fix logs
                so the review cut can be checked against the request.
              </p>
              <p>
                Each fix log should name the clip, the edit decision, and the render or script that
                contains the change.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded border border-neutral-800 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
              <h2 className="text-[10px] uppercase tracking-widest text-neutral-500">
                Pass Tracker
              </h2>
              <SlidersHorizontal className="h-4 w-4 text-neutral-600" aria-hidden="true" />
            </div>
            <ol className="divide-y divide-neutral-800">
              {passes.map((pass) => (
                <li
                  key={pass.id}
                  className="grid gap-1.5 px-3 py-2 sm:grid-cols-[140px_1fr_auto] sm:items-center"
                >
                  <div className="text-xs font-semibold text-neutral-200">{pass.name}</div>
                  <p className="text-xs leading-5 text-neutral-500">{pass.goal}</p>
                  <span
                    className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${passStatusStyles[pass.status]}`}
                  >
                    {humanize(pass.status)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded border border-neutral-800 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
              <div>
                <h2 className="text-[10px] uppercase tracking-widest text-neutral-500">
                  Note Ledger
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {userNotes.length} user · {aiLogs.length} AI
                </p>
              </div>
              <Film className="h-4 w-4 text-neutral-600" aria-hidden="true" />
            </div>
            <div className="divide-y divide-neutral-800">
              {notes.map((note) => {
                const pass = note.passId ? passById.get(note.passId) : undefined;
                const clip = note.timelineItemId ? clipById.get(note.timelineItemId) : undefined;
                const badgeCls =
                  noteTypeBadge[note.noteType] ?? "bg-neutral-800 text-neutral-300";
                return (
                  <article key={note.id} className="grid gap-2 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span
                        className={
                          note.author === "ai"
                            ? "rounded bg-blue-900 px-1.5 py-0.5 text-blue-300"
                            : "rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300"
                        }
                      >
                        {note.author}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 ${badgeCls}`}>
                        {humanize(note.noteType)}
                      </span>
                      <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">
                        {humanize(note.status)}
                      </span>
                      {note.timecodeStart !== undefined ? (
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 tabular-nums text-neutral-400">
                          {note.timecodeStart}
                          {note.timecodeEnd !== undefined ? `-${note.timecodeEnd}` : ""}s
                        </span>
                      ) : null}
                      {pass ? <span className="text-neutral-600">{pass.name}</span> : null}
                      {clip ? (
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">
                          {clip.asset?.originalId ?? clip.asset?.basename ?? clip.section}
                        </span>
                      ) : null}
                      <span className="ml-auto text-neutral-700">{formatDate(note.createdAt)}</span>
                    </div>
                    <p className="text-xs leading-6 text-neutral-300">{note.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <dl className="rounded border border-neutral-800 bg-neutral-900 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold text-neutral-100">{value}</dd>
    </dl>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-neutral-800 bg-neutral-950 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-medium text-neutral-300" title={value}>
        {value}
      </dd>
    </div>
  );
}

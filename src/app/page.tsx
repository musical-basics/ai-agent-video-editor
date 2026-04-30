import {
  Bot,
  Clock3,
  Database,
  Film,
  GitBranch,
  SlidersHorizontal,
} from "lucide-react";
import { EditorWorkbench } from "@/components/editor-workbench";
import { getActiveProject, getNotes, getPasses, getTimelineClips } from "@/lib/db";
import type { PassStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const passStatusStyles: Record<PassStatus, string> = {
  planned: "border-zinc-200 bg-zinc-50 text-zinc-600",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  needs_review: "border-amber-200 bg-amber-50 text-amber-800",
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
  const notes = getNotes(project.id);
  const openNotes = notes.filter((note) =>
    ["open", "needs_review"].includes(note.status),
  );
  const aiLogs = notes.filter((note) => note.author === "ai");
  const userNotes = notes.filter((note) => note.author === "user");
  const passById = new Map(passes.map((pass) => [pass.id, pass]));
  const clipById = new Map(timelineClips.map((clip) => [clip.id, clip]));

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="grid gap-4 border-b border-zinc-200 pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-600">
              <span className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1">
                <Database className="h-4 w-4" aria-hidden="true" />
                SQLite project notes
              </span>
              <span className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1">
                <GitBranch className="h-4 w-4" aria-hidden="true" />
                {project.metadata.githubRepo ?? "No repo linked"}
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
                {project.name}
              </h1>
              <p className="mt-2 max-w-4xl text-base leading-7 text-zinc-600">
                {project.metadata.thesis}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:w-[520px] sm:grid-cols-4">
            <Metric label="Passes" value={`${passes.length}`} />
            <Metric label="Clips" value={`${timelineClips.length}`} />
            <Metric label="Open Notes" value={`${openNotes.length}`} />
            <Metric label="AI Logs" value={`${aiLogs.length}`} />
          </div>
        </header>

        <EditorWorkbench
          project={project}
          passes={passes}
          timelineClips={timelineClips}
          notes={notes}
        />

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Current Pass
              </h2>
              <Clock3 className="h-5 w-5 text-zinc-500" aria-hidden="true" />
            </div>
            <p className="text-xl font-semibold text-zinc-950">
              {project.metadata.currentPass}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Info label="Runtime" value={project.metadata.targetRuntime ?? "Unset"} />
              <Info label="Root" value={project.rootPath} />
            </dl>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Agent Loop
              </h2>
              <Bot className="h-5 w-5 text-zinc-500" aria-hidden="true" />
            </div>
            <div className="grid gap-3 text-sm leading-6 text-zinc-700">
              <p>
                User notes stay open until the next edit pass. AI notes are
                written back as fix logs so the review cut can be checked
                against the request.
              </p>
              <p>
                Each fix log should name the clip, the edit decision, and the
                render or script that contains the change.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Pass Tracker
              </h2>
              <SlidersHorizontal className="h-5 w-5 text-zinc-500" aria-hidden="true" />
            </div>
            <ol className="divide-y divide-zinc-200">
              {passes.map((pass) => (
                <li key={pass.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[160px_1fr_auto] sm:items-center">
                  <div className="text-sm font-semibold text-zinc-950">
                    {pass.name}
                  </div>
                  <p className="text-sm leading-6 text-zinc-600">{pass.goal}</p>
                  <span
                    className={`inline-flex w-fit items-center rounded-md border px-2 py-1 text-xs font-semibold capitalize ${passStatusStyles[pass.status]}`}
                  >
                    {humanize(pass.status)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Note Ledger
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  {userNotes.length} user notes, {aiLogs.length} AI notes.
                </p>
              </div>
              <Film className="h-5 w-5 text-zinc-500" aria-hidden="true" />
            </div>
            <div className="divide-y divide-zinc-200">
              {notes.map((note) => {
                const pass = note.passId ? passById.get(note.passId) : undefined;
                const clip = note.timelineItemId ? clipById.get(note.timelineItemId) : undefined;
                return (
                  <article key={note.id} className="grid gap-3 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                      <span
                        className={
                          note.author === "ai"
                            ? "rounded-md bg-blue-50 px-2 py-1 text-blue-700"
                            : "rounded-md bg-zinc-100 px-2 py-1 text-zinc-700"
                        }
                      >
                        {note.author}
                      </span>
                      <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">
                        {humanize(note.noteType)}
                      </span>
                      <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">
                        {humanize(note.status)}
                      </span>
                      {note.timecodeStart !== undefined ? (
                        <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">
                          {note.timecodeStart}
                          {note.timecodeEnd !== undefined ? `-${note.timecodeEnd}` : ""}s
                        </span>
                      ) : null}
                      {pass ? (
                        <span className="text-zinc-500">{pass.name}</span>
                      ) : null}
                      {clip ? (
                        <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">
                          {clip.asset?.originalId ?? clip.asset?.basename ?? clip.section}
                        </span>
                      ) : null}
                      <span className="ml-auto text-zinc-500">
                        {formatDate(note.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-zinc-800">{note.body}</p>
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
    <dl className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-zinc-950">{value}</dd>
    </dl>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium text-zinc-800" title={value}>
        {value}
      </dd>
    </div>
  );
}

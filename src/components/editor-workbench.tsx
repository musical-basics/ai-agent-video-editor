"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BadgeAlert,
  LocateFixed,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  SkipBack,
  SkipForward,
  Square,
  type LucideIcon,
} from "lucide-react";
import { createNote } from "@/app/actions";
import { TimelinePanel } from "@/components/timeline-panel";
import type { Note, NoteType, Pass, Project, TimelineClip } from "@/lib/types";

type QuickAction = {
  label: string;
  icon: LucideIcon;
  noteType: NoteType;
  body: (clip: TimelineClip) => string;
};

const noteTypes: Array<{ value: NoteType; label: string }> = [
  { value: "general", label: "general" },
  { value: "clip_review", label: "clip review" },
  { value: "rotation", label: "rotation" },
  { value: "trim", label: "trim" },
  { value: "reorder", label: "reorder" },
  { value: "issue", label: "issue" },
  { value: "decision", label: "decision" },
  { value: "fix_log", label: "fix log" },
];

const noteTypeBadge: Record<string, string> = {
  general: "bg-neutral-700 text-neutral-300",
  clip_review: "bg-blue-900 text-blue-300",
  rotation: "bg-cyan-900 text-cyan-300",
  trim: "bg-amber-900 text-amber-300",
  reorder: "bg-violet-900 text-violet-300",
  issue: "bg-red-900 text-red-300",
  fix_log: "bg-green-900 text-green-300",
  render_note: "bg-orange-900 text-orange-300",
  decision: "bg-emerald-900 text-emerald-300",
};

const roleBadge: Record<string, string> = {
  a_roll: "bg-blue-700 text-blue-100",
  b_roll: "bg-teal-800 text-teal-100",
  ambient: "bg-neutral-700 text-neutral-200",
  title_card: "bg-purple-800 text-purple-100",
  still: "bg-amber-800 text-amber-100",
  placeholder: "bg-neutral-800 text-neutral-400",
};

const quickActions: QuickAction[] = [
  {
    label: "Rotate CW",
    icon: RotateCw,
    noteType: "rotation",
    body: (clip) => `${clipName(clip)}: rotate this clip 90 degrees clockwise.`,
  },
  {
    label: "Rotate CCW",
    icon: RotateCcw,
    noteType: "rotation",
    body: (clip) => `${clipName(clip)}: rotate this clip 90 degrees counterclockwise.`,
  },
  {
    label: "Trim",
    icon: Scissors,
    noteType: "trim",
    body: (clip) => `${clipName(clip)}: trim this clip. Note exact start/end points here.`,
  },
  {
    label: "Move Earlier",
    icon: ArrowUpToLine,
    noteType: "reorder",
    body: (clip) => `${clipName(clip)}: move this clip earlier in the sequence.`,
  },
  {
    label: "Move Later",
    icon: ArrowDownToLine,
    noteType: "reorder",
    body: (clip) => `${clipName(clip)}: move this clip later in the sequence.`,
  },
  {
    label: "Issue",
    icon: BadgeAlert,
    noteType: "issue",
    body: (clip) => `${clipName(clip)}: investigate this clip. Describe the problem here.`,
  },
];

function formatTime(totalSeconds?: number) {
  if (totalSeconds === undefined) return "--:--";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function mediaUrl(pathValue: unknown) {
  if (typeof pathValue !== "string" || !pathValue) return undefined;
  return `/media/${pathValue.split("/").map(encodeURIComponent).join("/")}`;
}

function clipName(clip: TimelineClip) {
  return (
    clip.asset?.originalId ??
    clip.asset?.basename ??
    clip.textOverlay ??
    clip.section
  );
}

function sourceName(clip: TimelineClip) {
  return clip.asset?.basename ?? clip.textOverlay ?? "—";
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function EditorWorkbench({
  project,
  passes,
  timelineClips,
  notes,
}: {
  project: Project;
  passes: Pass[];
  timelineClips: TimelineClip[];
  notes: Note[];
}) {
  const [selectedPassId, setSelectedPassId] = useState("pass-5-rough-cut");
  const [noteType, setNoteType] = useState<NoteType>("clip_review");
  const [draft, setDraft] = useState("");
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [scrollSignal, setScrollSignal] = useState(0);
  const totalDuration = useMemo(
    () => Math.max(0, ...timelineClips.map((clip) => clip.timelineEnd)),
    [timelineClips],
  );
  const selectedClip = clipAtTime(timelineClips, playheadTime) ?? timelineClips[0];
  const clipNotes = useMemo(
    () => notes.filter((note) => note.timelineItemId === selectedClip?.id),
    [notes, selectedClip?.id],
  );
  const selectedClipIndex = selectedClip
    ? timelineClips.findIndex((clip) => clip.id === selectedClip.id)
    : -1;

  useEffect(() => {
    if (!isPlaying || totalDuration <= 0) return;

    let animationFrame = 0;
    let previousTime = performance.now();

    const tick = (timestamp: number) => {
      const deltaSeconds = (timestamp - previousTime) / 1000;
      previousTime = timestamp;

      setPlayheadTime((currentTime) => {
        const nextTime = currentTime + deltaSeconds;
        if (nextTime >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }
        return nextTime;
      });

      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, totalDuration]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space") return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTyping) return;

      event.preventDefault();
      setIsPlaying((value) => !value);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function applyQuickAction(action: QuickAction) {
    if (!selectedClip) return;
    setNoteType(action.noteType);
    setDraft(action.body(selectedClip));
  }

  function seekToTime(nextTime: number) {
    const boundedTime = clamp(nextTime, 0, totalDuration);
    setPlayheadTime(boundedTime);
  }

  function selectClip(clipId: string) {
    const clip = timelineClips.find((item) => item.id === clipId);
    if (clip) setPlayheadTime(clip.timelineStart);
  }

  function stopPlayback() {
    setIsPlaying(false);
    seekToTime(0);
  }

  function jumpToClip(direction: -1 | 1) {
    if (selectedClipIndex < 0) return;
    const nextClip = timelineClips[clamp(selectedClipIndex + direction, 0, timelineClips.length - 1)];
    if (!nextClip) return;
    setPlayheadTime(nextClip.timelineStart);
    setScrollSignal((value) => value + 1);
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded border border-neutral-800 bg-neutral-950 text-neutral-100">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-2">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">
          Editor
        </span>
        <span className="text-neutral-700">/</span>
        <span className="text-sm font-semibold text-neutral-100">
          {project.name}
        </span>
        <span className="ml-auto text-[10px] text-neutral-600">
          {timelineClips.length} clips · {notes.length} notes
        </span>
      </header>

      <TransportBar
        isPlaying={isPlaying}
        followPlayhead={followPlayhead}
        playheadTime={playheadTime}
        totalDuration={totalDuration}
        onTogglePlay={() => setIsPlaying((value) => !value)}
        onStop={stopPlayback}
        onJumpPrevious={() => jumpToClip(-1)}
        onJumpNext={() => jumpToClip(1)}
        onSeek={seekToTime}
        onScrollToCursor={() => setScrollSignal((value) => value + 1)}
        onToggleFollow={() => setFollowPlayhead((value) => !value)}
      />

      <TimelinePanel
        clips={timelineClips}
        notes={notes}
        selectedClipId={selectedClip?.id}
        playheadTime={playheadTime}
        followPlayhead={followPlayhead}
        scrollSignal={scrollSignal}
        onSelectClip={selectClip}
        onSeek={seekToTime}
      />

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className="w-full flex-none border-b border-neutral-800 xl:w-80 xl:border-b-0 xl:border-r">
          <PreviewPane
            clip={selectedClip}
            clipNotes={clipNotes}
            isPlaying={isPlaying}
            playheadTime={playheadTime}
            onQuickAction={applyQuickAction}
          />
        </div>

        <div id="note-form" className="flex min-w-0 flex-1 flex-col">
          <form action={createNote} className="flex flex-col gap-2 border-b border-neutral-800 p-4">
            <p className="text-[10px] uppercase tracking-widest text-neutral-600">
              Add Note
            </p>

            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="author" value="user" />

            <div className="flex flex-wrap gap-2">
              <select
                name="passId"
                value={selectedPassId}
                onChange={(event) => setSelectedPassId(event.target.value)}
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-blue-600"
              >
                {passes.map((pass) => (
                  <option key={pass.id} value={pass.id}>
                    {pass.name}
                  </option>
                ))}
              </select>

              <select
                name="noteType"
                value={noteType}
                onChange={(event) => setNoteType(event.target.value as NoteType)}
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-blue-600"
              >
                {noteTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              <select
                name="timelineItemId"
                value={selectedClip?.id ?? ""}
                onChange={(event) => selectClip(event.target.value)}
                className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-blue-600"
              >
                {timelineClips.map((clip) => (
                  <option key={clip.id} value={clip.id}>
                    {clipName(clip)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <input
                name="timecodeStart"
                inputMode="decimal"
                placeholder="Start TC (optional)"
                className="w-36 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-600 outline-none focus:border-blue-600"
              />
              <input
                name="timecodeEnd"
                inputMode="decimal"
                placeholder="End TC (optional)"
                className="w-36 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-600 outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex gap-2">
              <textarea
                name="body"
                rows={2}
                required
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Note body…"
                className="flex-1 resize-y rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-300 placeholder:text-neutral-600 outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="inline-flex h-fit items-center gap-1 self-end rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-600"
              >
                <Save className="h-3 w-3" aria-hidden="true" />
                Add
              </button>
            </div>
          </form>

          <div className="flex-1 overflow-y-auto p-4">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-neutral-600">
              Notes On Clip ({clipNotes.length})
            </p>
            {clipNotes.length === 0 ? (
              <p className="text-xs text-neutral-600">No notes for this clip yet.</p>
            ) : (
              <div className="space-y-1.5">
                {clipNotes.map((note) => {
                  const badgeCls =
                    noteTypeBadge[note.noteType] ?? "bg-neutral-700 text-neutral-300";
                  return (
                    <article
                      key={note.id}
                      className="space-y-1 rounded border border-neutral-800 bg-neutral-900 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${badgeCls}`}>
                          {humanize(note.noteType)}
                        </span>
                        <span className="text-[10px] text-neutral-500">{note.author}</span>
                        <span className="text-[10px] text-neutral-600">
                          {humanize(note.status)}
                        </span>
                        {note.timecodeStart !== undefined ? (
                          <span className="text-[10px] tabular-nums text-neutral-600">
                            {note.timecodeStart}
                            {note.timecodeEnd !== undefined ? `-${note.timecodeEnd}` : ""}s
                          </span>
                        ) : null}
                        <span className="ml-auto text-[10px] text-neutral-700">
                          {new Date(note.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-neutral-300">
                        {note.body}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function clipAtTime(clips: TimelineClip[], time: number) {
  return (
    clips.find((clip) => time >= clip.timelineStart && time < clip.timelineEnd) ??
    clips.at(-1)
  );
}

function TransportBar({
  isPlaying,
  followPlayhead,
  playheadTime,
  totalDuration,
  onTogglePlay,
  onStop,
  onJumpPrevious,
  onJumpNext,
  onSeek,
  onScrollToCursor,
  onToggleFollow,
}: {
  isPlaying: boolean;
  followPlayhead: boolean;
  playheadTime: number;
  totalDuration: number;
  onTogglePlay: () => void;
  onStop: () => void;
  onJumpPrevious: () => void;
  onJumpNext: () => void;
  onSeek: (time: number) => void;
  onScrollToCursor: () => void;
  onToggleFollow: () => void;
}) {
  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-1.5">
      <button
        type="button"
        onClick={onJumpPrevious}
        title="Previous clip"
        className="inline-flex h-7 w-7 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-300 transition hover:bg-neutral-700"
      >
        <SkipBack className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        title="Play/pause (Space)"
        className="inline-flex h-7 items-center gap-1 rounded bg-blue-700 px-2.5 text-xs font-semibold text-white transition hover:bg-blue-600"
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {isPlaying ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        onClick={onStop}
        className="inline-flex h-7 items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-700"
      >
        <Square className="h-3 w-3" aria-hidden="true" />
        Stop
      </button>
      <button
        type="button"
        onClick={onJumpNext}
        title="Next clip"
        className="inline-flex h-7 w-7 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-300 transition hover:bg-neutral-700"
      >
        <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(1, totalDuration)}
        step={0.1}
        value={playheadTime}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="mx-2 min-w-0 flex-1 accent-blue-600"
      />

      <span className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-200">
        {formatTime(playheadTime)} / {formatTime(totalDuration)}
      </span>
      <button
        type="button"
        onClick={onScrollToCursor}
        title="Scroll to cursor"
        className="inline-flex h-7 items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-700"
      >
        <LocateFixed className="h-3 w-3" aria-hidden="true" />
        Scroll
      </button>
      <button
        type="button"
        onClick={onToggleFollow}
        className={`inline-flex h-7 items-center rounded border px-2 text-xs font-semibold transition ${
          followPlayhead
            ? "border-blue-500 bg-blue-700 text-white"
            : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
        }`}
      >
        Follow
      </button>
      <span className="hidden rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500 sm:inline-flex">
        Space
      </span>
    </div>
  );
}

function PreviewPane({
  clip,
  clipNotes,
  isPlaying,
  playheadTime,
  onQuickAction,
}: {
  clip?: TimelineClip;
  clipNotes: Note[];
  isPlaying: boolean;
  playheadTime: number;
  onQuickAction: (action: QuickAction) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const thumbnail = mediaUrl(clip?.asset?.metadata.thumbnailPath);
  const source = mediaUrl(clip?.asset?.metadata.relativePath);
  const canPreviewVideo = clip?.asset?.kind === "video" && source;
  const clipOffset = clip ? clamp(playheadTime - clip.timelineStart, 0, clip.duration) : 0;
  const sourceTime = (clip?.sourceIn ?? 0) + clipOffset;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canPreviewVideo) return;

    if (Number.isFinite(sourceTime) && Math.abs(video.currentTime - sourceTime) > 0.75) {
      video.currentTime = sourceTime;
    }

    if (isPlaying) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [canPreviewVideo, clip?.id, isPlaying, sourceTime]);

  if (!clip) {
    return (
      <div className="grid h-full min-h-[240px] place-items-center text-xs text-neutral-600">
        No timeline clips found.
      </div>
    );
  }

  const badgeCls = roleBadge[clip.role] ?? "bg-neutral-700 text-neutral-300";

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="aspect-video w-full overflow-hidden rounded border border-neutral-800 bg-black">
        {canPreviewVideo ? (
          <video
            ref={videoRef}
            key={clip.id}
            className="h-full w-full object-contain"
            controls
            poster={thumbnail}
            preload="metadata"
            src={source}
          />
        ) : thumbnail ? (
          <div
            className="h-full w-full bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${thumbnail})` }}
          />
        ) : (
          <div className="grid h-full place-items-center px-3 text-center text-[10px] uppercase tracking-widest text-neutral-600">
            {clip.textOverlay ?? clip.asset?.originalId ?? "No preview"}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-sm font-semibold leading-snug text-neutral-100">
            {clipName(clip)}
          </h2>
          <span className={`flex-none rounded px-1.5 py-0.5 text-[10px] ${badgeCls}`}>
            {humanize(clip.role)}
          </span>
        </div>

        <table className="w-full border-collapse text-xs text-neutral-400">
          <tbody>
            <Row label="Source" value={sourceName(clip)} />
            <Row label="Section" value={clip.section} />
            <Row label="Timeline" value={`${formatTime(clip.timelineStart)} → ${formatTime(clip.timelineEnd)}`} mono />
            <Row label="Source Range" value={`${formatTime(clip.sourceIn)} → ${formatTime(clip.sourceOut)}`} mono />
            <Row label="Duration" value={`${clip.duration}s`} mono />
            <Row label="Status" value={humanize(clip.asset?.status ?? "unknown")} />
            <Row label="Notes" value={String(clipNotes.length)} mono />
          </tbody>
        </table>

        {clip.notes ? (
          <p className="border-t border-neutral-800 pt-2 text-xs leading-relaxed text-neutral-500">
            {clip.notes}
          </p>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-neutral-600">
          Quick Actions
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => onQuickAction(action)}
                className="inline-flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-left text-xs text-neutral-300 transition hover:bg-neutral-700"
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <tr className="border-b border-neutral-800/50">
      <td className="whitespace-nowrap py-0.5 pr-2 text-neutral-600">{label}</td>
      <td className={`py-0.5 text-neutral-300 ${mono ? "tabular-nums" : ""}`}>
        {value}
      </td>
    </tr>
  );
}

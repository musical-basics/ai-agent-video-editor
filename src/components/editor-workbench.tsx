"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BadgeAlert,
  Clock3,
  FileVideo,
  LocateFixed,
  MessageSquareText,
  NotebookPen,
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
  { value: "general", label: "General" },
  { value: "clip_review", label: "Clip Review" },
  { value: "rotation", label: "Rotation" },
  { value: "trim", label: "Trim" },
  { value: "reorder", label: "Move Front/Back" },
  { value: "issue", label: "Issue" },
  { value: "decision", label: "Decision" },
  { value: "fix_log", label: "AI Fix Log" },
];

const quickActions: QuickAction[] = [
  {
    label: "Rotate Clockwise",
    icon: RotateCw,
    noteType: "rotation",
    body: (clip) => `${clipName(clip)}: rotate this clip 90 degrees clockwise.`,
  },
  {
    label: "Rotate Counter",
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
  if (totalSeconds === undefined) return "--";

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  return clip.asset?.basename ?? clip.textOverlay ?? "No source";
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
    <section className="grid min-w-0 gap-4">
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

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.74fr)_minmax(430px,1fr)]">
        <PreviewPane
          clip={selectedClip}
          clipNotes={clipNotes}
          isPlaying={isPlaying}
          playheadTime={playheadTime}
        />

        <div id="note-form" className="min-w-0 rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Clip Notes
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Notes save against the selected timeline clip.
              </p>
            </div>
            <NotebookPen className="h-5 w-5 text-zinc-500" aria-hidden="true" />
          </div>

          <div className="grid gap-3 border-b border-zinc-200 p-4">
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => applyQuickAction(action)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-white"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>

          <form action={createNote} className="grid gap-4 p-4">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="author" value="user" />

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
                Pass
                <select
                  name="passId"
                  value={selectedPassId}
                  onChange={(event) => setSelectedPassId(event.target.value)}
                  className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
                >
                  {passes.map((pass) => (
                    <option key={pass.id} value={pass.id}>
                      {pass.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
                Note Type
                <select
                  name="noteType"
                  value={noteType}
                  onChange={(event) => setNoteType(event.target.value as NoteType)}
                  className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
                >
                  {noteTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
              Timeline Clip
              <select
                name="timelineItemId"
                value={selectedClip?.id ?? ""}
                onChange={(event) => selectClip(event.target.value)}
                className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
              >
                {timelineClips.map((clip) => (
                  <option key={clip.id} value={clip.id}>
                    {clipName(clip)} - {clip.section}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
                Start Time
                <input
                  name="timecodeStart"
                  inputMode="decimal"
                  placeholder={`timeline ${formatTime(selectedClip?.timelineStart)}`}
                  className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
                End Time
                <input
                  name="timecodeEnd"
                  inputMode="decimal"
                  placeholder={`timeline ${formatTime(selectedClip?.timelineEnd)}`}
                  className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
                />
              </label>
            </div>

            <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
              Note
              <textarea
                name="body"
                rows={6}
                required
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Mark rotation, trim points, move earlier/later, or anything the next AI pass needs to fix."
                className="resize-y rounded-md border border-zinc-300 bg-white px-3 py-3 text-sm leading-6 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
              />
            </label>

            <button
              type="submit"
              className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Note
            </button>
          </form>
        </div>
      </div>

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
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onJumpPrevious}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-white"
            title="Previous clip"
          >
            <SkipBack className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            title="Start or pause playback with Space"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            {isPlaying ? "Pause" : "Start"}
          </button>
          <span className="hidden rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-500 sm:inline-flex">
            Space
          </span>
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-white"
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            Stop
          </button>
          <button
            type="button"
            onClick={onJumpNext}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-white"
            title="Next clip"
          >
            <SkipForward className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Playback Cursor
          <input
            type="range"
            min={0}
            max={Math.max(1, totalDuration)}
            step={0.1}
            value={playheadTime}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="w-full accent-zinc-950"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-zinc-800">
            {formatTime(playheadTime)} / {formatTime(totalDuration)}
          </span>
          <button
            type="button"
            onClick={onScrollToCursor}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-white"
          >
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
            Scroll
          </button>
          <button
            type="button"
            onClick={onToggleFollow}
            className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold transition ${
              followPlayhead
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-white"
            }`}
          >
            Follow
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  clip,
  clipNotes,
  isPlaying,
  playheadTime,
}: {
  clip?: TimelineClip;
  clipNotes: Note[];
  isPlaying: boolean;
  playheadTime: number;
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
      <div className="grid min-h-[360px] place-items-center rounded-lg border border-zinc-200 bg-white text-sm text-zinc-500">
        No timeline clips found.
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            <Play className="h-4 w-4" aria-hidden="true" />
            Preview
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {clipName(clip)} in {clip.section}
          </p>
        </div>
        <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {humanize(clip.role)}
        </span>
      </div>

      <div className="grid gap-4 p-4">
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          <div className="h-[220px] bg-black sm:h-[260px]">
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
              <div className="grid h-full place-items-center px-6 text-center text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {clip.textOverlay ?? "No preview media"}
              </div>
            )}
          </div>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Timeline" value={`${formatTime(clip.timelineStart)}-${formatTime(clip.timelineEnd)}`} />
          <Info label="Source Range" value={`${formatTime(clip.sourceIn)}-${formatTime(clip.sourceOut)}`} />
          <Info label="Duration" value={`${clip.duration}s`} />
          <Info label="Status" value={clip.asset?.status ?? "unknown"} />
        </dl>

        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <FileVideo className="h-3.5 w-3.5" aria-hidden="true" />
              Source
            </div>
            <p className="break-words text-sm font-medium leading-6 text-zinc-800">
              {sourceName(clip)}
            </p>
            {clip.textOverlay ? (
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Overlay: {clip.textOverlay}
              </p>
            ) : null}
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Note Count
            </div>
            <p className="text-2xl font-semibold text-zinc-950">{clipNotes.length}</p>
          </div>
        </div>

        {clip.notes ? (
          <div className="rounded-md border border-zinc-200 bg-white p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
              Assembly Note
            </div>
            <p className="text-sm leading-6 text-zinc-700">{clip.notes}</p>
          </div>
        ) : null}

        {clipNotes.length > 0 ? (
          <div className="rounded-md border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Notes On This Clip
            </div>
            <div className="divide-y divide-zinc-200">
              {clipNotes.slice(0, 3).map((note) => (
                <p key={note.id} className="px-3 py-2 text-sm leading-6 text-zinc-700">
                  {note.body}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium capitalize text-zinc-800" title={value}>
        {value}
      </dd>
    </div>
  );
}

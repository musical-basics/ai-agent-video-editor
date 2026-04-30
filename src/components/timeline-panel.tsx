"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import {
  Clock3,
  Film,
  MessageSquareText,
  MousePointer2,
  Play,
  RotateCw,
  Scissors,
  SendToBack,
} from "lucide-react";
import type { Note, TimelineClip, TimelineRole } from "@/lib/types";

const pxPerSecond = 7;
const laneOrder: Array<{ role: TimelineRole; label: string }> = [
  { role: "title_card", label: "Titles" },
  { role: "a_roll", label: "A-Roll" },
  { role: "b_roll", label: "B-Roll" },
  { role: "ambient", label: "Ambient" },
  { role: "still", label: "Stills" },
  { role: "placeholder", label: "Pickups" },
];

const clipStyles: Record<TimelineRole, string> = {
  a_roll: "border-sky-500 bg-sky-950/90 text-sky-50",
  b_roll: "border-teal-500 bg-teal-950/90 text-teal-50",
  ambient: "border-emerald-500 bg-emerald-950/90 text-emerald-50",
  title_card: "border-violet-500 bg-violet-950/90 text-violet-50",
  placeholder: "border-amber-400 bg-amber-950/90 text-amber-50",
  still: "border-rose-500 bg-rose-950/90 text-rose-50",
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function mediaUrl(pathValue: unknown) {
  if (typeof pathValue !== "string" || !pathValue) return undefined;
  return `/media/${pathValue.split("/").map(encodeURIComponent).join("/")}`;
}

function clipLabel(clip: TimelineClip) {
  return (
    clip.asset?.originalId ??
    clip.asset?.basename ??
    clip.textOverlay ??
    clip.section
  );
}

export function TimelinePanel({
  clips,
  notes,
  selectedClipId,
  playheadTime = 0,
  followPlayhead = false,
  scrollSignal = 0,
  onSelectClip,
  onSeek,
}: {
  clips: TimelineClip[];
  notes: Note[];
  selectedClipId?: string;
  playheadTime?: number;
  followPlayhead?: boolean;
  scrollSignal?: number;
  onSelectClip?: (clipId: string) => void;
  onSeek?: (time: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollSignal = useRef(scrollSignal);
  const totalSeconds = Math.ceil(
    Math.max(60, ...clips.map((clip) => clip.timelineEnd)) / 15,
  ) * 15;
  const timelineWidth = Math.max(1800, totalSeconds * pxPerSecond);
  const ticks = Array.from(
    { length: Math.floor(totalSeconds / 15) + 1 },
    (_, index) => index * 15,
  );
  const noteCounts = new Map<string, number>();

  for (const note of notes) {
    if (!note.timelineItemId) continue;
    noteCounts.set(note.timelineItemId, (noteCounts.get(note.timelineItemId) ?? 0) + 1);
  }

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const forced = scrollSignal !== lastScrollSignal.current;
    lastScrollSignal.current = scrollSignal;

    if (!followPlayhead && !forced) return;

    const cursorX = 124 + playheadTime * pxPerSecond;
    const leftEdge = scroller.scrollLeft;
    const rightEdge = leftEdge + scroller.clientWidth;
    const shouldScroll =
      forced || cursorX < leftEdge + 180 || cursorX > rightEdge - 180;

    if (!shouldScroll) return;

    scroller.scrollTo({
      left: Math.max(0, cursorX - scroller.clientWidth / 2),
      behavior: forced ? "smooth" : "auto",
    });
  }, [followPlayhead, playheadTime, scrollSignal]);

  function seekFromMouse(event: MouseEvent<HTMLDivElement>) {
    if (!onSeek) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    onSeek(Math.max(0, x / pxPerSecond));
  }

  const playheadLeft = `${playheadTime * pxPerSecond}px`;

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
            <Film className="h-4 w-4" aria-hidden="true" />
            Rough Cut Timeline
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Pass 4 assembly as visible clip blocks. Click the timeline to move the playback cursor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-300">
          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {formatTime(totalSeconds)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1">
            <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" />
            {clips.length} clips
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="w-full max-w-full overflow-x-auto overscroll-x-contain">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "124px 1fr",
            width: `${timelineWidth + 124}px`,
          }}
        >
          <div className="sticky left-0 z-20 border-r border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Tracks
          </div>
          <div
            className="relative h-10 cursor-crosshair border-b border-zinc-800 bg-zinc-900"
            onClick={seekFromMouse}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 35px)",
              }}
            />
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute top-0 h-full border-l border-zinc-600"
                style={{ left: `${tick * pxPerSecond}px` }}
              >
                <span className="ml-1 text-xs tabular-nums text-zinc-400">
                  {formatTime(tick)}
                </span>
              </div>
            ))}
            <div
              className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-red-500"
              style={{ left: playheadLeft }}
            >
              <span className="absolute left-1 top-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                {formatTime(playheadTime)}
              </span>
            </div>
          </div>

          {laneOrder.map((lane) => {
            const laneClips = clips.filter((clip) => clip.role === lane.role);

            return (
              <div key={lane.role} className="contents">
                <div className="sticky left-0 z-20 flex h-28 items-center border-r border-t border-zinc-800 bg-zinc-950 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {lane.label}
                </div>
                <div
                  className="relative h-28 cursor-crosshair border-t border-zinc-800 bg-zinc-950"
                  onClick={seekFromMouse}
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 35px)",
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-red-500"
                    style={{ left: playheadLeft }}
                  />
                  {laneClips.map((clip) => {
                    const thumbnail = mediaUrl(clip.asset?.metadata.thumbnailPath);
                    const width = Math.max(56, clip.duration * pxPerSecond - 4);
                    const notesForClip = noteCounts.get(clip.id) ?? 0;

                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectClip?.(clip.id);
                        }}
                        className={`absolute top-3 flex h-[88px] flex-col overflow-hidden rounded-md border text-left shadow-sm transition hover:z-10 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-white/70 ${selectedClipId === clip.id ? "z-10 ring-2 ring-white" : ""} ${clipStyles[clip.role]}`}
                        style={{
                          left: `${clip.timelineStart * pxPerSecond}px`,
                          width: `${width}px`,
                        }}
                        title={`${clipLabel(clip)} | ${formatTime(clip.timelineStart)}-${formatTime(clip.timelineEnd)} | ${clip.notes ?? ""}`}
                      >
                        <div className="flex items-center justify-between gap-1 px-2 py-1 text-[11px] font-semibold">
                          <span className="truncate">{clipLabel(clip)}</span>
                          {notesForClip > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5">
                              <MessageSquareText className="h-3 w-3" aria-hidden="true" />
                              {notesForClip}
                            </span>
                          ) : null}
                        </div>
                        <div
                          className="mx-1 min-h-0 flex-1 rounded-sm bg-black/35 bg-cover bg-center"
                          style={
                            thumbnail
                              ? { backgroundImage: `url(${thumbnail})` }
                              : undefined
                          }
                        >
                          {!thumbnail ? (
                            <div className="grid h-full place-items-center text-[10px] font-semibold uppercase tracking-wide text-white/55">
                              {clip.textOverlay ? "Text" : "Clip"}
                            </div>
                          ) : null}
                        </div>
                        <div className="mx-1 mb-1 mt-1 h-2 rounded-full bg-white/15">
                          <div
                            className="h-full rounded-full bg-white/45"
                            style={{ width: `${Math.min(100, Math.max(18, clip.duration * 2))}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 px-4 py-3 text-xs font-medium text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          rotation
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
          trim
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SendToBack className="h-3.5 w-3.5" aria-hidden="true" />
          move earlier/later
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          clip blocks select preview
        </span>
      </div>
    </section>
  );
}

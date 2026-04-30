"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { MessageSquareText } from "lucide-react";
import type { Note, TimelineClip, TimelineRole } from "@/lib/types";

const pxPerSecond = 7;
const laneOrder: Array<{ role: TimelineRole; label: string }> = [
  { role: "title_card", label: "title" },
  { role: "a_roll", label: "a-roll" },
  { role: "b_roll", label: "b-roll" },
  { role: "ambient", label: "ambient" },
  { role: "still", label: "still" },
  { role: "placeholder", label: "pickup" },
];

const clipBase: Record<TimelineRole, string> = {
  a_roll: "bg-blue-700 border-blue-500 text-blue-50",
  b_roll: "bg-teal-800 border-teal-600 text-teal-50",
  ambient: "bg-neutral-700 border-neutral-500 text-neutral-100",
  title_card: "bg-purple-800 border-purple-600 text-purple-50",
  still: "bg-amber-800 border-amber-600 text-amber-50",
  placeholder:
    "bg-neutral-800 border-dashed border-neutral-600 text-neutral-300",
};

const clipSelected: Record<TimelineRole, string> = {
  a_roll: "bg-blue-500 border-blue-300 ring-2 ring-blue-300",
  b_roll: "bg-teal-600 border-teal-400 ring-2 ring-teal-400",
  ambient: "bg-neutral-500 border-neutral-300 ring-2 ring-neutral-300",
  title_card: "bg-purple-600 border-purple-400 ring-2 ring-purple-400",
  still: "bg-amber-600 border-amber-400 ring-2 ring-amber-400",
  placeholder: "bg-neutral-600 border-neutral-400 ring-2 ring-neutral-400",
};

const legendSwatch: Record<TimelineRole, string> = {
  a_roll: "bg-blue-700 border-blue-500",
  b_roll: "bg-teal-800 border-teal-600",
  ambient: "bg-neutral-700 border-neutral-500",
  title_card: "bg-purple-800 border-purple-600",
  still: "bg-amber-800 border-amber-600",
  placeholder: "bg-neutral-800 border-dashed border-neutral-600",
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
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

    const cursorX = 92 + playheadTime * pxPerSecond;
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
    <section className="min-w-0 max-w-full overflow-hidden border-y border-neutral-800 bg-neutral-950">
      <div ref={scrollRef} className="w-full max-w-full overflow-x-auto overscroll-x-contain">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "92px 1fr",
            width: `${timelineWidth + 92}px`,
          }}
        >
          <div className="sticky left-0 z-20 border-r border-neutral-800 bg-neutral-950 px-2 py-1 text-[10px] uppercase tracking-widest text-neutral-600">
            tracks
          </div>
          <div
            className="relative h-6 cursor-crosshair border-b border-neutral-800 bg-neutral-900"
            onClick={seekFromMouse}
          >
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute top-0 h-full border-l border-neutral-800"
                style={{ left: `${tick * pxPerSecond}px` }}
              >
                <span className="ml-1 text-[10px] tabular-nums text-neutral-600">
                  {formatTime(tick)}
                </span>
              </div>
            ))}
            <div
              className="pointer-events-none absolute inset-y-0 z-30 w-px bg-red-500"
              style={{ left: playheadLeft }}
            >
              <span className="absolute left-1 top-0.5 rounded bg-red-500 px-1 py-px text-[9px] font-semibold tabular-nums text-white">
                {formatTime(playheadTime)}
              </span>
            </div>
          </div>

          {laneOrder.map((lane) => {
            const laneClips = clips.filter((clip) => clip.role === lane.role);

            return (
              <div key={lane.role} className="contents">
                <div className="sticky left-0 z-20 flex h-14 items-center border-r border-t border-neutral-800 bg-neutral-950 px-2 text-[10px] uppercase tracking-widest text-neutral-500">
                  {lane.label}
                </div>
                <div
                  className="relative h-14 cursor-crosshair border-t border-neutral-800/60 bg-neutral-900/40"
                  onClick={seekFromMouse}
                >
                  <div
                    className="pointer-events-none absolute inset-y-0 z-30 w-px bg-red-500"
                    style={{ left: playheadLeft }}
                  />
                  {laneClips.map((clip) => {
                    const thumbnail = mediaUrl(clip.asset?.metadata.thumbnailPath);
                    const width = Math.max(48, clip.duration * pxPerSecond - 2);
                    const notesForClip = noteCounts.get(clip.id) ?? 0;
                    const isSelected = selectedClipId === clip.id;
                    const colorClass = isSelected
                      ? clipSelected[clip.role]
                      : clipBase[clip.role];

                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectClip?.(clip.id);
                        }}
                        className={`absolute top-1.5 flex h-11 flex-col overflow-hidden rounded border text-left transition hover:z-10 focus:outline-none ${colorClass}`}
                        style={{
                          left: `${clip.timelineStart * pxPerSecond}px`,
                          width: `${width}px`,
                        }}
                        title={`${clipLabel(clip)} | ${formatTime(clip.timelineStart)}-${formatTime(clip.timelineEnd)} | ${clip.notes ?? ""}`}
                      >
                        <div className="flex items-center gap-1 px-1.5 py-0.5">
                          <span className="truncate text-[10px] font-semibold leading-tight text-white/90">
                            {clipLabel(clip)}
                          </span>
                        </div>
                        <div
                          className="mx-1 min-h-0 flex-1 rounded-sm bg-black/30 bg-cover bg-center"
                          style={
                            thumbnail
                              ? { backgroundImage: `url(${thumbnail})` }
                              : undefined
                          }
                        />
                        {notesForClip > 0 ? (
                          <span className="absolute right-0 top-0 inline-flex items-center gap-0.5 rounded-bl bg-yellow-500 px-1 py-px text-[9px] font-semibold text-black">
                            <MessageSquareText className="h-2.5 w-2.5" aria-hidden="true" />
                            {notesForClip}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 px-3 py-1.5 text-[10px] text-neutral-500">
        {laneOrder.map((lane) => (
          <span key={lane.role} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-sm border ${legendSwatch[lane.role]}`}
            />
            {lane.label}
          </span>
        ))}
      </div>
    </section>
  );
}

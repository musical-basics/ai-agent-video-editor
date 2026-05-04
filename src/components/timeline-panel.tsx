"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MessageSquareText } from "lucide-react";
import type { Note, TimelineClip, TimelineRole } from "@/lib/types";

const DEFAULT_PX_PER_SECOND = 7;
const SNAP_PIXELS = 6;
const LANE_HEIGHT = 56;
export const ZOOM_MIN = 1.5;
export const ZOOM_MAX = 60;
export const ZOOM_DEFAULT = DEFAULT_PX_PER_SECOND;

const laneOrder: Array<{ role: TimelineRole; label: string }> = [
  { role: "title_card", label: "title" },
  { role: "voiceover", label: "voiceover" },
  { role: "music", label: "music" },
  { role: "a_roll", label: "a-roll" },
  { role: "b_roll", label: "b-roll" },
  { role: "ambient", label: "ambient" },
  { role: "still", label: "still" },
  { role: "placeholder", label: "pickup" },
];

const roleIndex: Record<TimelineRole, number> = laneOrder.reduce(
  (acc, lane, idx) => {
    acc[lane.role] = idx;
    return acc;
  },
  {} as Record<TimelineRole, number>,
);

const clipBase: Record<TimelineRole, string> = {
  a_roll: "bg-blue-700 border-blue-500 text-blue-50",
  b_roll: "bg-teal-800 border-teal-600 text-teal-50",
  ambient: "bg-neutral-700 border-neutral-500 text-neutral-100",
  title_card: "bg-purple-800 border-purple-600 text-purple-50",
  voiceover: "bg-rose-800 border-rose-500 text-rose-50",
  music: "bg-lime-900 border-lime-600 text-lime-50",
  still: "bg-amber-800 border-amber-600 text-amber-50",
  placeholder: "bg-neutral-800 border-dashed border-neutral-600 text-neutral-300",
};

const clipSelected: Record<TimelineRole, string> = {
  a_roll: "bg-blue-500 border-blue-300 ring-2 ring-blue-300",
  b_roll: "bg-teal-600 border-teal-400 ring-2 ring-teal-400",
  ambient: "bg-neutral-500 border-neutral-300 ring-2 ring-neutral-300",
  title_card: "bg-purple-600 border-purple-400 ring-2 ring-purple-400",
  voiceover: "bg-rose-600 border-rose-300 ring-2 ring-rose-300",
  music: "bg-lime-700 border-lime-400 ring-2 ring-lime-400",
  still: "bg-amber-600 border-amber-400 ring-2 ring-amber-400",
  placeholder: "bg-neutral-600 border-neutral-400 ring-2 ring-neutral-400",
};

const legendSwatch: Record<TimelineRole, string> = {
  a_roll: "bg-blue-700 border-blue-500",
  b_roll: "bg-teal-800 border-teal-600",
  ambient: "bg-neutral-700 border-neutral-500",
  title_card: "bg-purple-800 border-purple-600",
  voiceover: "bg-rose-800 border-rose-500",
  music: "bg-lime-900 border-lime-600",
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
  return clip.asset?.originalId ?? clip.asset?.basename ?? clip.textOverlay ?? clip.section;
}

function clipRotation(clip: TimelineClip) {
  return clip.rotationOverride ?? clip.asset?.rotation ?? 0;
}

function rotatedThumbnailStyle(rotation: number, thumbnail: string): CSSProperties {
  const normalized = ((rotation % 360) + 360) % 360;
  const quarterTurn = normalized === 90 || normalized === 270;

  return {
    backgroundImage: `url(${thumbnail})`,
    height: quarterTurn ? "177.7778%" : "100%",
    maxHeight: "none",
    maxWidth: "none",
    transform: `translate(-50%, -50%) rotate(${normalized}deg)`,
    transformOrigin: "center",
    width: quarterTurn ? "56.25%" : "100%",
  };
}

export type ClipPatch = {
  timelineStart?: number;
  sourceIn?: number;
  sourceOut?: number;
  targetDuration?: number;
  role?: TimelineRole;
};

type DragMode = "move" | "trim-left" | "trim-right" | "slip";

type DragState = {
  clipId: string;
  mode: DragMode;
  startPointerX: number;
  startPointerY: number;
  startClip: TimelineClip;
  /** Snap target pixel positions (master timeline coords) */
  snapTargets: number[];
};

export function TimelinePanel({
  clips,
  notes,
  selectedClipIds,
  playheadTime = 0,
  followPlayhead = false,
  scrollSignal = 0,
  editable = true,
  pxPerSecond = DEFAULT_PX_PER_SECOND,
  slipMode = false,
  onSelectClip,
  onSetSelection,
  onSeek,
  onClipPreview,
  onClipCommit,
  onClipContextMenu,
}: {
  clips: TimelineClip[];
  notes: Note[];
  selectedClipIds: Set<string>;
  playheadTime?: number;
  followPlayhead?: boolean;
  scrollSignal?: number;
  editable?: boolean;
  pxPerSecond?: number;
  slipMode?: boolean;
  onSelectClip?: (clipId: string, additive?: boolean) => void;
  onSetSelection?: (clipIds: string[]) => void;
  onSeek?: (time: number) => void;
  onClipPreview?: (clipId: string, patch: ClipPatch) => void;
  onClipCommit?: (clipId: string, patch: ClipPatch) => void;
  onClipContextMenu?: (clipId: string, screenX: number, screenY: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const lastScrollSignal = useRef(scrollSignal);
  const dragRef = useRef<DragState | null>(null);
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    additive: boolean;
    baseSelection: Set<string>;
    active: boolean;
  } | null>(null);
  const [hoverDrag, setHoverDrag] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<
    | { left: number; top: number; width: number; height: number }
    | null
  >(null);
  const totalSeconds = Math.ceil(
    Math.max(60, ...clips.map((clip) => clip.timelineEnd)) / 15,
  ) * 15;
  const timelineWidth = Math.max(1800, totalSeconds * pxPerSecond);
  const ticks = Array.from(
    { length: Math.floor(totalSeconds / 15) + 1 },
    (_, index) => index * 15,
  );
  const noteCounts = new Map<string, number>();

  for (const clip of clips) {
    const matchingNotes = new Set<string>();

    for (const note of notes) {
      if (note.timelineItemId === clip.id) {
        matchingNotes.add(note.id);
      }

      if (clip.assetId && note.assetId === clip.assetId) {
        matchingNotes.add(note.id);
      }
    }

    if (matchingNotes.size > 0) {
      noteCounts.set(clip.id, matchingNotes.size);
    }
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
  }, [followPlayhead, playheadTime, pxPerSecond, scrollSignal]);

  function seekFromMouse(event: MouseEvent<HTMLDivElement>) {
    if (!onSeek) return;
    if (dragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    onSeek(Math.max(0, x / pxPerSecond));
  }

  function handleLanePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    const trackArea = trackAreaRef.current;
    if (!trackArea) return;

    // trackArea is the inner grid that includes the 92px label column and the
    // 24px ruler. Convert to track-relative coords (origin at top-left of the
    // first lane's clip area) by subtracting both.
    const TRACK_OFFSET_X = 92;
    const TRACK_OFFSET_Y = 24;
    const gridRect = trackArea.getBoundingClientRect();
    const startX = event.clientX - gridRect.left - TRACK_OFFSET_X;
    const startY = event.clientY - gridRect.top - TRACK_OFFSET_Y;
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;

    marqueeRef.current = {
      startX,
      startY,
      additive,
      baseSelection: new Set(selectedClipIds),
      active: false,
    };

    function onMove(e: PointerEvent) {
      const m = marqueeRef.current;
      if (!m) return;
      const rect = trackArea!.getBoundingClientRect();
      const x = e.clientX - rect.left - TRACK_OFFSET_X;
      const y = e.clientY - rect.top - TRACK_OFFSET_Y;
      const dist = Math.abs(x - m.startX) + Math.abs(y - m.startY);
      if (!m.active && dist < 4) return;
      m.active = true;

      const left = Math.max(0, Math.min(m.startX, x));
      const top = Math.max(0, Math.min(m.startY, y));
      const width = Math.abs(x - m.startX);
      const height = Math.abs(y - m.startY);
      setMarqueeBox({ left, top, width, height });

      const startTime = left / pxPerSecond;
      const endTime = (left + width) / pxPerSecond;
      const startLane = Math.floor(top / LANE_HEIGHT);
      const endLane = Math.floor((top + height) / LANE_HEIGHT);
      const intersected: string[] = [];
      for (const clip of clips) {
        const laneIdx = roleIndex[clip.role];
        if (laneIdx < startLane || laneIdx > endLane) continue;
        if (clip.timelineEnd <= startTime || clip.timelineStart >= endTime) continue;
        intersected.push(clip.id);
      }
      const next = m.additive
        ? new Set([...m.baseSelection, ...intersected])
        : new Set(intersected);
      onSetSelection?.(Array.from(next));
    }

    function onUp(e: PointerEvent) {
      const m = marqueeRef.current;
      const wasActive = !!m?.active;
      cleanup();
      if (!wasActive) {
        // No drag — treat as a plain seek click on empty timeline space.
        const rect = trackArea!.getBoundingClientRect();
        const x = e.clientX - rect.left - TRACK_OFFSET_X;
        onSeek?.(Math.max(0, x / pxPerSecond));
      }
    }

    function cleanup() {
      marqueeRef.current = null;
      setMarqueeBox(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
  }

  function buildSnapTargets(excludeId: string): number[] {
    const targets: number[] = [0, playheadTime];
    for (const c of clips) {
      if (c.id === excludeId) continue;
      targets.push(c.timelineStart, c.timelineEnd);
    }
    return targets;
  }

  function snap(value: number, targets: number[]): number {
    let bestDelta = SNAP_PIXELS / pxPerSecond;
    let snapped = value;
    for (const target of targets) {
      const delta = Math.abs(value - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        snapped = target;
      }
    }
    return snapped;
  }

  function laneFromPointerY(absoluteY: number): TimelineRole | undefined {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;
    const scrollerRect = scroller.getBoundingClientRect();
    // Subtract ruler height (24px) + scroller top
    const relativeY = absoluteY - scrollerRect.top - 24;
    const laneIndex = Math.floor(relativeY / LANE_HEIGHT);
    return laneOrder[laneIndex]?.role;
  }

  function handleClipPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    clip: TimelineClip,
    mode: DragMode,
  ) {
    if (!editable) return;
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelectClip?.(clip.id);

    // Body drag becomes a slip when T is held (FCP-style slip tool).
    if (mode === "move" && slipMode) {
      mode = "slip";
    }

    dragRef.current = {
      clipId: clip.id,
      mode,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startClip: clip,
      snapTargets: buildSnapTargets(clip.id),
    };
    setHoverDrag(true);

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaPx = e.clientX - drag.startPointerX;
      const deltaTime = deltaPx / pxPerSecond;
      const start = drag.startClip;
      const startDuration = start.duration;

      if (drag.mode === "move") {
        let nextStart = Math.max(0, start.timelineStart + deltaTime);
        nextStart = Math.max(0, snap(nextStart, drag.snapTargets));
        const nextRole = laneFromPointerY(e.clientY) ?? start.role;
        onClipPreview?.(drag.clipId, {
          timelineStart: nextStart,
          role: nextRole,
        });
      } else if (drag.mode === "trim-left") {
        // Drag left edge: changes timelineStart, sourceIn, duration; right edge fixed
        const rightEdge = start.timelineStart + startDuration;
        let nextStart = Math.max(0, start.timelineStart + deltaTime);
        nextStart = snap(nextStart, drag.snapTargets);
        nextStart = Math.min(nextStart, rightEdge - 0.2);
        const startShift = nextStart - start.timelineStart;
        const nextSourceIn = Math.max(0, (start.sourceIn ?? 0) + startShift);
        const nextDuration = Math.max(0.2, startDuration - startShift);
        onClipPreview?.(drag.clipId, {
          timelineStart: nextStart,
          sourceIn: nextSourceIn,
          targetDuration: nextDuration,
        });
      } else if (drag.mode === "trim-right") {
        // Drag right edge: changes duration and sourceOut; left edge fixed
        const leftEdge = start.timelineStart;
        let nextRight = Math.max(leftEdge + 0.2, leftEdge + startDuration + deltaTime);
        nextRight = snap(nextRight, drag.snapTargets);
        nextRight = Math.max(nextRight, leftEdge + 0.2);
        const nextDuration = nextRight - leftEdge;
        const nextSourceOut =
          start.sourceOut !== undefined
            ? (start.sourceIn ?? 0) + nextDuration
            : undefined;
        const patch: ClipPatch = { targetDuration: nextDuration };
        if (nextSourceOut !== undefined) patch.sourceOut = nextSourceOut;
        onClipPreview?.(drag.clipId, patch);
      } else if (drag.mode === "slip") {
        // Slip: timeline position and duration stay fixed, source range scrolls.
        // Drag right → show later content (sourceIn/Out advance).
        // Drag left  → show earlier content (sourceIn/Out retreat).
        // Clamp so sourceIn never goes below 0; if asset duration is known,
        // also clamp sourceOut to it.
        const assetDuration = start.asset?.durationSeconds;
        const baseIn = start.sourceIn ?? 0;
        const baseOut = start.sourceOut ?? baseIn + start.duration;
        let slipDelta = -deltaTime; // dragging right means seeing later content
        const minDelta = -baseIn; // sourceIn cannot go below 0
        const maxDelta =
          assetDuration !== undefined ? assetDuration - baseOut : Infinity;
        slipDelta = Math.max(minDelta, Math.min(maxDelta, slipDelta));
        onClipPreview?.(drag.clipId, {
          sourceIn: baseIn + slipDelta,
          sourceOut: baseOut + slipDelta,
        });
      }
    }

    function onUp(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) {
        cleanup();
        return;
      }
      // Replay one final move to settle
      onMove(e);
      const deltaPx = Math.abs(e.clientX - drag.startPointerX);
      const deltaY = Math.abs(e.clientY - drag.startPointerY);
      const wasDrag = deltaPx > 2 || deltaY > 2;
      if (wasDrag) {
        // Use the last preview values by re-deriving them
        const deltaTime = (e.clientX - drag.startPointerX) / pxPerSecond;
        const start = drag.startClip;
        const patch: ClipPatch = {};
        if (drag.mode === "move") {
          let nextStart = Math.max(0, start.timelineStart + deltaTime);
          nextStart = Math.max(0, snap(nextStart, drag.snapTargets));
          patch.timelineStart = nextStart;
          const nextRole = laneFromPointerY(e.clientY) ?? start.role;
          if (nextRole !== start.role) patch.role = nextRole;
        } else if (drag.mode === "trim-left") {
          const rightEdge = start.timelineStart + start.duration;
          let nextStart = Math.max(0, start.timelineStart + deltaTime);
          nextStart = snap(nextStart, drag.snapTargets);
          nextStart = Math.min(nextStart, rightEdge - 0.2);
          const startShift = nextStart - start.timelineStart;
          patch.timelineStart = nextStart;
          patch.sourceIn = Math.max(0, (start.sourceIn ?? 0) + startShift);
          patch.targetDuration = Math.max(0.2, start.duration - startShift);
        } else if (drag.mode === "trim-right") {
          const leftEdge = start.timelineStart;
          let nextRight = Math.max(leftEdge + 0.2, leftEdge + start.duration + deltaTime);
          nextRight = snap(nextRight, drag.snapTargets);
          nextRight = Math.max(nextRight, leftEdge + 0.2);
          const nextDuration = nextRight - leftEdge;
          patch.targetDuration = nextDuration;
          if (start.sourceOut !== undefined) {
            patch.sourceOut = (start.sourceIn ?? 0) + nextDuration;
          }
        } else if (drag.mode === "slip") {
          const assetDuration = start.asset?.durationSeconds;
          const baseIn = start.sourceIn ?? 0;
          const baseOut = start.sourceOut ?? baseIn + start.duration;
          let slipDelta = -deltaTime;
          const minDelta = -baseIn;
          const maxDelta =
            assetDuration !== undefined ? assetDuration - baseOut : Infinity;
          slipDelta = Math.max(minDelta, Math.min(maxDelta, slipDelta));
          patch.sourceIn = baseIn + slipDelta;
          patch.sourceOut = baseOut + slipDelta;
        }
        onClipCommit?.(drag.clipId, patch);
      }
      cleanup();
    }

    function cleanup() {
      dragRef.current = null;
      setHoverDrag(false);
      target.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
  }

  const playheadLeft = `${playheadTime * pxPerSecond}px`;

  return (
    <section className="min-w-0 max-w-full overflow-hidden border-y border-neutral-800 bg-neutral-950">
      <div ref={scrollRef} className="w-full max-w-full overflow-x-auto overscroll-x-contain">
        <div
          ref={trackAreaRef}
          className="relative grid select-none"
          style={{
            gridTemplateColumns: "92px 1fr",
            width: `${timelineWidth + 92}px`,
          }}
        >
          {marqueeBox ? (
            <div
              className="pointer-events-none absolute z-40 rounded border border-blue-400/60 bg-blue-400/10"
              style={{
                left: `${marqueeBox.left + 92}px`,
                top: `${marqueeBox.top + 24}px`,
                width: `${marqueeBox.width}px`,
                height: `${marqueeBox.height}px`,
              }}
            />
          ) : null}
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
                  onPointerDown={handleLanePointerDown}
                >
                  <div
                    className="pointer-events-none absolute inset-y-0 z-30 w-px bg-red-500"
                    style={{ left: playheadLeft }}
                  />
                  {laneClips.map((clip) => {
                    const thumbnail = mediaUrl(clip.asset?.metadata.thumbnailPath);
                    const isAudioClip = clip.role === "voiceover" || clip.role === "music";
                    const rotation = clipRotation(clip);
                    const width = Math.max(48, clip.duration * pxPerSecond - 2);
                    const notesForClip = noteCounts.get(clip.id) ?? 0;
                    const isSelected = selectedClipIds.has(clip.id);
                    const colorClass = isSelected
                      ? clipSelected[clip.role]
                      : clipBase[clip.role];

                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onPointerDown={(event) =>
                          handleClipPointerDown(event, clip, "move")
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          const additive = event.metaKey || event.ctrlKey || event.shiftKey;
                          onSelectClip?.(clip.id, additive);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onSelectClip?.(clip.id);
                          onClipContextMenu?.(clip.id, event.clientX, event.clientY);
                        }}
                        className={`absolute top-1.5 flex h-11 flex-col overflow-hidden rounded border text-left transition hover:z-10 focus:outline-none ${colorClass} ${
                          editable
                            ? slipMode
                              ? "cursor-ew-resize"
                              : "cursor-grab active:cursor-grabbing"
                            : ""
                        }`}
                        style={{
                          left: `${clip.timelineStart * pxPerSecond}px`,
                          width: `${width}px`,
                        }}
                        title={`${clipLabel(clip)} | ${formatTime(clip.timelineStart)}-${formatTime(clip.timelineEnd)} | ${clip.notes ?? ""}`}
                      >
                        {editable ? (
                          <span
                            className="absolute inset-y-0 left-0 z-10 w-[7px] cursor-ew-resize bg-black/20 hover:bg-white/30"
                            onPointerDown={(event) =>
                              handleClipPointerDown(event, clip, "trim-left")
                            }
                            aria-hidden="true"
                          />
                        ) : null}
                        {editable ? (
                          <span
                            className="absolute inset-y-0 right-0 z-10 w-[7px] cursor-ew-resize bg-black/20 hover:bg-white/30"
                            onPointerDown={(event) =>
                              handleClipPointerDown(event, clip, "trim-right")
                            }
                            aria-hidden="true"
                          />
                        ) : null}
                        <div className="flex items-center gap-1 px-1.5 py-0.5">
                          <span className="truncate text-[10px] font-semibold leading-tight text-white/90">
                            {clipLabel(clip)}
                          </span>
                        </div>
                        <div className="relative mx-1 min-h-0 flex-1 overflow-hidden rounded-sm bg-black/30">
                          {thumbnail ? (
                            <div
                              className="absolute left-1/2 top-1/2 bg-cover bg-center"
                              style={rotatedThumbnailStyle(rotation, thumbnail)}
                            />
                          ) : isAudioClip ? (
                            <div className="flex h-full items-center gap-px px-1">
                              {Array.from({ length: 18 }, (_, index) => (
                                <span
                                  key={index}
                                  className="w-0.5 rounded-full bg-white/45"
                                  style={{
                                    height: `${25 + ((index * 17) % 55)}%`,
                                  }}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
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
        {editable ? (
          <span className="ml-auto text-neutral-600">
            {slipMode
              ? "slip mode (T held) — drag clip body to scroll source, edges & position fixed"
              : hoverDrag
                ? "dragging…"
                : "drag clip body to move · drag edges to trim · drop on another lane to change role · hold T to slip"}
          </span>
        ) : (
          <span className="ml-auto text-amber-500/80">
            historical pass — switch to current pass to edit
          </span>
        )}
      </div>
    </section>
  );
}

export { roleIndex, laneOrder };

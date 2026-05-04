"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BadgeAlert,
  Clapperboard,
  Copy,
  LocateFixed,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  createNote,
  deleteTimelineClipAction,
  duplicateTimelineClipAction,
  splitTimelineClipAction,
  updateTimelineClipAction,
} from "@/app/actions";
import { TimelinePanel, type ClipPatch } from "@/components/timeline-panel";
import type {
  Note,
  NoteType,
  Pass,
  Project,
  RenderJob,
  TimelineClip,
  TimelineRole,
} from "@/lib/types";

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
  voiceover: "bg-rose-800 text-rose-100",
  music: "bg-lime-900 text-lime-100",
  still: "bg-amber-800 text-amber-100",
  placeholder: "bg-neutral-800 text-neutral-400",
};

const roleOptions: TimelineRole[] = [
  "a_roll",
  "b_roll",
  "ambient",
  "title_card",
  "placeholder",
  "still",
  "voiceover",
  "music",
];

const quickActions: QuickAction[] = [
  {
    label: "Note: rotate CW",
    icon: RotateCw,
    noteType: "rotation",
    body: (clip) => `${clipName(clip)}: rotate this clip 90 degrees clockwise.`,
  },
  {
    label: "Note: rotate CCW",
    icon: RotateCcw,
    noteType: "rotation",
    body: (clip) => `${clipName(clip)}: rotate this clip 90 degrees counterclockwise.`,
  },
  {
    label: "Note: move earlier",
    icon: ArrowUpToLine,
    noteType: "reorder",
    body: (clip) => `${clipName(clip)}: move this clip earlier in the sequence.`,
  },
  {
    label: "Note: move later",
    icon: ArrowDownToLine,
    noteType: "reorder",
    body: (clip) => `${clipName(clip)}: move this clip later in the sequence.`,
  },
  {
    label: "Note: issue",
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

function mediaUrl(pathValue: unknown, projectRoot?: string) {
  if (typeof pathValue !== "string" || !pathValue) return undefined;
  let relativePath = pathValue;

  if (projectRoot && relativePath.startsWith(`${projectRoot}/`)) {
    relativePath = relativePath.slice(projectRoot.length + 1);
  }

  return `/media/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
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

function clipRotation(clip?: TimelineClip) {
  return clip?.rotationOverride ?? clip?.asset?.rotation ?? 0;
}

function rotatedMediaStyle(rotation: number): CSSProperties {
  const normalized = ((rotation % 360) + 360) % 360;
  const quarterTurn = normalized === 90 || normalized === 270;

  return {
    height: quarterTurn ? "177.7778%" : "100%",
    maxHeight: "none",
    maxWidth: "none",
    transform: `translate(-50%, -50%) rotate(${normalized}deg)`,
    transformOrigin: "center",
    width: quarterTurn ? "56.25%" : "100%",
  };
}

function applyPatchToClip(clip: TimelineClip, patch: ClipPatch): TimelineClip {
  const next: TimelineClip = { ...clip };
  if (patch.timelineStart !== undefined) {
    next.timelineStart = Math.max(0, patch.timelineStart);
  }
  if (patch.sourceIn !== undefined) next.sourceIn = patch.sourceIn;
  if (patch.sourceOut !== undefined) next.sourceOut = patch.sourceOut;
  if (patch.targetDuration !== undefined) next.targetDuration = patch.targetDuration;
  if (patch.role !== undefined) next.role = patch.role;
  next.duration =
    patch.targetDuration ??
    next.targetDuration ??
    Math.max(0.2, (next.sourceOut ?? 0) - (next.sourceIn ?? 0)) ??
    next.duration;
  next.timelineEnd = next.timelineStart + next.duration;
  return next;
}

function patchFromClip(clip: TimelineClip): ClipPatch {
  return {
    timelineStart: clip.timelineStart,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceOut,
    targetDuration: clip.targetDuration,
    role: clip.role,
  };
}

type HistoryEntry = {
  itemId: string;
  before: ClipPatch;
  after: ClipPatch;
};

export function EditorWorkbench({
  project,
  passes,
  timelineClips,
  renderJobs,
  notes,
}: {
  project: Project;
  passes: Pass[];
  timelineClips: TimelineClip[];
  renderJobs: RenderJob[];
  notes: Note[];
}) {
  const router = useRouter();
  const noteFormRef = useRef<HTMLFormElement>(null);
  const reviewablePasses = useMemo(() => {
    const passIdsWithTimeline = new Set(timelineClips.map((clip) => clip.passId).filter(Boolean));
    return passes.filter((pass) => passIdsWithTimeline.has(pass.id));
  }, [passes, timelineClips]);
  const defaultPassId =
    project.metadata.currentPassId ??
    reviewablePasses.at(-1)?.id ??
    passes.at(-1)?.id ??
    "";
  const [selectedPassOverride, setSelectedPassOverride] = useState<string>();
  const selectedPassId = selectedPassOverride ?? defaultPassId;
  const isCurrentPass = selectedPassId === project.metadata.currentPassId;

  const [noteType, setNoteType] = useState<NoteType>("clip_review");
  const [draft, setDraft] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [scrollSignal, setScrollSignal] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>();
  const [pendingMutation, setPendingMutation] = useState(false);

  const visibleTimelineClips = useMemo(
    () => timelineClips.filter((clip) => clip.passId === selectedPassId),
    [selectedPassId, timelineClips],
  );

  // Local optimistic state — mirrors server but allows drag-time edits
  const [localClips, setLocalClips] = useState(visibleTimelineClips);
  const lastEditAt = useRef(0);
  useEffect(() => {
    // Resync from server when not mid-edit
    if (Date.now() - lastEditAt.current > 1500) {
      setLocalClips(visibleTimelineClips);
    }
  }, [visibleTimelineClips]);

  // Undo/redo stack — only for patch-style edits (not delete/split/duplicate).
  // Keyed by selectedPassId so the stack resets cleanly when switching passes.
  const [historyState, setHistoryState] = useState<{
    passId: string;
    history: HistoryEntry[];
    cursor: number;
  }>(() => ({ passId: selectedPassId, history: [], cursor: 0 }));
  const history = useMemo(
    () => (historyState.passId === selectedPassId ? historyState.history : []),
    [historyState, selectedPassId],
  );
  const historyCursor = useMemo(
    () => (historyState.passId === selectedPassId ? historyState.cursor : 0),
    [historyState, selectedPassId],
  );
  const setHistory = useCallback(
    (updater: (prev: HistoryEntry[]) => HistoryEntry[]) => {
      setHistoryState((prev) => ({
        passId: selectedPassId,
        history: updater(prev.passId === selectedPassId ? prev.history : []),
        cursor: prev.passId === selectedPassId ? prev.cursor : 0,
      }));
    },
    [selectedPassId],
  );
  const setHistoryCursor = useCallback(
    (updater: (prev: number) => number) => {
      setHistoryState((prev) => ({
        passId: selectedPassId,
        history: prev.passId === selectedPassId ? prev.history : [],
        cursor: updater(prev.passId === selectedPassId ? prev.cursor : 0),
      }));
    },
    [selectedPassId],
  );

  const selectedRenderJob = useMemo(
    () =>
      renderJobs.find(
        (job) => job.passId === selectedPassId && job.status === "done" && job.outputPath,
      ) ?? renderJobs.find((job) => job.status === "done" && job.outputPath),
    [renderJobs, selectedPassId],
  );
  const totalDuration = useMemo(
    () => Math.max(0, ...localClips.map((clip) => clip.timelineEnd)),
    [localClips],
  );

  const explicitlySelectedClip = useMemo(
    () => (selectedClipId ? localClips.find((c) => c.id === selectedClipId) : undefined),
    [localClips, selectedClipId],
  );
  // Selection drives the inspector / action bar / notes — sticky once you click a clip.
  const selectedClip =
    explicitlySelectedClip ?? clipAtTime(localClips, playheadTime) ?? localClips[0];
  // Preview always follows the playhead and prefers the visual lane at that moment,
  // so scrubbing the timeline or letting playback advance updates the video pane.
  const previewClip =
    visualClipAtTime(localClips, playheadTime) ??
    clipAtTime(localClips, playheadTime) ??
    selectedClip;

  const clipNotes = useMemo(
    () =>
      selectedClip
        ? notes.filter(
            (note) =>
              note.timelineItemId === selectedClip.id ||
              (selectedClip.assetId && note.assetId === selectedClip.assetId),
          )
        : [],
    [notes, selectedClip],
  );
  const selectedClipIndex = selectedClip
    ? localClips.findIndex((clip) => clip.id === selectedClip.id)
    : -1;

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 5000);

    return () => window.clearInterval(refreshTimer);
  }, [router]);

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

  // ── Mutation helpers ──────────────────────────────────────────────

  const previewClipChange = useCallback((clipId: string, patch: ClipPatch) => {
    lastEditAt.current = Date.now();
    setLocalClips((prev) =>
      prev.map((clip) => (clip.id === clipId ? applyPatchToClip(clip, patch) : clip)),
    );
  }, []);

  const commitClipChange = useCallback(
    async (clipId: string, patch: ClipPatch, opts: { recordHistory?: boolean } = {}) => {
      lastEditAt.current = Date.now();
      const recordHistory = opts.recordHistory ?? true;

      // Capture before state for undo
      const before = visibleTimelineClips.find((c) => c.id === clipId);
      if (before && recordHistory) {
        const beforePatch = patchFromClip(before);
        const afterPatch: ClipPatch = { ...patch };
        setHistory((prev) => {
          const trimmed = prev.slice(0, historyCursor);
          return [...trimmed, { itemId: clipId, before: beforePatch, after: afterPatch }];
        });
        setHistoryCursor((c) => c + 1);
      }

      // Apply locally too in case caller didn't use preview
      setLocalClips((prev) =>
        prev.map((clip) => (clip.id === clipId ? applyPatchToClip(clip, patch) : clip)),
      );

      setPendingMutation(true);
      try {
        await updateTimelineClipAction({
          projectId: project.id,
          itemId: clipId,
          patch,
        });
        router.refresh();
      } finally {
        setPendingMutation(false);
      }
    },
    [
      historyCursor,
      project.id,
      router,
      setHistory,
      setHistoryCursor,
      visibleTimelineClips,
    ],
  );

  const splitAtPlayhead = useCallback(async () => {
    if (!isCurrentPass || !selectedClip) return;
    if (
      playheadTime <= selectedClip.timelineStart + 0.1 ||
      playheadTime >= selectedClip.timelineEnd - 0.1
    ) {
      return;
    }
    setPendingMutation(true);
    try {
      await splitTimelineClipAction({
        projectId: project.id,
        itemId: selectedClip.id,
        splitAtMasterTime: playheadTime,
        clipLabel: clipName(selectedClip),
      });
      router.refresh();
    } finally {
      setPendingMutation(false);
    }
  }, [isCurrentPass, playheadTime, project.id, router, selectedClip]);

  const deleteSelected = useCallback(async () => {
    if (!isCurrentPass || !selectedClip) return;
    setPendingMutation(true);
    try {
      await deleteTimelineClipAction({
        projectId: project.id,
        itemId: selectedClip.id,
        clipLabel: clipName(selectedClip),
      });
      setSelectedClipId(undefined);
      router.refresh();
    } finally {
      setPendingMutation(false);
    }
  }, [isCurrentPass, project.id, router, selectedClip]);

  const duplicateSelected = useCallback(async () => {
    if (!isCurrentPass || !selectedClip) return;
    setPendingMutation(true);
    try {
      await duplicateTimelineClipAction({
        projectId: project.id,
        itemId: selectedClip.id,
        clipLabel: clipName(selectedClip),
      });
      router.refresh();
    } finally {
      setPendingMutation(false);
    }
  }, [isCurrentPass, project.id, router, selectedClip]);

  const undo = useCallback(async () => {
    if (historyCursor === 0) return;
    const entry = history[historyCursor - 1];
    if (!entry) return;
    setHistoryCursor((c) => c - 1);
    await commitClipChange(entry.itemId, entry.before, { recordHistory: false });
  }, [commitClipChange, history, historyCursor, setHistoryCursor]);

  const redo = useCallback(async () => {
    if (historyCursor >= history.length) return;
    const entry = history[historyCursor];
    if (!entry) return;
    setHistoryCursor((c) => c + 1);
    await commitClipChange(entry.itemId, entry.after, { recordHistory: false });
  }, [commitClipChange, history, historyCursor, setHistoryCursor]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isTyping) return;

      const meta = event.metaKey || event.ctrlKey;

      if (event.code === "Space") {
        event.preventDefault();
        setIsPlaying((value) => !value);
        return;
      }
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          void redo();
        } else {
          void undo();
        }
        return;
      }
      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateSelected();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedClip && isCurrentPass) {
          event.preventDefault();
          void deleteSelected();
        }
        return;
      }
      if (event.key.toLowerCase() === "s" && !meta && !event.shiftKey && !event.altKey) {
        if (selectedClip && isCurrentPass) {
          event.preventDefault();
          void splitAtPlayhead();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    deleteSelected,
    duplicateSelected,
    isCurrentPass,
    redo,
    selectedClip,
    splitAtPlayhead,
    undo,
  ]);

  function applyQuickAction(action: QuickAction) {
    if (!selectedClip) return;
    setNoteType(action.noteType);
    setDraft(action.body(selectedClip));
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingNote) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = String(formData.get("body") ?? "").trim();

    if (!body) return;

    formData.set("body", body);
    setIsSubmittingNote(true);

    try {
      const result = await createNote(formData);
      if (result?.ok) {
        setDraft("");
        form.reset();
        router.refresh();
      }
    } finally {
      setIsSubmittingNote(false);
    }
  }

  function handleNoteKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    noteFormRef.current?.requestSubmit();
  }

  function changeSelectedPass(nextPassId: string) {
    setSelectedPassOverride(nextPassId);
    setPlayheadTime(0);
    setIsPlaying(false);
    setScrollSignal((value) => value + 1);
    setSelectedClipId(undefined);
  }

  function seekToTime(nextTime: number) {
    const boundedTime = clamp(nextTime, 0, totalDuration);
    setPlayheadTime(boundedTime);
  }

  function selectClip(clipId: string) {
    const clip = localClips.find((item) => item.id === clipId);
    if (clip) {
      setSelectedClipId(clipId);
      setPlayheadTime(clip.timelineStart);
    }
  }

  function stopPlayback() {
    setIsPlaying(false);
    seekToTime(0);
  }

  function jumpToClip(direction: -1 | 1) {
    if (selectedClipIndex < 0) return;
    const nextClip = localClips[clamp(selectedClipIndex + direction, 0, localClips.length - 1)];
    if (!nextClip) return;
    setSelectedClipId(nextClip.id);
    setPlayheadTime(nextClip.timelineStart);
    setScrollSignal((value) => value + 1);
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded border border-neutral-800 bg-neutral-950 text-neutral-100">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-2">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">Editor</span>
        <span className="text-neutral-700">/</span>
        <span className="text-sm font-semibold text-neutral-100">{project.name}</span>
        <label className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
          Reviewing
          <select
            value={selectedPassId}
            onChange={(event) => changeSelectedPass(event.target.value)}
            className="max-w-[260px] rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs normal-case tracking-normal text-neutral-200 outline-none focus:border-blue-600"
          >
            {(reviewablePasses.length > 0 ? reviewablePasses : passes).map((pass) => (
              <option key={pass.id} value={pass.id}>
                {pass.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[10px] text-neutral-600">
          {localClips.length} clips · {notes.length} notes
          {pendingMutation ? " · saving…" : null}
        </span>
      </header>

      <ReviewRenderPane
        projectRoot={project.rootPath}
        renderJob={selectedRenderJob}
        selectedPass={passes.find((pass) => pass.id === selectedPassId)}
      />

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

      <ClipActionBar
        editable={isCurrentPass}
        canSplit={
          isCurrentPass &&
          !!selectedClip &&
          playheadTime > selectedClip.timelineStart + 0.1 &&
          playheadTime < selectedClip.timelineEnd - 0.1
        }
        canUndo={historyCursor > 0}
        canRedo={historyCursor < history.length}
        selectedClipName={selectedClip ? clipName(selectedClip) : undefined}
        onSplit={splitAtPlayhead}
        onDelete={deleteSelected}
        onDuplicate={duplicateSelected}
        onUndo={undo}
        onRedo={redo}
      />

      <TimelinePanel
        clips={localClips}
        notes={notes}
        selectedClipId={selectedClip?.id}
        playheadTime={playheadTime}
        followPlayhead={followPlayhead}
        scrollSignal={scrollSignal}
        editable={isCurrentPass}
        onSelectClip={selectClip}
        onSeek={seekToTime}
        onClipPreview={previewClipChange}
        onClipCommit={(id, patch) => void commitClipChange(id, patch)}
      />

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className="w-full flex-none border-b border-neutral-800 xl:w-96 xl:border-b-0 xl:border-r">
          <PreviewPane
            key={previewClip?.id}
            previewClip={previewClip}
            inspectorClip={selectedClip}
            clipNotes={clipNotes}
            isPlaying={isPlaying}
            playheadTime={playheadTime}
            editable={isCurrentPass}
            onQuickAction={applyQuickAction}
            onCommit={(patch) =>
              selectedClip
                ? void commitClipChange(selectedClip.id, patch)
                : undefined
            }
          />
        </div>

        <div id="note-form" className="flex min-w-0 flex-1 flex-col">
          <form
            ref={noteFormRef}
            onSubmit={handleNoteSubmit}
            className="flex flex-col gap-2 border-b border-neutral-800 p-4"
          >
            <p className="text-[10px] uppercase tracking-widest text-neutral-600">Add Note</p>

            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="author" value="user" />

            <div className="flex flex-wrap gap-2">
              <select
                name="passId"
                value={selectedPassId}
                onChange={(event) => changeSelectedPass(event.target.value)}
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
                {localClips.map((clip) => (
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
                onKeyDown={handleNoteKeyDown}
                placeholder="Note body…"
                className="flex-1 resize-y rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-300 placeholder:text-neutral-600 outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={isSubmittingNote || !draft.trim()}
                className="inline-flex h-fit items-center gap-1 self-end rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
              >
                <Save className="h-3 w-3" aria-hidden="true" />
                {isSubmittingNote ? "Saving" : "Add"}
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
                  const badgeCls = noteTypeBadge[note.noteType] ?? "bg-neutral-700 text-neutral-300";
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
                      <p className="text-xs leading-relaxed text-neutral-300">{note.body}</p>
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

const VISUAL_PRIORITY: Record<TimelineRole, number> = {
  a_roll: 0,
  b_roll: 1,
  still: 2,
  title_card: 3,
  placeholder: 4,
  ambient: 5,
  voiceover: 99,
  music: 99,
};

function visualClipAtTime(clips: TimelineClip[], time: number) {
  const overlapping = clips.filter(
    (clip) => time >= clip.timelineStart && time < clip.timelineEnd,
  );
  if (overlapping.length === 0) return undefined;
  return overlapping
    .slice()
    .sort((a, b) => VISUAL_PRIORITY[a.role] - VISUAL_PRIORITY[b.role])[0];
}

function ClipActionBar({
  editable,
  canSplit,
  canUndo,
  canRedo,
  selectedClipName,
  onSplit,
  onDelete,
  onDuplicate,
  onUndo,
  onRedo,
}: {
  editable: boolean;
  canSplit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedClipName?: string;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const buttonCls =
    "inline-flex h-7 items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-1.5">
      <span className="text-[10px] uppercase tracking-widest text-neutral-500">Clip</span>
      <span className="text-xs text-neutral-400">
        {selectedClipName ?? "—"}
      </span>
      <div className="flex flex-wrap items-center gap-1.5 ml-auto">
        <button
          type="button"
          onClick={onSplit}
          disabled={!editable || !canSplit}
          className={buttonCls}
          title="Split selected clip at playhead (S)"
        >
          <Scissors className="h-3 w-3" aria-hidden="true" />
          Split (S)
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={!editable}
          className={buttonCls}
          title="Duplicate selected clip (⌘D)"
        >
          <Copy className="h-3 w-3" aria-hidden="true" />
          Duplicate (⌘D)
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!editable}
          className={`${buttonCls} hover:bg-red-700`}
          title="Delete selected clip (Delete)"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
          Delete (⌫)
        </button>
        <span className="mx-1 h-4 w-px bg-neutral-700" />
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={buttonCls}
          title="Undo (⌘Z)"
        >
          <Undo2 className="h-3 w-3" aria-hidden="true" />
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className={buttonCls}
          title="Redo (⌘⇧Z)"
        >
          <Redo2 className="h-3 w-3" aria-hidden="true" />
          Redo
        </button>
      </div>
    </div>
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

function ReviewRenderPane({
  projectRoot,
  renderJob,
  selectedPass,
}: {
  projectRoot: string;
  renderJob?: RenderJob;
  selectedPass?: Pass;
}) {
  const source = mediaUrl(renderJob?.outputPath, projectRoot);

  return (
    <section className="grid gap-3 border-b border-neutral-800 bg-neutral-950 p-3 lg:grid-cols-[minmax(360px,520px)_1fr]">
      <div className="aspect-video min-w-0 overflow-hidden rounded border border-neutral-800 bg-black">
        {source ? (
          <video
            key={renderJob?.id}
            className="h-full w-full object-contain"
            controls
            preload="metadata"
            src={source}
          />
        ) : (
          <div className="grid h-full place-items-center px-4 text-center text-[10px] uppercase tracking-widest text-neutral-600">
            No rendered review cut for this pass.
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
            <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
            Current Render
          </div>
          <div>
            <h2 className="truncate text-sm font-semibold text-neutral-100">
              {renderJob?.name ?? selectedPass?.name ?? "No render selected"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              {selectedPass?.goal ??
                "When the AI creates the next pass, it should write a render job and timeline rows here."}
            </p>
          </div>
        </div>

        <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
          <RenderInfo label="Pass" value={selectedPass?.name ?? "—"} />
          <RenderInfo label="Status" value={renderJob?.status ?? "—"} />
          <RenderInfo label="Output" value={renderJob?.outputPath ?? "—"} />
          <RenderInfo label="Command" value={renderJob?.command ?? "—"} />
        </dl>
      </div>
    </section>
  );
}

function RenderInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-widest text-neutral-600">{label}</dt>
      <dd className="mt-0.5 truncate text-neutral-300" title={value}>
        {value}
      </dd>
    </div>
  );
}

function PreviewPane({
  previewClip,
  inspectorClip,
  clipNotes,
  isPlaying,
  playheadTime,
  editable,
  onQuickAction,
  onCommit,
}: {
  previewClip?: TimelineClip;
  inspectorClip?: TimelineClip;
  clipNotes: Note[];
  isPlaying: boolean;
  playheadTime: number;
  editable: boolean;
  onQuickAction: (action: QuickAction) => void;
  onCommit: (patch: ClipPatch) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Preview pane follows the playhead; inspector / metadata follow explicit selection.
  const clip = previewClip ?? inspectorClip;
  const metaClip = inspectorClip ?? previewClip;
  const thumbnail = mediaUrl(clip?.asset?.metadata.thumbnailPath);
  const source = mediaUrl(clip?.asset?.metadata.relativePath);
  const canPreviewVideo = clip?.asset?.kind === "video" && source;
  const canPreviewAudio = clip?.asset?.kind === "audio" && source;
  const clipOffset = clip ? clamp(playheadTime - clip.timelineStart, 0, clip.duration) : 0;
  const sourceTime = (clip?.sourceIn ?? 0) + clipOffset;
  const rotation = clipRotation(clip);

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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canPreviewAudio) return;

    if (Number.isFinite(sourceTime) && Math.abs(audio.currentTime - sourceTime) > 0.75) {
      audio.currentTime = sourceTime;
    }

    if (isPlaying) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [canPreviewAudio, clip?.id, isPlaying, sourceTime]);

  if (!clip || !metaClip) {
    return (
      <div className="grid h-full min-h-[240px] place-items-center text-xs text-neutral-600">
        No timeline clips found.
      </div>
    );
  }

  const badgeCls = roleBadge[metaClip.role] ?? "bg-neutral-700 text-neutral-300";
  const previewIsDifferent = clip.id !== metaClip.id;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="relative aspect-video w-full overflow-hidden rounded border border-neutral-800 bg-black">
        {canPreviewVideo ? (
          <video
            ref={videoRef}
            key={clip.id}
            className="absolute left-1/2 top-1/2 object-contain"
            controls={rotation === 0}
            poster={thumbnail}
            preload="metadata"
            src={source}
            style={rotatedMediaStyle(rotation)}
          />
        ) : canPreviewAudio ? (
          <div className="grid h-full place-items-center px-4 text-center">
            <div className="w-full space-y-3">
              <div className="mx-auto flex h-16 max-w-xs items-center justify-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-3">
                {Array.from({ length: 28 }, (_, index) => (
                  <span
                    key={index}
                    className="w-1 rounded-full bg-white/45"
                    style={{
                      height: `${24 + ((index * 19) % 58)}%`,
                    }}
                  />
                ))}
              </div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">Audio Clip</p>
              <audio
                ref={audioRef}
                key={clip.id}
                controls
                preload="metadata"
                src={source}
                className="w-full"
              />
            </div>
          </div>
        ) : thumbnail ? (
          <div
            className="absolute left-1/2 top-1/2 bg-contain bg-center bg-no-repeat"
            style={{
              ...rotatedMediaStyle(rotation),
              backgroundImage: `url(${thumbnail})`,
            }}
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
            {clipName(metaClip)}
          </h2>
          <span className={`flex-none rounded px-1.5 py-0.5 text-[10px] ${badgeCls}`}>
            {humanize(metaClip.role)}
          </span>
        </div>

        {previewIsDifferent ? (
          <p className="text-[10px] text-neutral-500">
            previewing <span className="text-neutral-300">{clipName(clip)}</span> at the playhead — inspector below edits the selected clip
          </p>
        ) : null}

        <table className="w-full border-collapse text-xs text-neutral-400">
          <tbody>
            <Row label="Source" value={sourceName(metaClip)} />
            <Row label="Section" value={metaClip.section} />
            <Row label="Timeline" value={`${formatTime(metaClip.timelineStart)} → ${formatTime(metaClip.timelineEnd)}`} mono />
            <Row label="Source Range" value={`${formatTime(metaClip.sourceIn)} → ${formatTime(metaClip.sourceOut)}`} mono />
            <Row label="Duration" value={`${metaClip.duration.toFixed(2)}s`} mono />
            <Row label="Status" value={humanize(metaClip.asset?.status ?? "unknown")} />
            <Row label="Notes" value={String(clipNotes.length)} mono />
          </tbody>
        </table>

        {metaClip.notes ? (
          <p className="border-t border-neutral-800 pt-2 text-xs leading-relaxed text-neutral-500">
            {metaClip.notes}
          </p>
        ) : null}
      </div>

      <ClipInspector key={metaClip.id} clip={metaClip} editable={editable} onCommit={onCommit} />

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-neutral-600">
          Quick Notes
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

function ClipInspector({
  clip,
  editable,
  onCommit,
}: {
  clip: TimelineClip;
  editable: boolean;
  onCommit: (patch: ClipPatch) => void;
}) {
  // Local input state — committed onBlur or Enter.
  // Parent passes a `key={clip.id}` prop so this component remounts (and
  // resets) when the selected clip changes, avoiding setState-in-effect.
  const [timelineStart, setTimelineStart] = useState(clip.timelineStart.toString());
  const [sourceIn, setSourceIn] = useState((clip.sourceIn ?? 0).toString());
  const [sourceOut, setSourceOut] = useState((clip.sourceOut ?? 0).toString());
  const [duration, setDuration] = useState(clip.duration.toString());
  const [role, setRole] = useState<TimelineRole>(clip.role);

  function commitField(field: keyof ClipPatch, raw: string) {
    if (!editable) return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    onCommit({ [field]: value });
  }

  function commitRole(next: TimelineRole) {
    if (!editable) return;
    if (next === clip.role) return;
    setRole(next);
    onCommit({ role: next });
  }

  return (
    <div className="space-y-1.5 rounded border border-neutral-800 bg-neutral-900 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">Inspector</p>
        {!editable ? (
          <span className="text-[10px] text-amber-500/80">read-only · historical pass</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Timeline start (s)"
          value={timelineStart}
          editable={editable}
          onChange={setTimelineStart}
          onCommit={() => commitField("timelineStart", timelineStart)}
        />
        <NumberField
          label="Duration (s)"
          value={duration}
          editable={editable}
          onChange={setDuration}
          onCommit={() => commitField("targetDuration", duration)}
        />
        <NumberField
          label="Source in (s)"
          value={sourceIn}
          editable={editable}
          onChange={setSourceIn}
          onCommit={() => commitField("sourceIn", sourceIn)}
        />
        <NumberField
          label="Source out (s)"
          value={sourceOut}
          editable={editable}
          onChange={setSourceOut}
          onCommit={() => commitField("sourceOut", sourceOut)}
        />
        <label className="flex flex-col gap-0.5 text-[10px] text-neutral-500">
          Role
          <select
            value={role}
            disabled={!editable}
            onChange={(e) => commitRole(e.target.value as TimelineRole)}
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-blue-600 disabled:opacity-50"
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  editable,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (next: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] text-neutral-500">
      {label}
      <input
        type="number"
        step="0.1"
        value={value}
        readOnly={!editable}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs tabular-nums text-neutral-200 outline-none focus:border-blue-600 read-only:opacity-60"
      />
    </label>
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
      <td className={`py-0.5 text-neutral-300 ${mono ? "tabular-nums" : ""}`}>{value}</td>
    </tr>
  );
}

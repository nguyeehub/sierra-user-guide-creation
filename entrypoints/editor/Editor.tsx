import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  deleteSession,
  deleteStep,
  getSession,
  listNavs,
  listSessions,
  listSteps,
  reorderSteps,
  updateSession,
  updateStep,
} from '@/lib/db';
import { exportSession, type ExportFormat } from '@/lib/export';
import type { NavEvent, Session, Step } from '@/lib/types';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Code,
  Crop,
  ExternalLink,
  FileText,
  GripVertical,
  MountainMark,
  Package,
  Plus,
  Sparkles,
  Trash,
  X as XIcon,
} from '@/lib/icons';
import './editor.css';

type StepView = Step & { previewUrl: string };

export default function Editor() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [steps, setSteps] = useState<StepView[]>([]);
  const [navs, setNavs] = useState<NavEvent[]>([]);

  const refreshSessions = useCallback(async () => {
    setSessions(await listSessions());
  }, []);

  const load = useCallback(async (id: string) => {
    const s = await getSession(id);
    setSession(s ?? null);
    const list = await listSteps(id);
    setSteps(
      list.map((st) => ({ ...st, previewUrl: URL.createObjectURL(st.image) })),
    );
    setNavs(await listNavs(id));
  }, []);

  useEffect(() => {
    void refreshSessions();
    const onHash = () => {
      const id = location.hash.slice(1);
      setSessionId(id || null);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [refreshSessions]);

  useEffect(() => {
    if (sessionId) void load(sessionId);
    else {
      setSession(null);
      setSteps([]);
      setNavs([]);
    }
  }, [sessionId, load]);

  useEffect(() => {
    return () => {
      steps.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, [steps]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const timeline = useMemo(
    () => buildTimelineView(steps, navs),
    [steps, navs],
  );

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id || !sessionId) return;
    const oldIdx = steps.findIndex((s) => s.id === e.active.id);
    const newIdx = steps.findIndex((s) => s.id === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(steps, oldIdx, newIdx);
    setSteps(next);
    await reorderSteps(
      sessionId,
      next.map((n) => n.id),
    );
  }

  function editCaption(id: string, caption: string) {
    setSteps((list) =>
      list.map((s) => (s.id === id ? { ...s, caption } : s)),
    );
    const step = steps.find((s) => s.id === id);
    if (!step) return;
    const { previewUrl: _p, ...rest } = step;
    void updateStep({ ...rest, caption });
  }

  function editNote(id: string, note: string) {
    const next = note.trim() ? note : undefined;
    setSteps((list) =>
      list.map((s) => (s.id === id ? { ...s, note: next } : s)),
    );
    const step = steps.find((s) => s.id === id);
    if (!step) return;
    const { previewUrl: _p, ...rest } = step;
    void updateStep({ ...rest, note: next });
  }

  async function cropStep(id: string, frac: { x: number; y: number; w: number; h: number }) {
    const step = steps.find((s) => s.id === id);
    if (!step) return;
    const cropped = await cropImageBlob(step.image, frac);
    if (!cropped) return;
    const dpr = step.dpr || 1;
    const cropPxW = cropped.width;
    const cropPxH = cropped.height;
    const offsetXCss = (frac.x * (cropPxW / frac.w)) / dpr;
    const offsetYCss = (frac.y * (cropPxH / frac.h)) / dpr;
    const newRect = {
      x: step.rect.x - offsetXCss,
      y: step.rect.y - offsetYCss,
      w: step.rect.w,
      h: step.rect.h,
    };
    const { previewUrl: _p, ...rest } = step;
    const nextRaw: Step = { ...rest, image: cropped.blob, rect: newRect };
    await updateStep(nextRaw);
    setSteps((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        URL.revokeObjectURL(s.previewUrl);
        return { ...nextRaw, previewUrl: URL.createObjectURL(cropped.blob) };
      }),
    );
  }

  async function removeStep(id: string) {
    await deleteStep(id);
    setSteps((list) => {
      const dropped = list.find((s) => s.id === id);
      if (dropped) URL.revokeObjectURL(dropped.previewUrl);
      return list.filter((s) => s.id !== id);
    });
  }

  async function renameSession(title: string) {
    if (!session) return;
    const next = { ...session, title };
    await updateSession(next);
    setSession(next);
    await refreshSessions();
  }

  async function removeSession() {
    if (!session) return;
    if (!confirm(`Delete "${session.title}" and all captured steps?`)) return;
    await deleteSession(session.id);
    location.hash = '';
    await refreshSessions();
  }

  async function doExport(fmt: ExportFormat) {
    if (!session) return;
    const rawSteps = await listSteps(session.id);
    const rawNavs = await listNavs(session.id);
    await exportSession(session, rawSteps, rawNavs, fmt);
  }

  if (!sessionId) {
    return (
      <Shell>
        <HomeHero />
        <SessionGrid
          sessions={sessions}
          onPick={(id) => (location.hash = id)}
        />
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <div className="ed-loading">
          <div className="ed-spinner" aria-hidden="true" />
          <span>Loading capture…</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="ed-crumb">
        <a href="#" className="ed-back" onClick={() => (location.hash = '')}>
          <ArrowLeft size={14} />
          All captures
        </a>
        <button
          type="button"
          className="btn btn-danger"
          onClick={removeSession}
        >
          <Trash size={14} />
          Delete capture
        </button>
      </div>

      <div className="ed-title-wrap">
        <span className="section-label">Article topic</span>
        <input
          value={session.title}
          onChange={(e) => renameSession(e.target.value)}
          className="ed-title-input"
          aria-label="Article topic"
          placeholder="Untitled capture"
        />
        <div className="ed-meta">
          <span className="ed-meta-chip">
            <Sparkles size={12} />
            {steps.length} captured {steps.length === 1 ? 'step' : 'steps'}
          </span>
          <span className="ed-meta-chip">
            <ExternalLink size={12} />
            {navs.length} navigation{navs.length === 1 ? '' : 's'}
          </span>
          <span className="ed-meta-chip">
            <Clock size={12} />
            Updated {new Date(session.updatedAt).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="ed-handoff card">
        <div className="ed-handoff-icon" aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <div className="ed-handoff-body">
          <span className="section-label">Hand off to your AI writing agent</span>
          <h2 className="ed-handoff-title">
            Sierra doesn&rsquo;t write the article — your agent does.
          </h2>
          <p className="ed-handoff-sub">
            Download the bundle below. It contains <code>flow.json</code>, the
            highlighted screenshots, navigation events, and any notes you
            added — everything your agent needs to draft a polished article.
            Drop it into ChatGPT, Claude, Cursor, or your own pipeline.
          </p>
          <div className="ed-handoff-actions">
            <button
              className="btn btn-accent btn-lg"
              onClick={() => doExport('agent')}
              disabled={steps.length === 0}
            >
              <Sparkles size={14} />
              Download agent bundle
            </button>
            <span className="ed-handoff-meta">
              ZIP · flow.json + screenshots + navigation + notes
            </span>
          </div>
        </div>
      </div>

      <div className="ed-raw">
        <div className="ed-raw-head">
          <span className="section-label">Raw assets</span>
          <span className="ed-raw-sub">
            Prefer to write the article yourself or feed a different tool.
          </span>
        </div>
        <div className="ed-raw-actions">
          <button
            className="btn"
            onClick={() => doExport('md')}
            disabled={steps.length === 0}
          >
            <FileText size={14} />
            Markdown
          </button>
          <button
            className="btn"
            onClick={() => doExport('html')}
            disabled={steps.length === 0}
          >
            <Code size={14} />
            HTML
          </button>
          <button
            className="btn"
            onClick={() => doExport('zip')}
            disabled={steps.length === 0}
          >
            <Package size={14} />
            Images + markdown ZIP
          </button>
        </div>
      </div>

      <div className="ed-steps-head">
        <span className="section-label">Captured flow</span>
        <span className="ed-steps-sub">
          Tidy up captions, reorder, and add notes — the agent treats this as
          its script.
        </span>
      </div>

      {steps.length === 0 ? (
        <div className="ed-empty">
          <div className="ed-empty-icon" aria-hidden="true">
            <Sparkles size={20} />
          </div>
          <h3 className="ed-empty-title">No steps captured yet</h3>
          <p className="ed-empty-sub">
            Open the Sierra popup, press <strong>Start capture</strong>, and
            click through the flow. Each click becomes a screenshot and a
            captioned step for your AI agent.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={steps.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="ed-steps">
              {timeline.preNavs.map((n) => (
                <NavItem key={n.id} nav={n} />
              ))}
              {steps.map((s, i) => {
                const after = timeline.navsAfter.get(s.id) ?? [];
                return (
                  <div key={s.id}>
                    <StepCard
                      step={s}
                      index={i}
                      onCaption={editCaption}
                      onNote={editNote}
                      onCrop={cropStep}
                      onDelete={removeStep}
                    />
                    {after.map((n) => (
                      <NavItem key={n.id} nav={n} />
                    ))}
                  </div>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </Shell>
  );
}

function buildTimelineView(steps: StepView[], navs: NavEvent[]) {
  const stepsByTime = [...steps].sort((a, b) => a.createdAt - b.createdAt);
  const navsAfter = new Map<string, NavEvent[]>();
  const preNavs: NavEvent[] = [];
  let si = 0;
  for (const n of navs) {
    while (si < stepsByTime.length && stepsByTime[si]!.createdAt < n.timestamp)
      si++;
    if (si === 0) {
      preNavs.push(n);
      continue;
    }
    const ownerId = stepsByTime[si - 1]!.id;
    const arr = navsAfter.get(ownerId) ?? [];
    arr.push(n);
    navsAfter.set(ownerId, arr);
  }
  return { preNavs, navsAfter };
}

function NavItem({ nav }: { nav: NavEvent }) {
  const label = nav.kind === 'initial' ? 'Started at' : 'Navigated to';
  let host = nav.url;
  try {
    host = new URL(nav.url).host;
  } catch {
    /* leave raw */
  }
  return (
    <li className="ed-nav" aria-label={`${label} ${nav.url}`}>
      <span className="ed-nav-line" aria-hidden="true" />
      <span className="ed-nav-body">
        <ExternalLink size={11} />
        <span className="ed-nav-kind">{label}</span>
        <span className="ed-nav-host">{host}</span>
        <span className="ed-nav-url" title={nav.url}>
          {nav.url}
        </span>
      </span>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="ed-topbar">
        <div className="ed-topbar-inner">
          <a href="#" className="sierra-brand" aria-label="Sierra home">
            <span className="sierra-logomark" aria-hidden="true">
              <img src="/icon/48.png" alt="" />
            </span>
            <span className="sierra-wordmark">Sierra</span>
          </a>
          <span className="ed-topbar-tag">
            Capture kit for AI article writers
          </span>
        </div>
      </header>
      <main className="ed-main">{children}</main>
    </>
  );
}

function HomeHero() {
  return (
    <section className="ed-hero fade-in">
      <span className="ed-hero-eyebrow">
        <Sparkles size={12} />
        Capture kit for AI writers
      </span>
      <h1 className="ed-hero-title">
        You capture the flow.
        <br />
        Your AI agent writes the article.
      </h1>
      <p className="ed-hero-sub">
        Sierra records every click as an annotated screenshot with rich
        metadata. Hand the bundle to your AI writing agent — ChatGPT, Claude,
        Cursor — and it drafts the support article from your real steps.
      </p>
      <div className="ed-hero-steps">
        <div className="ed-hero-step">
          <span className="ed-hero-step-num">1</span>
          <span className="ed-hero-step-label">Record a click-through</span>
        </div>
        <div className="ed-hero-step-sep" />
        <div className="ed-hero-step">
          <span className="ed-hero-step-num">2</span>
          <span className="ed-hero-step-label">Review the captured steps</span>
        </div>
        <div className="ed-hero-step-sep" />
        <div className="ed-hero-step">
          <span className="ed-hero-step-num">3</span>
          <span className="ed-hero-step-label">Hand the bundle to your agent</span>
        </div>
      </div>
      <div className="ed-hero-actions">
        <span className="ed-hero-hint">
          Open the Sierra extension to start a new capture.
        </span>
      </div>
    </section>
  );
}

function SessionGrid({
  sessions,
  onPick,
}: {
  sessions: Session[];
  onPick: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="ed-empty fade-in">
        <div className="ed-empty-icon" aria-hidden="true">
          <Plus size={20} />
        </div>
        <h3 className="ed-empty-title">No captures yet</h3>
        <p className="ed-empty-sub">
          Open the Sierra popup to record your first click-through. Each
          recording becomes a bundle you can hand to your AI writing agent.
        </p>
      </div>
    );
  }
  return (
    <section className="ed-grid-wrap fade-in">
      <div className="ed-grid-head">
        <span className="section-label">Your captures</span>
        <span className="ed-grid-count">
          {sessions.length} {sessions.length === 1 ? 'capture' : 'captures'}
        </span>
      </div>
      <ul className="ed-grid">
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="ed-card"
              onClick={() => onPick(s.id)}
            >
              <div className="ed-card-body">
                <h3 className="ed-card-title">{s.title}</h3>
                <p className="ed-card-meta">
                  <Clock size={12} />
                  {new Date(s.updatedAt).toLocaleString()}
                </p>
              </div>
              <ChevronRight size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepCard({
  step,
  index,
  onCaption,
  onNote,
  onCrop,
  onDelete,
}: {
  step: StepView;
  index: number;
  onCaption: (id: string, c: string) => void;
  onNote: (id: string, note: string) => void;
  onCrop: (
    id: string,
    frac: { x: number; y: number; w: number; h: number },
  ) => void;
  onDelete: (id: string) => void;
}) {
  const [cropping, setCropping] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const [noteOpen, setNoteOpen] = useState(!!step.note);

  const style = useMemo<React.CSSProperties>(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.65 : 1,
      zIndex: isDragging ? 2 : 1,
    }),
    [transform, transition, isDragging],
  );

  return (
    <li ref={setNodeRef} style={style} className="ed-step">
      <div className="ed-step-head">
        <button
          type="button"
          className="ed-step-grip"
          {...attributes}
          {...listeners}
          aria-label="Reorder step"
          title="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>
        <span className="ed-step-num">{index + 1}</span>
        <input
          value={step.caption}
          onChange={(e) => onCaption(step.id, e.target.value)}
          className="ed-step-caption"
          placeholder="What happened on this click?"
          aria-label={`Step ${index + 1} caption for the AI writing agent`}
        />
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => setCropping((v) => !v)}
          aria-label={cropping ? 'Cancel crop' : 'Crop screenshot'}
          title={cropping ? 'Cancel crop' : 'Crop screenshot'}
        >
          {cropping ? <XIcon size={14} /> : <Crop size={14} />}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => onDelete(step.id)}
          aria-label="Delete step"
          title="Delete step"
        >
          <Trash size={14} />
        </button>
      </div>
      <div className="ed-step-frame">
        <img
          src={step.previewUrl}
          className="ed-step-img"
          alt={step.caption}
          loading="lazy"
        />
        {cropping && (
          <CropOverlay
            onCancel={() => setCropping(false)}
            onApply={(frac) => {
              setCropping(false);
              onCrop(step.id, frac);
            }}
          />
        )}
      </div>

      {noteOpen ? (
        <div className="ed-step-note">
          <span className="ed-step-note-label">Note for the agent</span>
          <textarea
            className="ed-step-note-input"
            value={step.note ?? ''}
            onChange={(e) => onNote(step.id, e.target.value)}
            placeholder="e.g. Skip if SSO is already configured. Allow ~30s for the import to complete."
            rows={2}
            autoFocus={!step.note}
          />
          {!step.note && (
            <button
              type="button"
              className="ed-step-note-close"
              onClick={() => setNoteOpen(false)}
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="ed-step-note-add"
          onClick={() => setNoteOpen(true)}
        >
          <Plus size={12} />
          Add note for the agent
        </button>
      )}

      <a
        className="ed-step-url"
        href={step.url}
        target="_blank"
        rel="noreferrer"
        title={step.url}
      >
        <ExternalLink size={11} />
        <span>{step.url}</span>
      </a>
    </li>
  );
}

type Frac = { x: number; y: number; w: number; h: number };

function CropOverlay({
  onApply,
  onCancel,
}: {
  onApply: (frac: Frac) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [sel, setSel] = useState<Frac | null>(null);
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

  function clientToFrac(clientX: number, clientY: number): { x: number; y: number } {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
    const y = Math.min(Math.max((clientY - r.top) / r.height, 0), 1);
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = clientToFrac(e.clientX, e.clientY);
    dragRef.current = { startX: p.x, startY: p.y };
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const p = clientToFrac(e.clientX, e.clientY);
    const { startX, startY } = dragRef.current;
    setSel({
      x: Math.min(startX, p.x),
      y: Math.min(startY, p.y),
      w: Math.abs(p.x - startX),
      h: Math.abs(p.y - startY),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const ready = !!sel && sel.w > 0.005 && sel.h > 0.005;

  return (
    <div className="ed-crop-layer" ref={ref}>
      <div
        className="ed-crop-surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {sel && (
        <div
          className="ed-crop-sel"
          style={{
            left: `${sel.x * 100}%`,
            top: `${sel.y * 100}%`,
            width: `${sel.w * 100}%`,
            height: `${sel.h * 100}%`,
          }}
        />
      )}
      <div className="ed-crop-hint">
        {ready ? 'Apply or drag again to redraw' : 'Drag to select a crop region'}
      </div>
      <div className="ed-crop-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
        >
          <XIcon size={14} />
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-accent"
          disabled={!ready}
          onClick={() => ready && onApply(sel!)}
        >
          <Check size={14} />
          Apply crop
        </button>
      </div>
    </div>
  );
}

async function cropImageBlob(
  blob: Blob,
  frac: Frac,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const bitmap = await createImageBitmap(blob);
  const sx = Math.round(frac.x * bitmap.width);
  const sy = Math.round(frac.y * bitmap.height);
  const sw = Math.max(1, Math.round(frac.w * bitmap.width));
  const sh = Math.max(1, Math.round(frac.h * bitmap.height));
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(sw, sh)
      : Object.assign(document.createElement('canvas'), {
          width: sw,
          height: sh,
        });
  const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext(
    '2d',
  ) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const out =
    canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type: 'image/png' })
      : await new Promise<Blob>((resolve, reject) => {
          (canvas as HTMLCanvasElement).toBlob(
            (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
            'image/png',
          );
        });
  bitmap.close?.();
  return { blob: out, width: sw, height: sh };
}

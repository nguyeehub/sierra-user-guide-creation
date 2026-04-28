import { useCallback, useEffect, useRef, useState } from 'react';
import { listSessions } from '@/lib/db';
import type { Session, StateResponse } from '@/lib/types';
import {
  ChevronRight,
  Clock,
  Play,
  Sparkles,
  Square,
} from '@/lib/icons';
import {
  dismissUpdate,
  getDismissedVersion,
  getStoredUpdateInfo,
  type UpdateInfo,
} from '@/lib/update';
import './popup.css';

const DEFAULT_HIGHLIGHT = '#2563eb';
const COLOR_PRESETS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#f59e0b',
  '#9333ea',
  '#0f172a',
];
const CUSTOM_HISTORY_MAX = 8;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const isPreset = (c: string) => COLOR_PRESETS.includes(c.toLowerCase());

export default function Popup() {
  const [recording, setRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT);
  const [customHistory, setCustomHistory] = useState<string[]>([]);
  const customHistoryRef = useRef<string[]>([]);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const state = (await browser.runtime.sendMessage({
      type: 'sierra:state',
    })) as StateResponse;
    setRecording(!!state?.recording);
    setSessionId(state?.sessionId ?? null);
    setSessions(await listSessions());
    const stored = await browser.storage.local.get([
      'highlightColor',
      'customColorHistory',
    ]);
    const raw = typeof stored.highlightColor === 'string' ? stored.highlightColor : '';
    const current = HEX_RE.test(raw) ? raw.toLowerCase() : DEFAULT_HIGHLIGHT;
    setHighlightColor(current);
    const hist = (Array.isArray(stored.customColorHistory)
      ? stored.customColorHistory
      : []
    )
      .filter((x: unknown): x is string => typeof x === 'string' && HEX_RE.test(x))
      .map((x: string) => x.toLowerCase())
      .filter((x: string) => !isPreset(x));
    if (!isPreset(current) && !hist.includes(current)) hist.unshift(current);
    setCustomHistory(hist.slice(0, CUSTOM_HISTORY_MAX));
    setUpdate(await getStoredUpdateInfo());
    setDismissedVersion(await getDismissedVersion());
  }, []);

  const onDismissUpdate = useCallback(async () => {
    if (!update?.latestVersion) return;
    await dismissUpdate(update.latestVersion);
    setDismissedVersion(update.latestVersion);
  }, [update?.latestVersion]);

  const commitHighlightColor = useCallback(
    async (c: string, addToHistory = false) => {
      if (!HEX_RE.test(c)) return;
      const norm = c.toLowerCase();
      setHighlightColor(norm);
      await browser.storage.local.set({ highlightColor: norm });
      if (addToHistory && !isPreset(norm)) {
        const next = [
          norm,
          ...customHistoryRef.current.filter((x) => x !== norm),
        ].slice(0, CUSTOM_HISTORY_MAX);
        customHistoryRef.current = next;
        setCustomHistory(next);
        await browser.storage.local.set({ customColorHistory: next });
      }
    },
    [],
  );

  useEffect(() => {
    customHistoryRef.current = customHistory;
  }, [customHistory]);

  useEffect(() => {
    const el = colorInputRef.current;
    if (!el) return;
    const onCommit = () => {
      void commitHighlightColor(el.value, true);
    };
    el.addEventListener('change', onCommit);
    return () => el.removeEventListener('change', onCommit);
  }, [commitHighlightColor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function start() {
    await browser.runtime.sendMessage({
      type: 'sierra:start',
      title: title.trim() || 'Untitled capture',
    });
    setTitle('');
    await refresh();
    window.close();
  }

  async function stop() {
    const currentId = sessionId;
    await browser.runtime.sendMessage({ type: 'sierra:stop' });
    await refresh();
    if (currentId) openEditor(currentId);
  }

  function openEditor(id: string) {
    browser.tabs.create({
      url: browser.runtime.getURL(`/editor.html#${id}` as `/editor.html`),
    });
    window.close();
  }

  const showUpdate =
    !!update?.available &&
    !!update.latestVersion &&
    update.latestVersion !== dismissedVersion;

  return (
    <div className="pop">
      {showUpdate && update && (
        <div className="pop-update fade-in">
          <div className="pop-update-body">
            <span className="pop-update-title">
              Update available — v{update.latestVersion}
            </span>
            <span className="pop-update-sub">
              You're on v{update.currentVersion}. Download the new build and
              reload the unpacked extension.
            </span>
          </div>
          <div className="pop-update-actions">
            <a
              className="btn btn-primary pop-update-btn"
              href={update.downloadUrl ?? update.htmlUrl ?? '#'}
              target="_blank"
              rel="noreferrer"
            >
              Get update
            </a>
            <button
              type="button"
              className="btn btn-ghost pop-update-btn"
              onClick={onDismissUpdate}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <header className="pop-head">
        <span className="sierra-brand">
          <span className="sierra-logomark" aria-hidden="true">
            <img src="/icon/48.png" alt="" />
          </span>
          <span className="sierra-wordmark">Sierra</span>
        </span>
        {recording && (
          <span className="pop-status">
            <span className="rec-dot" />
            Capturing
          </span>
        )}
      </header>

      {recording ? (
        <section className="pop-rec fade-in">
          <div className="pop-rec-body">
            <h2 className="pop-rec-title">Capturing your flow</h2>
            <p className="pop-rec-sub">
              Click through the steps. Sierra saves each action as an annotated
              screenshot — assets your AI agent will turn into an article.
            </p>
          </div>
          <button className="btn btn-primary btn-block btn-lg" onClick={stop}>
            <Square size={14} />
            Stop &amp; review capture
          </button>
        </section>
      ) : (
        <section className="pop-start fade-in">
          <label className="pop-field">
            <span className="section-label">Article topic</span>
            <input
              className="input input-lg"
              placeholder="e.g. How to reset your password"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void start();
              }}
              autoFocus
            />
          </label>
          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={start}
          >
            <Play size={14} />
            Start capture
          </button>
          <p className="pop-hint">
            <Sparkles size={12} />
            <span>
              Sierra captures the source material. Hand the bundle to
              ChatGPT, Claude, or Cursor — the agent writes the article.
            </span>
          </p>
        </section>
      )}

      <section className="pop-recent">
        <div className="pop-recent-head">
          <span className="section-label">Recent captures</span>
        </div>
        {sessions.length === 0 ? (
          <div className="pop-empty">
            <Clock size={14} />
            <span>Your captures will appear here.</span>
          </div>
        ) : (
          <ul className="pop-list">
            {sessions.slice(0, 5).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="pop-item"
                  onClick={() => openEditor(s.id)}
                  title={new Date(s.updatedAt).toLocaleString()}
                >
                  <span className="pop-item-body">
                    <span className="pop-item-title">{s.title}</span>
                    <span className="pop-item-meta">
                      {formatRelative(s.updatedAt)}
                    </span>
                  </span>
                  <ChevronRight size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pop-settings">
        <span className="section-label">Highlight color</span>
        <div className="pop-swatch-grid">
          <div className="pop-swatches">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={
                  'pop-swatch' + (c === highlightColor ? ' is-selected' : '')
                }
                style={{ background: c }}
                onClick={() => void commitHighlightColor(c)}
                aria-label={`Use ${c}`}
                aria-pressed={c === highlightColor}
              />
            ))}
          </div>
          <div className="pop-swatches">
            <label
              className="pop-swatch pop-swatch-custom"
              title="Pick a new color"
              aria-label="Pick a new color"
            >
              <input
                ref={colorInputRef}
                type="color"
                value={highlightColor}
                onChange={(e) =>
                  setHighlightColor(e.target.value.toLowerCase())
                }
              />
              <span className="pop-swatch-custom-fill" />
            </label>
            {customHistory.map((c) => (
              <button
                key={c}
                type="button"
                className={
                  'pop-swatch' + (c === highlightColor ? ' is-selected' : '')
                }
                style={{ background: c }}
                onClick={() => void commitHighlightColor(c)}
                aria-label={`Use ${c}`}
                aria-pressed={c === highlightColor}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

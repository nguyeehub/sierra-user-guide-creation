import { useCallback, useEffect, useState } from 'react';
import { listSessions } from '@/lib/db';
import type { Session, StateResponse } from '@/lib/types';
import {
  ChevronRight,
  Clock,
  Play,
  Sparkles,
  Square,
} from '@/lib/icons';
import './popup.css';

export default function Popup() {
  const [recording, setRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);

  const refresh = useCallback(async () => {
    const state = (await browser.runtime.sendMessage({
      type: 'sierra:state',
    })) as StateResponse;
    setRecording(!!state?.recording);
    setSessionId(state?.sessionId ?? null);
    setSessions(await listSessions());
  }, []);

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

  return (
    <div className="pop">
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

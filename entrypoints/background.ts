import { addNav, addStep, countSteps, createSession, lastNavUrl } from '@/lib/db';
import { buildCaption } from '@/lib/selector';
import type { ClickMessage, NavEvent, Step } from '@/lib/types';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.action.setBadgeBackgroundColor({ color: '#2563eb' });
  });

  browser.action.onClicked.addListener(() => {
    // Popup handles UI; this fallback keeps extension responsive
    // if user opens without popup (not expected in MV3 with default_popup).
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('[sierra/bg] onMessage', msg?.type, 'from tab', sender.tab?.id);
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === 'sierra:click') {
      handleClick(msg as ClickMessage, sender.tab?.windowId).catch((err) =>
        console.error('[sierra/bg] click handler failed', err),
      );
      return false;
    }
    if (msg.type === 'sierra:start') {
      start(msg.title).then(sendResponse);
      return true;
    }
    if (msg.type === 'sierra:stop') {
      stop().then(sendResponse);
      return true;
    }
    if (msg.type === 'sierra:state') {
      getState().then(sendResponse);
      return true;
    }
    return false;
  });

  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url) return;
    const state = await getState();
    if (!state.recording || !state.sessionId) return;
    if (isIgnorableUrl(changeInfo.url)) return;
    if (tab.windowId !== undefined) {
      // only record for the window where recording started, to reduce noise
      const rec = await browser.storage.local.get('recordingWindowId');
      const windowId = rec.recordingWindowId as number | undefined;
      if (windowId !== undefined && tab.windowId !== windowId) return;
    }
    const prev = await lastNavUrl(state.sessionId);
    if (prev === changeInfo.url) return;
    await recordNav({
      sessionId: state.sessionId,
      url: changeInfo.url,
      pageTitle: tab.title,
      kind: 'commit',
      tabId,
    });
  });

  async function getState() {
    const raw = await browser.storage.local.get(['recording', 'sessionId']);
    return {
      recording: !!raw.recording,
      sessionId: (raw.sessionId as string) ?? null,
    };
  }

  async function start(title: string) {
    const session = await createSession(title || 'Untitled capture');
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    await browser.storage.local.set({
      recording: true,
      sessionId: session.id,
      recordingWindowId: activeTab?.windowId ?? null,
    });
    await browser.action.setBadgeText({ text: 'REC' });
    await browser.action.setBadgeBackgroundColor({ color: '#dc2626' });
    if (activeTab?.url && !isIgnorableUrl(activeTab.url)) {
      await recordNav({
        sessionId: session.id,
        url: activeTab.url,
        pageTitle: activeTab.title,
        kind: 'initial',
        tabId: activeTab.id,
      });
    }
    console.log('[sierra/bg] started session', session.id);
    return { sessionId: session.id };
  }

  async function stop() {
    const state = await getState();
    await browser.storage.local.set({
      recording: false,
      sessionId: null,
      recordingWindowId: null,
    });
    await browser.action.setBadgeText({ text: '' });
    await browser.action.setBadgeBackgroundColor({ color: '#2563eb' });
    return { ok: true, sessionId: state.sessionId };
  }

  async function recordNav(args: Omit<NavEvent, 'id' | 'timestamp'>) {
    const nav: NavEvent = {
      ...args,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    await addNav(nav);
    console.log('[sierra/bg] nav', nav.kind, nav.url);
  }

  function isIgnorableUrl(url: string): boolean {
    return (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('devtools://')
    );
  }

  async function handleClick(msg: ClickMessage, windowId?: number) {
    if (windowId === undefined) return;
    const dataUrl = await browser.tabs.captureVisibleTab(windowId, {
      format: 'png',
    });
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const dpr = msg.dpr || 1;
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);

    const r = {
      x: msg.rect.x * dpr,
      y: msg.rect.y * dpr,
      w: msg.rect.w * dpr,
      h: msg.rect.h * dpr,
    };
    const pad = 6 * dpr;
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4 * dpr;
    ctx.shadowColor = 'rgba(37,99,235,0.45)';
    ctx.shadowBlur = 14 * dpr;
    roundRect(
      ctx,
      r.x - pad,
      r.y - pad,
      r.w + pad * 2,
      r.h + pad * 2,
      10 * dpr,
    );
    ctx.stroke();
    ctx.restore();

    const finalBlob = await canvas.convertToBlob({ type: 'image/png' });
    const order = await countSteps(msg.sessionId);
    const step: Step = {
      id: crypto.randomUUID(),
      sessionId: msg.sessionId,
      order,
      url: msg.url,
      pageTitle: msg.pageTitle,
      caption: buildCaption(msg.element.tag, msg.element.text, msg.element.role),
      image: finalBlob,
      rect: msg.rect,
      dpr,
      element: msg.element,
      createdAt: Date.now(),
    };
    await addStep(step);
    console.log('[sierra/bg] saved step', step.id, 'order', step.order);
  }

  function roundRect(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
});

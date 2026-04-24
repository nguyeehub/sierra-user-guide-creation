import { extractElement, findInteractiveAncestor } from '@/lib/selector';
import type { ClickMessage } from '@/lib/types';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*', 'file://*/*'],
  excludeMatches: [
    'https://chrome.google.com/*',
    'https://chromewebstore.google.com/*',
  ],
  runAt: 'document_start',
  allFrames: false,
  async main() {
    console.log('[sierra] content script loaded on', location.href);
    let recording = false;
    let sessionId: string | null = null;

    async function refresh() {
      try {
        const state = await browser.storage.local.get([
          'recording',
          'sessionId',
        ]);
        recording = !!state.recording;
        sessionId = (state.sessionId as string) ?? null;
      } catch {
        recording = false;
        sessionId = null;
      }
    }
    await refresh();

    try {
      browser.storage.onChanged.addListener((_changes, area) => {
        if (area === 'local') void refresh();
      });
    } catch {
      // restricted context; ignore
    }

    document.addEventListener(
      'mousedown',
      (e) => {
        if (!recording || !sessionId) return;
        if (e.button !== 0) return;
        const rawTarget = e.target as Element | null;
        if (!rawTarget || typeof (rawTarget as HTMLElement).getBoundingClientRect !== 'function') return;

        const target = findInteractiveAncestor(rawTarget);
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const element = extractElement(target);
        if (rawTarget !== target) {
          element.ancestorTag = rawTarget.tagName.toLowerCase();
        }

        const msg: ClickMessage = {
          type: 'sierra:click',
          sessionId,
          rect: {
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
          },
          url: location.href,
          pageTitle: document.title,
          element,
          dpr: window.devicePixelRatio || 1,
          viewport: { w: window.innerWidth, h: window.innerHeight },
        };
        browser.runtime.sendMessage(msg).catch((err) => {
          console.warn('[sierra] sendMessage failed', err);
        });
      },
      { capture: true, passive: true },
    );
  },
});

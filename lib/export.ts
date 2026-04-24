import JSZip from 'jszip';
import type { NavEvent, Session, Step } from './types';

export type ExportFormat = 'md' | 'html' | 'zip' | 'agent';

export async function exportSession(
  session: Session,
  steps: Step[],
  navs: NavEvent[],
  fmt: ExportFormat,
) {
  if (fmt === 'md') return exportMarkdown(session, steps, navs);
  if (fmt === 'html') return exportHTML(session, steps);
  if (fmt === 'agent') return exportAgentBundle(session, steps, navs);
  return exportZip(session, steps, navs);
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'flow'
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function escapeHTML(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

async function exportMarkdown(
  session: Session,
  steps: Step[],
  navs: NavEvent[],
) {
  const slug = slugify(session.title);
  let md = `# ${session.title}\n\n`;
  const timeline = buildTimeline(steps, navs);
  for (const item of timeline) {
    if (item.kind === 'nav') {
      md += `> _Navigated to_ \`${item.nav.url}\`\n\n`;
      continue;
    }
    const i = item.index;
    const s = item.step;
    const data = await blobToDataURL(s.image);
    md += `## ${i}. ${s.caption}\n\n![Step ${i}](${data})\n\n*${s.url}*\n\n`;
    if (s.note) md += `> **Note:** ${s.note}\n\n`;
  }
  download(new Blob([md], { type: 'text/markdown' }), `${slug}.md`);
}

async function exportZip(
  session: Session,
  steps: Step[],
  navs: NavEvent[],
) {
  const slug = slugify(session.title);
  const zip = new JSZip();
  let md = `# ${session.title}\n\n`;
  const timeline = buildTimeline(steps, navs);
  for (const item of timeline) {
    if (item.kind === 'nav') {
      md += `> _Navigated to_ \`${item.nav.url}\`\n\n`;
      continue;
    }
    const i = item.index;
    const s = item.step;
    const name = `images/step-${i}.png`;
    zip.file(name, s.image);
    md += `## ${i}. ${s.caption}\n\n![Step ${i}](${name})\n\n*${s.url}*\n\n`;
    if (s.note) md += `> **Note:** ${s.note}\n\n`;
  }
  zip.file(`${slug}.md`, md);
  const blob = await zip.generateAsync({ type: 'blob' });
  download(blob, `${slug}.zip`);
}

type TimelineItem =
  | { kind: 'step'; step: Step; index: number }
  | { kind: 'nav'; nav: NavEvent };

function buildTimeline(steps: Step[], navs: NavEvent[]): TimelineItem[] {
  const stepsByTime = [...steps].sort((a, b) => a.createdAt - b.createdAt);
  const stepIndexById = new Map(steps.map((s, i) => [s.id, i + 1]));
  const out: TimelineItem[] = [];
  let ni = 0;
  for (const s of stepsByTime) {
    while (ni < navs.length && navs[ni]!.timestamp <= s.createdAt) {
      out.push({ kind: 'nav', nav: navs[ni]! });
      ni++;
    }
    out.push({ kind: 'step', step: s, index: stepIndexById.get(s.id) ?? 0 });
  }
  while (ni < navs.length) {
    out.push({ kind: 'nav', nav: navs[ni]! });
    ni++;
  }
  return out;
}

async function exportAgentBundle(
  session: Session,
  steps: Step[],
  navs: NavEvent[],
) {
  const slug = slugify(session.title);
  const zip = new JSZip();
  const pad = String(steps.length).length;

  type AgentStep = {
    index: number;
    imagePath: string;
    caption: string;
    note?: string;
    url: string;
    pageTitle: string;
    element?: {
      tag: string;
      text: string;
      role?: string;
      ariaLabel?: string;
      name?: string;
      placeholder?: string;
      href?: string;
      selector?: string;
      ancestorTag?: string;
    };
    highlight: {
      x: number;
      y: number;
      w: number;
      h: number;
      dpr: number;
      note: string;
    };
    timestamp: string;
  };

  type AgentNav = {
    kind: NavEvent['kind'];
    url: string;
    pageTitle?: string;
    timestamp: string;
  };

  const agentSteps: AgentStep[] = [];
  const agentNavs: AgentNav[] = navs.map((n) => ({
    kind: n.kind,
    url: n.url,
    pageTitle: n.pageTitle,
    timestamp: new Date(n.timestamp).toISOString(),
  }));

  let md = `# ${session.title}\n\n`;
  md += `_Captured user flow exported from Sierra. Screenshots have a blue highlight box drawn around the clicked element._\n\n`;

  const stepIndexById = new Map(steps.map((s, i) => [s.id, i + 1]));
  const stepsByTime = [...steps].sort((a, b) => a.createdAt - b.createdAt);
  const timeline: Array<
    | { kind: 'step'; step: Step; index: number; num: string }
    | { kind: 'nav'; nav: NavEvent }
  > = [];
  let ni = 0;
  for (const s of stepsByTime) {
    while (ni < navs.length && navs[ni]!.timestamp <= s.createdAt) {
      timeline.push({ kind: 'nav', nav: navs[ni]! });
      ni++;
    }
    const idx = stepIndexById.get(s.id) ?? 0;
    timeline.push({
      kind: 'step',
      step: s,
      index: idx,
      num: String(idx).padStart(pad, '0'),
    });
  }
  while (ni < navs.length) {
    timeline.push({ kind: 'nav', nav: navs[ni]! });
    ni++;
  }

  for (const item of timeline) {
    if (item.kind === 'nav') {
      const url = item.nav.url;
      const label =
        item.nav.kind === 'initial' ? 'Started at' : 'Navigated to';
      md += `> _${label}_ \`${url}\`\n\n`;
      continue;
    }
    const { step: s, index: i, num } = item;
    const imagePath = `images/step-${num}.png`;
    zip.file(imagePath, s.image);

    const agentStep: AgentStep = {
      index: i,
      imagePath,
      caption: s.caption,
      note: s.note,
      url: s.url,
      pageTitle: s.pageTitle,
      element: s.element,
      highlight: {
        x: Math.round(s.rect.x),
        y: Math.round(s.rect.y),
        w: Math.round(s.rect.w),
        h: Math.round(s.rect.h),
        dpr: s.dpr,
        note:
          'Coordinates are in CSS pixels within the viewport at capture time. Multiply by dpr to get pixel coordinates in the screenshot image.',
      },
      timestamp: new Date(s.createdAt).toISOString(),
    };
    agentSteps.push(agentStep);

    md += `## Step ${i}. ${s.caption}\n\n`;
    md += `![Step ${i}](${imagePath})\n\n`;
    if (s.note) md += `> **User note:** ${s.note}\n\n`;
    md += `- Page: **${s.pageTitle}**\n`;
    md += `- URL: \`${s.url}\`\n`;
    if (s.element) {
      md += `- Element: \`<${s.element.tag}>\``;
      if (s.element.role) md += ` role=\`${s.element.role}\``;
      md += `\n`;
      if (s.element.text) md += `- Text: "${s.element.text}"\n`;
      if (s.element.ariaLabel) md += `- aria-label: "${s.element.ariaLabel}"\n`;
      if (s.element.href) md += `- href: \`${s.element.href}\`\n`;
      if (s.element.placeholder)
        md += `- placeholder: "${s.element.placeholder}"\n`;
      if (s.element.name) md += `- name: \`${s.element.name}\`\n`;
      if (s.element.selector) md += `- selector: \`${s.element.selector}\`\n`;
    }
    md += `\n`;
  }

  const manifest = {
    version: '2',
    title: session.title,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
    stepCount: steps.length,
    navCount: navs.length,
    steps: agentSteps,
    navigation: agentNavs,
  };

  zip.file('flow.json', JSON.stringify(manifest, null, 2));
  zip.file(`${slug}.md`, md);
  zip.file('README.md', agentReadme(session.title, steps.length, navs.length, pad));

  const blob = await zip.generateAsync({ type: 'blob' });
  download(blob, `${slug}-agent-bundle.zip`);
}

function agentReadme(
  title: string,
  stepCount: number,
  navCount: number,
  pad: number,
): string {
  const exampleNum = '1'.padStart(pad, '0');
  return `# Sierra Article Export — Agent Bundle

**Article:** ${title}
**Steps:** ${stepCount}
**Navigation events:** ${navCount}

This ZIP contains a captured user flow to use as primary source material for generating a detailed step-by-step knowledge base article.

## Files

- \`flow.json\` — structured step + navigation data. **Use this as the canonical source.**
- \`*.md\` — prose rendering (steps interleaved with navigation events) for quick reference.
- \`images/step-NN.png\` — full-viewport PNG screenshot per step. Each screenshot has a blue rounded-rect highlight drawn around the clicked element.
- \`README.md\` — this file.

## flow.json schema

\`\`\`jsonc
{
  "version": "2",
  "title": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "stepCount": 0,
  "navCount": 0,
  "steps": [
    {
      "index": 1,
      "imagePath": "images/step-${exampleNum}.png",
      "caption": "Short auto-generated description of the click",
      "note": "Optional user-provided note to the writing agent (may be absent)",
      "url": "Full page URL at time of click",
      "pageTitle": "document.title at time of click",
      "element": {
        "tag": "button | a | input | ...",
        "text": "Visible text or aria-label",
        "role": "ARIA role if set",
        "ariaLabel": "aria-label if set",
        "name": "name attr if set",
        "placeholder": "placeholder for inputs",
        "href": "destination for links",
        "selector": "Best-effort CSS selector",
        "ancestorTag": "Original tag if the captured element was an interactive ancestor of the raw click target"
      },
      "highlight": {
        "x": 0, "y": 0, "w": 0, "h": 0,
        "dpr": 1,
        "note": "CSS-pixel viewport coords; multiply by dpr for image coords"
      },
      "timestamp": "ISO8601"
    }
  ],
  "navigation": [
    {
      "kind": "initial | commit | spa",
      "url": "Full page URL",
      "pageTitle": "document.title (may be absent for cross-origin)",
      "timestamp": "ISO8601"
    }
  ]
}
\`\`\`

## How to use (for the consuming agent)

1. Parse \`flow.json\`.
2. **Use \`navigation\`** to build the user's route through the product. \`kind: "initial"\` is where the user began the flow; subsequent entries are real URL transitions (\`commit\` = full page load, \`spa\` = client-side route change).
3. For each step, read \`caption\`, \`url\`, \`element\`, and **\`note\`** (if present — it is a hint from the capturer directly to you, e.g. "skip if SSO already configured" or "wait ~30s for the import").
4. Open \`imagePath\` to see the UI state with the clicked target highlighted. Use this to describe visual context, nearby UI, and confirm intent.
5. Interleave steps and navigation events by timestamp to understand the full sequence. When a navigation happens between two steps, describe it in the article as a transition ("After saving, you'll be redirected to the Settings page.").
6. Expand each step into rich instructions: name the control precisely, describe where it is on the page, state the expected outcome.
7. Honor user notes verbatim when they describe prerequisites, warnings, or conditional branches.

## Notes on quality

- Captions are auto-generated and may be imprecise. Prefer \`element.text\` / \`element.ariaLabel\` over the caption when writing the final guide.
- Screenshots are captured on \`mousedown\` (before navigation), so the image shows the page **before** the click resolves. The \`navigation\` array tells you what happened next.
- The highlighted element may be an interactive ancestor of the exact pixel clicked (e.g. click on text inside a button highlights the whole button). \`element.ancestorTag\` records the original target if they differ.
- A \`note\` field is a direct instruction to you from the user capturing the flow — treat it as authoritative even when it contradicts what the raw step data appears to show.
`;
}

async function exportHTML(session: Session, steps: Step[]) {
  const slug = slugify(session.title);
  let body = `<h1>${escapeHTML(session.title)}</h1>`;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const data = await blobToDataURL(s.image);
    body += `<section><h2>${i + 1}. ${escapeHTML(s.caption)}</h2>`;
    body += `<img src="${data}" alt="Step ${i + 1}"/>`;
    body += `<p class="url">${escapeHTML(s.url)}</p></section>`;
  }
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHTML(session.title)}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#111827}
  section{margin-bottom:2rem}
  img{max-width:100%;border-radius:8px;border:1px solid #e5e7eb}
  .url{color:#6b7280;font-size:12px}
  h2{font-size:18px;margin-bottom:8px}
</style></head><body>${body}</body></html>`;
  download(new Blob([html], { type: 'text/html' }), `${slug}.html`);
}

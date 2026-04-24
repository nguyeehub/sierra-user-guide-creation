import type { ElementInfo } from './types';

export function buildSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 5 && cur.nodeType === 1) {
    const node: Element = cur;
    const tag = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const siblings: Element[] = Array.from(parent.children).filter(
      (c): c is Element => c.tagName === node.tagName,
    );
    if (siblings.length === 1) parts.unshift(tag);
    else parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    cur = parent;
    depth++;
  }
  return parts.join(' > ');
}

export function extractText(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.slice(0, 80);
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const input = el as HTMLInputElement;
    return (
      input.placeholder ||
      input.name ||
      input.getAttribute('title') ||
      ''
    ).slice(0, 80);
  }
  const raw = (el as HTMLElement).innerText?.trim() ?? '';
  const firstLine = raw.split(/\r?\n/)[0] ?? '';
  return firstLine.replace(/\s+/g, ' ').slice(0, 80);
}

const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
]);
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'menuitem',
  'tab',
  'option',
  'switch',
  'textbox',
  'combobox',
  'searchbox',
]);

export function findInteractiveAncestor(el: Element, max = 5): Element {
  let cur: Element | null = el;
  let i = 0;
  while (cur && i < max) {
    const tag = cur.tagName.toLowerCase();
    const role = cur.getAttribute('role');
    if (INTERACTIVE_TAGS.has(tag)) return cur;
    if (role && INTERACTIVE_ROLES.has(role)) return cur;
    if (cur.hasAttribute('onclick')) return cur;
    cur = cur.parentElement;
    i++;
  }
  return el;
}

export function extractElement(el: Element): ElementInfo {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || undefined;
  const ariaLabel = el.getAttribute('aria-label') || undefined;
  const name = el.getAttribute('name') || undefined;
  let placeholder: string | undefined;
  let href: string | undefined;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    placeholder = el.placeholder || undefined;
  }
  if (el instanceof HTMLAnchorElement) {
    href = el.href || undefined;
  }
  return {
    tag,
    text: extractText(el),
    role,
    ariaLabel,
    name,
    placeholder,
    href,
    selector: buildSelector(el),
  };
}

export function buildCaption(
  tag: string,
  text: string,
  role?: string,
): string {
  const t = tag.toLowerCase();
  const label = text || role || 'element';
  if (t === 'a' || role === 'link') return `Click "${label}" link`;
  if (
    t === 'input' ||
    t === 'textarea' ||
    t === 'select' ||
    role === 'textbox' ||
    role === 'combobox' ||
    role === 'searchbox'
  )
    return `Click "${label}" field`;
  if (role === 'checkbox' || role === 'switch') return `Toggle "${label}"`;
  if (role === 'tab') return `Open "${label}" tab`;
  return `Click "${label}"`;
}

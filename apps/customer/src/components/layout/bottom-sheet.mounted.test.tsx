import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../i18n/use-translation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../icons/action-icons', () => ({ IcX: () => <span>×</span> }));

import { BottomSheet } from './bottom-sheet';

type Listener = (event: FakeKeyboardEvent) => void;

class FakeNode {
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  ownerDocument!: FakeDocument;
  nodeType = 0;
  nodeName = '';

  appendChild<T extends FakeNode>(node: T): T {
    node.parentNode?.removeChild(node);
    node.parentNode = this;
    node.ownerDocument = this.nodeType === 9 ? this as unknown as FakeDocument : this.ownerDocument;
    this.childNodes.push(node);
    return node;
  }

  insertBefore<T extends FakeNode>(node: T, before: FakeNode | null): T {
    if (before === null) return this.appendChild(node);
    node.parentNode?.removeChild(node);
    const index = this.childNodes.indexOf(before);
    if (index < 0) throw new Error('Reference node is not a child.');
    node.parentNode = this;
    node.ownerDocument = this.ownerDocument;
    this.childNodes.splice(index, 0, node);
    return node;
  }

  removeChild<T extends FakeNode>(node: T): T {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error('Node is not a child.');
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  get firstChild(): FakeNode | null { return this.childNodes[0] ?? null; }
  get lastChild(): FakeNode | null { return this.childNodes.at(-1) ?? null; }
  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }
}

class FakeText extends FakeNode {
  nodeType = 3;
  nodeName = '#text';
  data: string;
  constructor(text: string, document: FakeDocument) {
    super(); this.data = text; this.ownerDocument = document;
  }
  get nodeValue() { return this.data; }
  set nodeValue(value: string | null) { this.data = value ?? ''; }
  get textContent() { return this.data; }
  set textContent(value: string) { this.data = value; }
}

class FakeElement extends FakeNode {
  nodeType = 1;
  namespaceURI = 'http://www.w3.org/1999/xhtml';
  attributes = new Map<string, string>();
  style: Record<string, unknown> & { setProperty: (name: string, value: string) => void };
  disabled = false;
  tabIndex = -1;
  focusCount = 0;
  private ownText = '';
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(readonly tagName: string, document: FakeDocument) {
    super();
    this.nodeName = tagName.toUpperCase();
    this.ownerDocument = document;
    const style = Object.create(null) as Record<string, unknown>;
    this.style = Object.assign(style, {
      setProperty(name: string, value: string) { style[name] = value; },
    });
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
    if (name === 'disabled') this.disabled = true;
  }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === 'disabled') this.disabled = false;
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  focus() { this.focusCount += 1; this.ownerDocument.activeElement = this; }
  contains(node: unknown): boolean {
    let current = node instanceof FakeNode ? node : null;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }
  get isConnected(): boolean {
    return this.parentNode?.nodeType === 9 ||
      (this.parentNode instanceof FakeElement && this.parentNode.isConnected);
  }
  get textContent(): string {
    return this.ownText + this.childNodes.map((child) => 'textContent' in child ? String(child.textContent) : '').join('');
  }
  set textContent(value: string) { this.childNodes = []; this.ownText = value; }
  querySelectorAll<T extends FakeElement = FakeElement>(selector: string): T[] {
    const result: FakeElement[] = [];
    const visit = (node: FakeNode) => {
      if (node instanceof FakeElement && node !== this && matches(node, selector)) result.push(node);
      node.childNodes.forEach(visit);
    };
    this.childNodes.forEach(visit);
    return result as T[];
  }
  querySelector<T extends FakeElement = FakeElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }
}

class FakeKeyboardEvent {
  defaultPrevented = false;
  constructor(readonly key: string, readonly shiftKey = false) {}
  preventDefault() { this.defaultPrevented = true; }
}

class FakeDocument extends FakeNode {
  nodeType = 9;
  nodeName = '#document';
  documentElement: FakeElement;
  body: FakeElement;
  activeElement: FakeElement | null;
  private listeners = new Map<string, Set<Listener>>();

  constructor() {
    super(); this.ownerDocument = this;
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.appendChild(this.documentElement); this.documentElement.appendChild(this.body);
    this.activeElement = this.body;
  }
  createElement(tag: string) { return new FakeElement(tag, this); }
  createElementNS(_namespace: string, tag: string) { return new FakeElement(tag, this); }
  createTextNode(text: string) { return new FakeText(text, this); }
  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  dispatchKey(key: string, shiftKey = false) {
    const event = new FakeKeyboardEvent(key, shiftKey);
    this.listeners.get('keydown')?.forEach((listener) => listener(event));
    return event;
  }
}

function matches(element: FakeElement, selector: string): boolean {
  const tag = element.tagName.toLowerCase();
  if (selector === 'button') return tag === 'button';
  if (tag === 'button') return !element.disabled && selector.includes('button:not([disabled])');
  if (tag === 'a') return element.hasAttribute('href') && selector.includes('a[href]');
  if (['input', 'select', 'textarea'].includes(tag)) return !element.disabled && selector.includes(`${tag}:not([disabled])`);
  return element.tabIndex !== -1 && selector.includes('[tabindex]:not([tabindex="-1"])');
}

let documentHarness: FakeDocument;
let root: Root | null;
let container: FakeElement;

beforeEach(() => {
  documentHarness = new FakeDocument();
  container = documentHarness.createElement('div');
  documentHarness.body.appendChild(container);
  const fakeWindow = { document: documentHarness, HTMLElement: FakeElement, HTMLIFrameElement: class {} };
  Object.assign(globalThis, {
    document: documentHarness, window: fakeWindow, HTMLElement: FakeElement,
    HTMLIFrameElement: fakeWindow.HTMLIFrameElement, KeyboardEvent: FakeKeyboardEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  root = createRoot(container as unknown as Element);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
});

function buttons(): FakeElement[] { return container.querySelectorAll('button'); }

describe('BottomSheet mounted keyboard and focus contract', () => {
  it('lets only the topmost sheet handle Escape', async () => {
    const lowerClose = vi.fn(); const upperClose = vi.fn();
    await act(async () => root?.render(<><BottomSheet open onClose={lowerClose} title="Lower">A</BottomSheet><BottomSheet open onClose={upperClose} title="Upper">B</BottomSheet></>));
    const event = documentHarness.dispatchKey('Escape');
    expect(event.defaultPrevented).toBe(true); expect(upperClose).toHaveBeenCalledOnce(); expect(lowerClose).not.toHaveBeenCalled();
  });

  it('traps Tab and Shift+Tab from outside and wraps at both edges', async () => {
    const outside = documentHarness.createElement('button'); documentHarness.body.appendChild(outside);
    await act(async () => root?.render(<BottomSheet open onClose={() => {}} title="Sheet"><button>First action</button><button>Last action</button></BottomSheet>));
    const [close, first, last] = buttons();
    outside.focus(); documentHarness.dispatchKey('Tab'); expect(documentHarness.activeElement).toBe(close);
    outside.focus(); documentHarness.dispatchKey('Tab', true); expect(documentHarness.activeElement).toBe(last);
    last?.focus(); documentHarness.dispatchKey('Tab'); expect(documentHarness.activeElement).toBe(close);
    close?.focus(); documentHarness.dispatchKey('Tab', true); expect(documentHarness.activeElement).toBe(last);
    expect(first).toBeDefined();
  });

  it.each(['ltr', 'rtl'] as const)('inherits %s direction and skips disabled controls', async (direction) => {
    documentHarness.documentElement.setAttribute('dir', direction);
    await act(async () => root?.render(<BottomSheet open onClose={() => {}}><button disabled>Disabled</button><button>Enabled</button></BottomSheet>));
    const [disabled, enabled] = buttons();
    expect(documentHarness.documentElement.getAttribute('dir')).toBe(direction);
    expect(disabled?.disabled).toBe(true); expect(documentHarness.activeElement).toBe(enabled);
  });

  it('does not restore focus to a trigger removed while the sheet is open', async () => {
    const trigger = documentHarness.createElement('button'); documentHarness.body.appendChild(trigger); trigger.focus();
    await act(async () => root?.render(<BottomSheet open onClose={() => {}} title="Sheet">Content</BottomSheet>));
    documentHarness.body.removeChild(trigger);
    await act(async () => root?.render(<BottomSheet open={false} onClose={() => {}}>Content</BottomSheet>));
    expect(trigger.isConnected).toBe(false); expect(trigger.focusCount).toBe(1); expect(documentHarness.activeElement).not.toBe(trigger);
  });
});

/**
 * Minimal DOM polyfill for React 19 client components under node.
 *
 * React 19's `createRoot` reaches into the browser scheduler and DOM
 * internals: it needs `window`, `document`, an `Element` class to
 * `instanceof`-check, and an `addEventListener` / `dispatchEvent`
 * surface. This module installs a thin shim that satisfies that
 * surface without depending on jsdom or happy-dom (neither is a
 * current runtime dep). It is intentionally a *browser-mock*, not a
 * faithful DOM; tests that need real DOM semantics must use a
 * dedicated jsdom-backed harness.
 *
 * Lifecycle:
 *   const restore = installMinimalBrowser();
 *   // ... run the test
 *   restore();
 */

import type { MockMap } from "./setup-map.test-double";

type EventHandler = (event: unknown) => void;

class FakeElement {
  readonly tagName: string;
  /** React 19's `isValidContainer` checks nodeType === 1 | 9 | 11. */
  readonly nodeType = 1 as const;
  ownerDocument: FakeDocument | null = null;
  parentNode: FakeElement | null = null;
  childNodes: FakeElement[] = [];
  style: Record<string, string> = {};
  className = "";
  inert = false;
  disabled = false;
  get isConnected(): boolean {
    return this.parentNode !== null || this === this.ownerDocument?.documentElement;
  }
  get offsetParent(): FakeElement | null {
    return this.parentNode;
  }
  // React 19's getActiveElementDeep does
  // `element instanceof containerInfo.HTMLIFrameElement`. The fake
  // element exposes a class so the instanceof check resolves to
  // `false` instead of throwing.
  readonly HTMLIFrameElement: typeof HTMLElement = class {} as unknown as
    typeof HTMLElement;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, EventHandler[]>();

  addEventListener!: (type: string, handler: EventHandler) => void;
  removeEventListener!: (type: string, handler: EventHandler) => void;
  dispatchEvent!: (event: { type: string } & Record<string, unknown>) => boolean;
  appendChild!: (child: FakeElement) => FakeElement;
  removeChild!: (child: FakeElement) => FakeElement;
  insertBefore!: (newChild: FakeElement, refChild: FakeElement | null) => FakeElement;
  setAttribute!: (name: string, value: string) => void;
  getAttribute!: (name: string) => string | null;
  hasAttribute!: (name: string) => boolean;
  removeAttribute!: (name: string) => void;

  focus(): void {
    if (this.ownerDocument !== null) this.ownerDocument.activeElement = this;
  }

  contains(target: unknown): boolean {
    return target === this || this.childNodes.some((child) => child.contains(target));
  }

  querySelectorAll<T extends FakeElement = FakeElement>(selector: string): T[] {
    const matches: FakeElement[] = [];
    const visit = (node: FakeElement): void => {
      for (const child of node.childNodes) {
        const tag = child.tagName.toLowerCase();
        const tabbable =
          ((tag === "a" && child.getAttribute("href") !== null) ||
            ["button", "input", "select", "textarea"].includes(tag) ||
            child.getAttribute("tabindex") !== null) &&
          !child.disabled &&
          child.getAttribute("tabindex") !== "-1";
        const classMatch = selector.startsWith(".") && child.className.split(" ").includes(selector.slice(1));
        if (classMatch || (selector.includes("button") && tabbable)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches as T[];
  }

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
    // Bind the standard DOM methods. React 19's `createRoot` and
    // scheduler reach into these without traversing the prototype
    // chain as expected, so every method is an own property bound
    // through closure-captured `this`.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self: FakeElement = this;
    this.addEventListener = function (type, handler) {
      const existing = self.listeners.get(type) ?? [];
      existing.push(handler);
      self.listeners.set(type, existing);
    };
    this.removeEventListener = function (type, handler) {
      const existing = self.listeners.get(type) ?? [];
      const index = existing.indexOf(handler);
      if (index >= 0) existing.splice(index, 1);
      self.listeners.set(type, existing);
    };
    this.dispatchEvent = function (event) {
      const handlers = self.listeners.get(event.type) ?? [];
      for (const handler of handlers) handler(event);
      return true;
    };
    this.appendChild = function (child) {
      child.parentNode = self;
      self.childNodes.push(child);
      child.ownerDocument = self.ownerDocument;
      return child;
    };
    this.removeChild = function (child) {
      const index = self.childNodes.indexOf(child);
      if (index >= 0) self.childNodes.splice(index, 1);
      child.parentNode = null;
      return child;
    };
    this.insertBefore = function (newChild, refChild) {
      newChild.parentNode = self;
      if (refChild !== null) {
        const index = self.childNodes.indexOf(refChild);
        if (index >= 0) self.childNodes.splice(index, 0, newChild);
        else self.childNodes.push(newChild);
      } else {
        self.childNodes.push(newChild);
      }
      newChild.ownerDocument = self.ownerDocument;
      return newChild;
    };
    this.setAttribute = function (name, value) {
      self.attributes.set(name, value);
    };
    this.getAttribute = function (name) {
      return self.attributes.get(name) ?? null;
    };
    this.hasAttribute = function (name) {
      return self.attributes.has(name);
    };
    this.removeAttribute = function (name) {
      self.attributes.delete(name);
    };
  }
}

class FakeDocument {
  readonly body: FakeElement;
  readonly head: FakeElement;
  readonly documentElement: FakeElement;
  nodeType = 9 as const;
  activeElement: FakeElement | null = null;
  private readonly listeners = new Map<string, EventHandler[]>();

  addEventListener!: (type: string, handler: EventHandler) => void;
  removeEventListener!: (type: string, handler: EventHandler) => void;
  dispatchEvent!: (event: { type: string } & Record<string, unknown>) => boolean;

  constructor() {
    const html = new FakeElement("html");
    this.documentElement = html;
    this.body = new FakeElement("body");
    this.head = new FakeElement("head");
    this.body.ownerDocument = this;
    this.head.ownerDocument = this;
    html.ownerDocument = this;
    html.appendChild(this.head);
    html.appendChild(this.body);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self: FakeDocument = this;
    this.addEventListener = function (type, handler) {
      const existing = self.listeners.get(type) ?? [];
      existing.push(handler);
      self.listeners.set(type, existing);
    };
    this.removeEventListener = function (type, handler) {
      const existing = self.listeners.get(type) ?? [];
      const index = existing.indexOf(handler);
      if (index >= 0) existing.splice(index, 1);
      self.listeners.set(type, existing);
    };
    this.dispatchEvent = function (event) {
      const handlers = self.listeners.get(event.type) ?? [];
      for (const handler of handlers) handler(event);
      return true;
    };
  }

  createElement(tagName: string): FakeElement {
    const element = new FakeElement(tagName);
    element.ownerDocument = this;
    return element;
  }

  createTextNode(text: string): FakeElement {
    const node = new FakeElement("#text");
    (node as unknown as { data: string }).data = text;
    (node as unknown as { nodeValue: string }).nodeValue = text;
    return node;
  }

  querySelector<T extends FakeElement = FakeElement>(selector: string): T | null {
    return this.documentElement.querySelectorAll<T>(selector)[0] ?? null;
  }
}

export function installMinimalBrowser(): () => void {
  const previous = {
    document: (globalThis as { document?: unknown }).document,
    window: (globalThis as { window?: unknown }).window,
    Element: (globalThis as { Element?: unknown }).Element,
    HTMLElement: (globalThis as { HTMLElement?: unknown }).HTMLElement,
    Node: (globalThis as { Node?: unknown }).Node,
  };
  const document = new FakeDocument();
  (globalThis as { document: unknown }).document = document;
  (globalThis as { Element: unknown }).Element = FakeElement;
  (globalThis as { HTMLElement: unknown }).HTMLElement = FakeElement;
  (globalThis as { Node: unknown }).Node = FakeElement;
  const windowListeners = new Map<string, EventHandler[]>();
  const fakeWindow = {
    HTMLIFrameElement: class {} as unknown as HTMLElement,
    addEventListener: (type: string, handler: EventHandler): void => {
      windowListeners.set(type, [...(windowListeners.get(type) ?? []), handler]);
    },
    dispatchEvent: (event: { type: string } & Record<string, unknown>): boolean => {
      for (const handler of windowListeners.get(event.type) ?? []) handler(event);
      return true;
    },
    document,
    navigator: { userAgent: "node-test" },
    removeEventListener: (type: string, handler: EventHandler): void => {
      windowListeners.set(type, (windowListeners.get(type) ?? []).filter((item) => item !== handler));
    },
  };
  (globalThis as { window: unknown }).window = fakeWindow;
  return () => {
    if (previous.document === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document: unknown }).document = previous.document;
    }
    if (previous.window === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window: unknown }).window = previous.window;
    }
    if (previous.Element === undefined) {
      delete (globalThis as { Element?: unknown }).Element;
    } else {
      (globalThis as { Element: unknown }).Element = previous.Element;
    }
    if (previous.HTMLElement === undefined) {
      delete (globalThis as { HTMLElement?: unknown }).HTMLElement;
    } else {
      (globalThis as { HTMLElement: unknown }).HTMLElement = previous.HTMLElement;
    }
    if (previous.Node === undefined) {
      delete (globalThis as { Node?: unknown }).Node;
    } else {
      (globalThis as { Node: unknown }).Node = previous.Node;
    }
  };
}

/**
 * Convenience type assertion so a `MapInstance`-typed return can be
 * narrowed to the test double without `as` chains at every call site.
 */
export function asMockMap(value: unknown): MockMap {
  return value as MockMap;
}

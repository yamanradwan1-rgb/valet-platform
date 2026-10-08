type Listener = (event: Event) => void;

class TestClassList {
  private readonly values = new Set<string>();
  add(...names: string[]) { names.forEach((name) => this.values.add(name)); }
  remove(...names: string[]) { names.forEach((name) => this.values.delete(name)); }
  contains(name: string) { return this.values.has(name); }
}

class TestStyle {
  [key: string]: unknown;
  setProperty(name: string, value: string) { this[name] = value; }
  removeProperty(name: string) { delete this[name]; }
}

export class TestNode {
  parentNode: TestNode | null = null;
  childNodes: TestNode[] = [];
  ownerDocument: TestDocument;
  private ownText = '';
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    ownerDocument?: TestDocument,
  ) {
    this.ownerDocument = ownerDocument ?? (this as unknown as TestDocument);
  }

  get firstChild(): TestNode | null { return this.childNodes[0] ?? null; }
  get lastChild(): TestNode | null { return this.childNodes.at(-1) ?? null; }
  get nextSibling(): TestNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }
  get textContent(): string {
    return this.ownText + this.childNodes.map((child) => child.textContent).join('');
  }
  set textContent(value: string | null) {
    this.ownText = value ?? '';
    this.childNodes.forEach((child) => { child.parentNode = null; });
    this.childNodes = [];
  }
  appendChild<T extends TestNode>(child: T): T {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore<T extends TestNode>(child: T, before: TestNode | null): T {
    if (before === null) return this.appendChild(child);
    child.parentNode?.removeChild(child);
    const index = this.childNodes.indexOf(before);
    if (index < 0) throw new Error('insertBefore target is not a child');
    child.parentNode = this;
    this.childNodes.splice(index, 0, child);
    return child;
  }
  removeChild<T extends TestNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  contains(node: TestNode | null): boolean {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }
  addEventListener(type: string, listener: Listener) {
    const bucket = this.listeners.get(type) ?? new Set<Listener>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
}

export class TestElement extends TestNode {
  readonly namespaceURI: string;
  readonly style = new TestStyle();
  readonly classList = new TestClassList();
  private readonly attributes = new Map<string, string>();
  disabled = false;
  value = '';

  constructor(tag: string, ownerDocument: TestDocument, namespace = 'http://www.w3.org/1999/xhtml') {
    super(1, tag.toUpperCase(), ownerDocument);
    this.namespaceURI = namespace;
  }
  get tagName() { return this.nodeName; }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  setAttributeNS(_namespace: string | null, name: string, value: string) { this.setAttribute(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  removeAttributeNS(_namespace: string | null, name: string) { this.removeAttribute(name); }
  get isConnected() { return this.ownerDocument.contains(this); }
  focus() { this.ownerDocument.setActiveElement(this); }
  querySelectorAll<T extends TestElement = TestElement>(selector: string): T[] {
    const matches: TestElement[] = [];
    const stack = [...this.childNodes];
    while (stack.length > 0) {
      const node = stack.shift()!;
      if (node instanceof TestElement) {
        if (selector.includes('button') && node.nodeName === 'BUTTON' &&
            (!selector.includes(':not([disabled])') || !node.disabled)) {
          matches.push(node);
        }
        stack.unshift(...node.childNodes);
      }
    }
    return matches as T[];
  }
  querySelector<T extends TestElement = TestElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }
}

class TestText extends TestNode {
  constructor(value: string, ownerDocument: TestDocument) {
    super(3, '#text', ownerDocument);
    this.textContent = value;
  }
  get nodeValue() { return this.textContent; }
  set nodeValue(value: string | null) { this.textContent = value; }
}

export class TestDocument extends TestNode {
  readonly documentElement: TestElement;
  readonly body: TestElement;
  visibilityState: DocumentVisibilityState = 'visible';
  defaultView: Record<string, unknown> | null = null;
  private focusedElement: TestElement | null = null;

  constructor() {
    super(9, '#document');
    this.ownerDocument = this;
    this.documentElement = new TestElement('html', this);
    this.body = new TestElement('body', this);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }
  createElement(tag: string) { return new TestElement(tag, this); }
  createElementNS(namespace: string, tag: string) { return new TestElement(tag, this, namespace); }
  createTextNode(value: string) { return new TestText(value, this); }
  createComment(value: string) { return new TestText(value, this); }
  get activeElement() { return this.focusedElement ?? this.body; }
  setActiveElement(element: TestElement) { this.focusedElement = element; }
}

function eventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener) {
      const bucket = listeners.get(type) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: Listener) { listeners.get(type)?.delete(listener); },
    dispatchEvent(event: Event) {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  };
}

export function installTestDom() {
  const document = new TestDocument();
  const navigator = { onLine: true };
  const window = {
    ...eventTarget(), document, navigator,
    Node: TestNode, Element: TestElement, HTMLElement: TestElement,
    HTMLIFrameElement: TestElement,
    localStorage: { getItem: () => null, setItem: () => {} },
  } as Record<string, unknown>;
  window.window = window;
  window.self = window;
  document.defaultView = window;
  for (const [name, value] of Object.entries({
    document, window, navigator, Node: TestNode, Element: TestElement,
    HTMLElement: TestElement, HTMLIFrameElement: TestElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  return { document, window, navigator };
}

export function findElement(root: TestNode, tag: string, text: string): TestElement {
  const wanted = tag.toUpperCase();
  const stack = [...root.childNodes];
  while (stack.length > 0) {
    const node = stack.shift()!;
    if (node instanceof TestElement && node.nodeName === wanted && node.textContent.includes(text)) return node;
    stack.unshift(...node.childNodes);
  }
  throw new Error(`Missing ${tag} containing ${text}. Rendered text: ${root.textContent}`);
}

export function invokeReactClick(element: TestElement): void {
  const key = Object.keys(element).find((name) => name.startsWith('__reactProps$'));
  const onClick = key ? (element as unknown as Record<string, { onClick?: () => void }>)[key]?.onClick : undefined;
  if (!onClick) throw new Error(`Element ${element.nodeName} has no React onClick prop.`);
  onClick();
}

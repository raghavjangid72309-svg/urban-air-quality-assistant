/**
 * Tiny DOM builder. All text goes through text nodes, never HTML parsing,
 * so data from the network or the user cannot inject markup.
 */
export type Child = Node | string | number | false | null | undefined;
export type Attributes = Readonly<Record<string, string | number | boolean | undefined>>;

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttributes(node: Element, attributes: Attributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (/^on/i.test(name) || name.toLowerCase() === 'style') {
      throw new Error(`Refusing to set "${name}"; use addEventListener or a CSS class instead.`);
    }
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttributes(node, attributes);
  append(node, children);
  return node;
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  children: readonly Child[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttributes(node, attributes);
  append(node, children);
  return node;
}

/** Looks up a required element and checks its type. */
export function byId<T extends Element>(root: Document, id: string, type: new () => T): T {
  const node = root.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing #${id}`);
  return node;
}

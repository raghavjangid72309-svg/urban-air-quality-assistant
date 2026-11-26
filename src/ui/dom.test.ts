import { describe, expect, it } from 'vitest';
import { append, byId, el, svg } from './dom';

describe('el', () => {
  it('creates elements with attributes and text children', () => {
    const node = el('button', { type: 'button', 'data-id': 7, disabled: true, hidden: false, title: undefined }, ['Go ', 1]);
    expect(node.getAttribute('type')).toBe('button');
    expect(node.dataset.id).toBe('7');
    expect(node.disabled).toBe(true);
    expect(node.hasAttribute('hidden')).toBe(false);
    expect(node.hasAttribute('title')).toBe(false);
    expect(node.textContent).toBe('Go 1');
  });

  it('treats markup in text as plain text', () => {
    const node = el('p', {}, ['<img src=x onerror=alert(1)>']);
    expect(node.querySelector('img')).toBeNull();
    expect(node.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('refuses inline event handlers and styles', () => {
    expect(() => el('div', { onclick: 'alert(1)' })).toThrow(/addEventListener/);
    expect(() => el('div', { style: 'color: red' })).toThrow();
  });

  it('skips empty children', () => {
    const node = el('div');
    append(node, [null, undefined, false, 'x']);
    expect(node.childNodes).toHaveLength(1);
  });
});

describe('svg', () => {
  it('creates namespaced SVG elements', () => {
    const node = svg('rect', { width: 4 });
    expect(node.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(node.getAttribute('width')).toBe('4');
  });
});

describe('byId', () => {
  it('returns typed elements and fails loudly when missing or of the wrong type', () => {
    document.body.replaceChildren(el('form', { id: 'f' }));
    expect(byId(document, 'f', HTMLFormElement)).toBeInstanceOf(HTMLFormElement);
    expect(() => byId(document, 'f', HTMLInputElement)).toThrow('Missing #f');
    expect(() => byId(document, 'nope', HTMLElement)).toThrow('Missing #nope');
  });
});

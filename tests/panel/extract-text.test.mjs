/**
 * Tests for shadow-DOM text extraction helpers.
 *
 * collectShadowText is the critical new surface introduced to make
 * Monica.im and Cline work: both inject their UI via open shadow roots,
 * which are invisible to the standard element.innerText path.
 *
 * We set up minimal DOM globals so that the function can be exercised
 * without a full browser environment.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal DOM stubs – set up before importing the module under test so that
// `instanceof HTMLElement` works inside the module's function bodies.
// ---------------------------------------------------------------------------

class HTMLElement {
  constructor(innerText = '') {
    this._innerText = innerText;
    this.shadowRoot = null;
    this.children = [];
    this._all = [];
  }
  get innerText() {
    return this._innerText;
  }
  querySelectorAll() {
    return this._all;
  }
}

globalThis.HTMLElement = HTMLElement;

function makeShadowRoot(children = []) {
  return {
    children,
    querySelectorAll() {
      // Return the flat list of elements stored in _all on each child,
      // mimicking a real shadow root's querySelectorAll('*').
      const all = [];
      function collect(el) {
        all.push(el);
        for (const c of el._all ?? []) collect(c);
      }
      for (const child of children) collect(child);
      return all;
    },
  };
}

function makeEl(innerText = '', { shadowRoot = null, all = [] } = {}) {
  const el = new HTMLElement(innerText);
  el.shadowRoot = shadowRoot;
  el._all = all;
  return el;
}

// ---------------------------------------------------------------------------
// Dynamic import AFTER globals are in place.
// ---------------------------------------------------------------------------
const { collectShadowText } = await import('../../content/extract-text.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('collectShadowText returns empty string when there are no shadow roots', () => {
  const root = makeEl('regular text');
  assert.equal(collectShadowText(root), '');
});

test('collectShadowText collects text from a single shadow root', () => {
  const shadowChild = makeEl('shadow content');
  const shadowRoot = makeShadowRoot([shadowChild]);
  const host = makeEl('host text', { shadowRoot, all: [] });

  // The root container sees the host element via querySelectorAll
  const root = makeEl('', { all: [host] });

  const result = collectShadowText(root);
  assert.ok(result.includes('shadow content'), `Expected shadow text, got: ${result}`);
});

test('collectShadowText ignores shadow root children with blank innerText', () => {
  const blankChild = makeEl('   ');
  const shadowRoot = makeShadowRoot([blankChild]);
  const host = makeEl('', { shadowRoot });
  const root = makeEl('', { all: [host] });

  assert.equal(collectShadowText(root).trim(), '');
});

test('collectShadowText recurses into nested shadow roots', () => {
  // Outer shadow root contains a nested shadow host
  const innerShadowChild = makeEl('deeply nested text');
  const innerShadowRoot = makeShadowRoot([innerShadowChild]);
  const innerHost = makeEl('', { shadowRoot: innerShadowRoot, all: [] });

  const outerShadowChild = makeEl('outer shadow text', { all: [innerHost] });
  const outerShadowRoot = makeShadowRoot([outerShadowChild]);
  const outerHost = makeEl('', { shadowRoot: outerShadowRoot, all: [] });

  const root = makeEl('', { all: [outerHost] });

  const result = collectShadowText(root);
  assert.ok(result.includes('outer shadow text'), `Missing outer text, got: ${result}`);
  assert.ok(result.includes('deeply nested text'), `Missing nested text, got: ${result}`);
});

test('collectShadowText collects from multiple independent shadow roots', () => {
  const child1 = makeEl('monica text');
  const child2 = makeEl('cline text');
  const sr1 = makeShadowRoot([child1]);
  const sr2 = makeShadowRoot([child2]);
  const host1 = makeEl('', { shadowRoot: sr1 });
  const host2 = makeEl('', { shadowRoot: sr2 });
  const root = makeEl('', { all: [host1, host2] });

  const result = collectShadowText(root);
  assert.ok(result.includes('monica text'), `Missing monica text, got: ${result}`);
  assert.ok(result.includes('cline text'), `Missing cline text, got: ${result}`);
});

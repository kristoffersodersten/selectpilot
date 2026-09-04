// module_name: popup_open_contract_tests
// spec_ref: "frontend_state_contract"
import assert from 'node:assert/strict';
import test from 'node:test';

test('toolbar popup binds the side panel to the active tab before opening it', async () => {
  const calls = [];
  let clickHandler;
  const status = { textContent: '', hidden: true };
  const button = {
    addEventListener: (type, handler) => {
      if (type === 'click') clickHandler = handler;
    },
  };
  globalThis.document = {
    getElementById: (id) => id === 'open-panel' ? button : id === 'popup-status' ? status : null,
  };
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 42, windowId: 7 }] },
    scripting: { executeScript: async ({ target }) => calls.push(`inject:${target.tabId}`) },
    sidePanel: {
      setOptions: async ({ tabId, path, enabled }) => calls.push(`set:${tabId}:${path}:${enabled}`),
      open: async ({ windowId }) => calls.push(`open:${windowId}`),
    },
    windows: { WINDOW_ID_CURRENT: -2 },
  };
  globalThis.window = { close: () => calls.push('close') };

  try {
    await import(`../../popup/popup.js?test=${Date.now()}`);
    assert.equal(typeof clickHandler, 'function');
    await clickHandler();
    assert.deepEqual(calls, [
      'inject:42',
      'set:42:panel/panel.html:true',
      'open:7',
      'close',
    ]);
  } finally {
    delete globalThis.document;
    delete globalThis.chrome;
    delete globalThis.window;
  }
});

test('toolbar popup keeps an actionable error visible when page injection fails', async () => {
  let clickHandler;
  let closed = false;
  const status = { textContent: '', hidden: true };
  const button = {
    addEventListener: (type, handler) => {
      if (type === 'click') clickHandler = handler;
    },
  };
  globalThis.document = {
    getElementById: (id) => id === 'open-panel' ? button : id === 'popup-status' ? status : null,
  };
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 42, windowId: 7 }] },
    scripting: { executeScript: async () => { throw new Error('restricted page'); } },
    sidePanel: { setOptions: async () => {}, open: async () => {} },
  };
  globalThis.window = { close: () => { closed = true; } };
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await import(`../../popup/popup.js?failure-test=${Date.now()}`);
    await clickHandler();
    assert.equal(status.hidden, false);
    assert.equal(status.textContent, 'SelectPilot cannot run on this page. Open a regular webpage and try again.');
    assert.equal(closed, false);
  } finally {
    console.error = originalConsoleError;
    delete globalThis.document;
    delete globalThis.chrome;
    delete globalThis.window;
  }
});

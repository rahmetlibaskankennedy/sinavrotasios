#!/usr/bin/env node
/* Auth callback yönlendirmesi index.html'de tekrar yükleme yapmamalı. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'www', 'auth-common.js'), 'utf8');

function load(pathname) {
  const redirects = [];
  const location = {
    pathname,
    href: `https://example.test${pathname}`,
    replace(target) { redirects.push(target); }
  };
  const document = {
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const context = {
    URL,
    alert() {},
    console: { warn() {} },
    document,
    sessionStorage,
    supabaseClient: {
      auth: {
        onAuthStateChange() {},
        getSession() { return Promise.resolve({ data: { session: null } }); }
      }
    },
    window: { location, NativeUX: null },
    setTimeout,
    clearTimeout
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'auth-common.js' });
  return { redirects, context };
}

for (const pathname of ['/', '/index.html']) {
  const { redirects, context } = load(pathname);
  assert.equal(context.isAppShellPage(), true, `${pathname} uygulama kabuğu sayılmalı.`);
  context.redirectToApp();
  assert.deepEqual(redirects, [], `${pathname} kendi kendine yeniden yönlenmemeli.`);
}

const login = load('/login.html');
assert.equal(login.context.isAppShellPage(), false, 'Giriş sayfası uygulama kabuğu sayılmamalı.');
login.context.redirectToApp();
assert.deepEqual(login.redirects, ['index.html'], 'Giriş sayfası uygulamaya yönlenmeli.');

assert.equal(login.context.passwordRequirementError('ZorParola!2026'), '', 'Güçlü parola kabul edilmeli.');
assert.notEqual(login.context.passwordRequirementError('kisa'), '', 'Zayıf parola reddedilmeli.');

console.log('✓ Auth callback yönlendirme ve parola politikası testleri geçti.');

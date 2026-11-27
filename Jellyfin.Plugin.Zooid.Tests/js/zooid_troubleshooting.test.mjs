// zooid_troubleshooting.test.mjs
// Tests for zooid_troubleshooting.js: that every reset asks first, sends nothing when cancelled, and reports on its
// status line, never in an alert.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript, settle, clickDialogButton, dialogText, statusText } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};
globalThis.setInterval = function () { return 1; };

var BUTTONS = ['btnResetEntireDatabase', 'btnResetContentTable'];

// openPage
// Loads the Troubleshooting controller over a view that holds the elements it uses, and shows the page.
async function openPage(opts) {
    opts = opts || {};
    var page = installPage({ config: { Servers: [] } });
    var children = [page.dom.el('div', { id: 'resetStatus' })].concat(BUTTONS.map(function (id) { return page.dom.el('button', { id: id }); }));
    var view = page.dom.el('div', {}, children);
    page.dom.document.documentElement.appendChild(view);
    if (opts.answer) globalThis.ApiClient.fetch = function (options) { page.requests.push(options); return opts.answer(options); };
    var mod = await loadScript('zooid_troubleshooting.js');
    mod.default(view);
    view.dispatch('viewshow');
    await settle();
    return { page: page, view: view };
}

// posts
// Lists the POST and DELETE requests the page made.
function posts(opened) {
    return opened.page.requests.filter(function (r) { return r.type === 'POST' || r.type === 'DELETE'; });
}

test('resetting the whole database asks first and sends nothing when the question is cancelled', async function () {
    var opened = await openPage();
    opened.view.querySelector('#btnResetEntireDatabase').click();
    await settle(20);
    var dialog = dialogText(opened.page.dom);
    assert.equal(dialog.title, 'Reset the sync database');
    assert.match(dialog.body, /every sync type/);
    assert.match(dialog.body, /It cannot be undone\./);
    assert.equal(clickDialogButton(opened.page.dom, 'Cancel'), true);
    await settle(20);
    assert.equal(posts(opened).length, 0);
    assert.equal(statusText(opened.view.querySelector('#resetStatus')), '');
});

test('resetting the whole database posts the reset and reports it on the reset status', async function () {
    var opened = await openPage();
    opened.view.querySelector('#btnResetEntireDatabase').click();
    await settle(20);
    assert.equal(clickDialogButton(opened.page.dom, 'Reset'), true);
    await settle(20);
    assert.equal(posts(opened)[0].url, 'Sync/Reset/All');
    var status = opened.view.querySelector('#resetStatus');
    assert.equal(statusText(status), 'Database reset.');
    assert.ok(status.classList.contains('stolon-status-ok'));
});

test('resetting one table names it in the title and in the result', async function () {
    var opened = await openPage();
    opened.view.querySelector('#btnResetContentTable').click();
    await settle(20);
    assert.equal(dialogText(opened.page.dom).title, 'Reset the content sync table');
    assert.match(dialogText(opened.page.dom).body, /next scan starts over/);
    clickDialogButton(opened.page.dom, 'Reset');
    await settle(20);
    assert.equal(posts(opened)[0].url, 'Sync/Reset/Content');
    assert.equal(statusText(opened.view.querySelector('#resetStatus')), 'Content sync table reset.');
});

test('a reset that fails shows an error on the reset status', async function () {
    var opened = await openPage();
    opened.view.querySelector('#btnResetEntireDatabase').click();
    await settle(20);
    globalThis.ApiClient.fetch = function () { return Promise.reject(new Error('refused')); };
    clickDialogButton(opened.page.dom, 'Reset');
    await settle(20);
    var status = opened.view.querySelector('#resetStatus');
    assert.equal(statusText(status), 'Could not reset the database.');
    assert.ok(status.classList.contains('stolon-status-bad'));
});

test('a table tile keeps the accent while the table has rows and goes gray while it is empty', async function () {
    var page = installPage({ config: { Servers: [] } });
    var dom = page.dom;
    function row(id) {
        var tile = dom.el('span', { class: 'stolon-collapsible-tile' });
        var title = dom.el('div', {});
        var info = dom.el('div', { class: 'stolon-reset-info' }, [title]);
        return { tile: tile, title: title, element: dom.el('div', { class: 'stolon-reset-row' }, [tile, info, dom.el('button', { id: id })]) };
    }
    var content = row('btnResetContentTable'), history = row('btnResetHistoryTable');
    var view = dom.el('div', {}, [dom.el('div', { id: 'resetStatus' }), content.element, history.element, dom.el('button', { id: 'btnResetEntireDatabase' })]);
    dom.document.documentElement.appendChild(view);
    globalThis.ApiClient.fetch = function (options) {
        page.requests.push(options);
        return Promise.resolve(/Tables$/.test(options.url) ? { Content: 12, History: 0 } : {});
    };
    var mod = await loadScript('zooid_troubleshooting.js');
    mod.default(view);
    view.dispatch('viewshow');
    await settle(20);

    assert.ok(!content.tile.classList.contains('stolon-gray'));
    assert.ok(history.tile.classList.contains('stolon-gray'));
    var badge = content.title.querySelector('.zooid-table-count');
    assert.ok(badge, 'a table with rows shows its count');
    assert.equal(badge.textContent, '12 records');
    assert.equal(history.title.querySelector('.zooid-table-count'), null, 'an empty table shows no badge');
});

// A detail panel in the page markup is a Stolon sidecar: the header holds the title and Stolon's close button, the body
// scrolls, and the shelf holds the buttons, a destructive one first. A page never writes a dialog, which is only for the
// alerts and confirmations confirmDialog draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

var web = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'Jellyfin.Plugin.Zooid', 'Web');
var pages = readdirSync(web).filter((n) => n.endsWith('.html')).map((n) => ({ name: n, html: readFileSync(join(web, n), 'utf8') }));

test('no page writes a dialog in its markup', () => {
    var found = pages.filter((p) => /class="stolon-dialog(?! stolon-sidecar)[\s"]/.test(p.html) || /stolon-modal-(body|button-row|title)/.test(p.html)).map((p) => p.name);
    assert.deepEqual(found, []);
});

test('every sidecar has its header, body, and shelf, with Stolon close buttons', () => {
    var found = [];
    for (var page of pages) {
        for (var match of page.html.matchAll(/<div id="(\w+)" class="stolon-dialog stolon-sidecar stolon-hidden">/g)) {
            var rest = page.html.slice(match.index, match.index + 12000);
            var head = rest.match(/<div class="stolon-sidecar-head">([\s\S]*?)<div[^>]*class="stolon-sidecar-body"/);
            if (!/class="stolon-dialog-content stolon-sidecar-panel/.test(rest)) found.push(match[1] + ': panel');
            if (!head) { found.push(match[1] + ': head'); continue; }
            if (!/class="stolon-sidecar-title"/.test(head[1])) found.push(match[1] + ': title');
            if (!/class="stolon-row-btn stolon-dialog-close"[^>]*><span class="material-icons" aria-hidden="true">close<\/span>/.test(head[1])) found.push(match[1] + ': close');
            if (!/class="stolon-sidecar-shelf"/.test(rest)) found.push(match[1] + ': shelf');
        }
    }
    assert.deepEqual(found, []);
});

test('a destructive shelf button comes first', () => {
    var found = [];
    for (var page of pages) {
        for (var shelf of page.html.matchAll(/<div class="stolon-sidecar-shelf">([\s\S]*?)<\/div>/g)) {
            var buttons = [...shelf[1].matchAll(/<button[^>]*class="([^"]*)"/g)].map((b) => b[1]);
            var first = buttons.findIndex((c) => /stolon-destructive/.test(c));
            if (first > 0) found.push(page.name + ': ' + buttons.length + ' buttons, destructive at ' + first);
        }
    }
    assert.deepEqual(found, []);
});

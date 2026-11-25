// A dialog's corner close button is Stolon's: stolon-row-btn with the close icon. With stolon-dialog-close alone, the
// browser draws its own light button with a text cross.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

var web = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'Jellyfin.Plugin.Zooid', 'Web');

test('dialog close buttons use Stolon markup', () => {
    var found = [];
    for (var name of readdirSync(web).filter((n) => n.endsWith('.html'))) {
        var html = readFileSync(join(web, name), 'utf8');
        for (var match of html.matchAll(/<button[^>]*stolon-dialog-close[^>]*>[\s\S]*?<\/button>/g)) {
            if (!/class="stolon-row-btn stolon-dialog-close"/.test(match[0]) || !/material-icons[^>]*>close</.test(match[0])) {
                found.push(name + ': ' + match[0].slice(0, 80));
            }
        }
    }
    assert.deepEqual(found, []);
});

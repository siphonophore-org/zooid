// A tone class on its own (stolon-info, stolon-warn and the rest) only tints a Stolon component such as a toast or
// status text. A block of text that stands alone is a callout and needs stolon-callout-<tone>, or it renders as
// plain text with no box and no spacing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

var web = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'Jellyfin.Plugin.Zooid', 'Web');
var bare = /class(?:Name)?\s*=\s*["']stolon-(?:info|warn|warning|success|error|neutral)(?=[\s"'])|['"](?:[a-z-]+ )?stolon-(?:info|warn|success|error|neutral)['"]\s*[:)]/g;

test('standalone notes use stolon-callout classes', () => {
    var found = [];
    for (var name of readdirSync(web).filter((n) => /\.(html|js)$/.test(n))) {
        readFileSync(join(web, name), 'utf8').split('\n').forEach((line, i) => {
            if (bare.test(line)) {
                found.push(`${name}:${i + 1}`);
            }
            bare.lastIndex = 0;
        });
    }
    assert.deepEqual(found, []);
});

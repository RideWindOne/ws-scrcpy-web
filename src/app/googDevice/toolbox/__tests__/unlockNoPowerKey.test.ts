// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve('src', 'app', 'googDevice', 'toolbox', 'UnlockDialog.ts'), 'utf8');

// Auto-unlock has to look, not press. KEYCODE_POWER on a lit panel turns it
// OFF (reported as "waking the screen darkens it first"), and KEYCODE_WAKEUP
// cannot leave always-on display, so both key routes only ever made things
// worse. Whether a swipe can land is decided by `mWakefulness` — the device can
// be awake and touchable while the stream still looks black.
describe('the unlock dialog only reads the awake state', () => {
    it('sends no power key', () => {
        expect(source).not.toMatch(/KEYCODE_POWER/);
    });

    it('sends no wake key either', () => {
        expect(source).not.toMatch(/sleep-wake/);
        expect(source).not.toMatch(/action: 'wake'/);
    });

    it('decides on mWakefulness via the read-only state route', () => {
        expect(source).toMatch(/screen-state\?udid=/);
        // `awake` false is the only reason to stop.
        expect(source).toMatch(/if \(awake === false\) throw new Error\(t\('unlock_screen_asleep'\)\);|if \(awake === false\)/);
    });

    it('recognises only the MIUI doze window, never the names a normal lock screen also has', () => {
        const hints = /const AOD_WINDOW_NAME = (.+);/.exec(source)?.[1] ?? '';
        expect(hints).toBe("'com.miui.aod'");
    });
});

// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve('src', 'app', 'googDevice', 'toolbox', 'UnlockDialog.ts'), 'utf8');

// Auto-unlock used to press KEYCODE_POWER to leave always-on display. On a
// panel that was already lit that key turns the screen OFF, which showed up as
// "waking the screen darkens it first" and then a swipe at a black frame. The
// flow now only ever wakes (KEYCODE_WAKEUP, via action 'wake'), and reports
// doze instead of forcing its way out of it.
describe('the unlock dialog never toggles the panel off', () => {
    it('does not send the power key', () => {
        expect(source).not.toMatch(/KEYCODE_POWER/);
    });

    it('wakes through the wake-only route, after asking the device first', () => {
        expect(source).toMatch(/action: 'wake'/);
        // The state is read before any key is pressed.
        expect(source).toMatch(/screen-state\?udid=/);
        expect(source).toMatch(/if \(\(await this\.screenAwake\(\)\) === true\) return true;/);
    });

    it('recognises only the MIUI doze window, never the names a normal lock screen also has', () => {
        const hints = /const AOD_WINDOW_NAME = (.+);/.exec(source)?.[1] ?? '';
        expect(hints).toBe("'com.miui.aod'");
    });
});

// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve('src', 'app', 'googDevice', 'toolbox', 'UnlockDialog.ts'), 'utf8');

// Two hard-won rules:
// - No keys. KEYCODE_POWER on a lit panel turns it OFF (reported as "waking the
//   screen darkens it first"), and KEYCODE_WAKEUP cannot leave always-on
//   display, so both key routes only made things worse.
// - No state gate. The phone's own panel can be dark while the web picture is
//   visible and the touch channel is live — the user unlocked it in exactly that
//   state — so neither a "not awake" reading nor an always-on-display window may
//   abort the flow. Only the dump after the swipe decides.
describe('the unlock dialog swipes without pressing keys or gating on state', () => {
    it('sends no power and no wake key', () => {
        expect(source).not.toMatch(/KEYCODE_POWER/);
        expect(source).not.toMatch(/sleep-wake/);
        expect(source).not.toMatch(/action: 'wake'/);
    });

    it('never aborts because of a screen-state or doze reading', () => {
        expect(source).not.toMatch(/unlock_screen_asleep/);
        expect(source).not.toMatch(/unlock_doze_hint/);
        expect(source).not.toMatch(/AOD_WINDOW_NAME/);
        expect(source).not.toMatch(/dozeShowing/);
    });

    it('taps the screen before every swipe, because a freshly connected device falls asleep', () => {
        // The first frame needs ~2 s; the phone sleeps in that gap and comes
        // back on a touch, not on a key.
        const wakeStarts = source.indexOf('private async wakeAndSwipeUp');
        const body = source.slice(wakeStarts, wakeStarts + 900);
        expect(body.indexOf('await this.tapScreen();')).toBeGreaterThan(-1);
        expect(body.indexOf('await this.tapScreen();')).toBeLessThan(body.indexOf('await this.swipeUpViaAdb();'));
    });
});

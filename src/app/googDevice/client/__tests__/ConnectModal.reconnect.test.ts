// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParamsStreamScrcpy } from '../../../../types/ParamsStreamScrcpy';
import { setLanguage } from '../../../client/i18n';
import type { BasePlayer } from '../../../player/BasePlayer';
import type VideoSettings from '../../../VideoSettings';
import { isDroppedConnection } from '../ConnectModal';

type FakeInstance = {
    onErrorReceived?: ((err: Error) => void) | undefined;
    stopStream: () => void;
};

const started: FakeInstance[] = [];

vi.mock('../StreamClientScrcpy', () => ({
    StreamClientScrcpy: {
        start: vi.fn(() => {
            const instance: FakeInstance = {
                onErrorReceived: undefined,
                stopStream: vi.fn(),
            };
            started.push(instance);
            return { instance, stop: () => instance.stopStream() };
        }),
    },
}));

const params = { udid: 'abc123', hostname: '', port: 0, secure: false, pathname: '' } as ParamsStreamScrcpy;
const videoSettings = {
    bounds: null,
    bitrate: 0,
    maxFps: 0,
    iFrameInterval: 0,
    codecOptions: '',
    displayId: 0,
} as unknown as VideoSettings;
const player = {} as BasePlayer;

async function open(): Promise<void> {
    const { ConnectModal } = await import('../ConnectModal');
    new ConnectModal(params, player, true, videoSettings, 'Redmi', 'phone');
    await Promise.resolve();
}

const drop = () => new Error('WebSocket closed with code 1006');
const modal = () => document.querySelector<HTMLElement>('dialog.connect-modal');
const errorEl = () => modal()?.querySelector<HTMLElement>('.connect-modal-error');
const statusEl = () => modal()?.querySelector<HTMLElement>('.connect-modal-reconnect');

describe('ConnectModal when the pipe drops (close code 1006)', () => {
    let closeSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setLanguage('zh');
        HTMLDialogElement.prototype.showModal = vi.fn();
        closeSpy = vi.fn();
        HTMLDialogElement.prototype.close = closeSpy as unknown as () => void;
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.useFakeTimers();
        started.length = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.querySelectorAll('dialog').forEach((d) => d.remove());
    });

    it('only treats 1006 as a dropped pipe, not every close code', () => {
        expect(isDroppedConnection(drop())).toBe(true);
        expect(isDroppedConnection(new Error('session failed: no such device'))).toBe(false);
        expect(isDroppedConnection(new Error('WebSocket closed with code 4005'))).toBe(false);
    });

    it('reconnects once before saying anything, instead of showing a failure over the last frame', async () => {
        await open();
        expect(started.length).toBe(1);

        started[0]!.onErrorReceived!(drop());

        // A quiet status chip, no red overlay yet.
        expect(statusEl()?.textContent).toBe('连接中断，正在重连…');
        expect(errorEl()).toBeNull();
        expect(closeSpy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(3000);
        expect(started.length, 'a second stream was started').toBe(2);
        // The dead stream was stopped so the container is free for the new one.
        expect(started[0]!.stopStream).toHaveBeenCalled();
    });

    it('reports the second drop with a retry button that starts the stream again', async () => {
        await open();
        started[0]!.onErrorReceived!(drop());
        vi.advanceTimersByTime(3000);

        started[1]!.onErrorReceived!(drop());

        const error = errorEl();
        expect(error?.textContent).toContain('stream failed: WebSocket closed with code 1006');
        const retry = error?.querySelector<HTMLButtonElement>('.connect-modal-retry');
        expect(retry?.textContent).toBe('重试');
        // A retryable failure waits for the user: nothing closes by itself.
        vi.advanceTimersByTime(20000);
        expect(closeSpy).not.toHaveBeenCalled();

        retry?.click();
        expect(started.length).toBe(3);
        expect(errorEl()).toBeNull();
    });

    it('keeps the old report-and-close behaviour for a real session failure', async () => {
        await open();
        started[0]!.onErrorReceived!(new Error('session failed: device went away'));

        expect(errorEl()?.textContent).toBe('stream failed: session failed: device went away');
        expect(statusEl()).toBeNull();
        vi.advanceTimersByTime(4000);
        expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('always has a close button that survives the reconnect teardown', async () => {
        // On phones the title bar is hidden, so the toolbox was the only exit —
        // and a reconnect stops the stream, taking the toolbox with it. The
        // button must live on the dialog, not inside the stream body.
        await open();
        const button = modal()?.querySelector<HTMLButtonElement>('.connect-modal-close');
        expect(button).not.toBeNull();
        expect(button?.textContent).toBe('×');

        started[0]!.onErrorReceived!(drop());
        vi.advanceTimersByTime(3000);
        // Still there after the stop/open cycle, and after a second failure.
        expect(modal()?.querySelector('.connect-modal-close')).not.toBeNull();
        started[1]!.onErrorReceived!(drop());
        expect(modal()?.querySelector('.connect-modal-close')).not.toBeNull();

        button?.click();
        expect(closeSpy).toHaveBeenCalled();
    });
});

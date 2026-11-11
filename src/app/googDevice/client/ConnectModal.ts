import type { ParamsStreamScrcpy } from '../../../types/ParamsStreamScrcpy';
import type { BasePlayer } from '../../player/BasePlayer';
import { t } from '../../client/i18n';
import { startStream } from '../../public/startStream';
import type { StartStreamOptions, StreamHandle } from '../../public/types';
import { Modal } from '../../ui/Modal';
import type VideoSettings from '../../VideoSettings';

/**
 * A dropped pipe, as opposed to a failed session.
 *
 * Close code 1006 means the connection went away without a close frame, which
 * is what a proxy/NAT idle timeout, a Wi-Fi hand-off or a phone-side restart
 * looks like from this end. The device is usually fine and the same request
 * works again immediately, so it is worth one silent reconnect before telling
 * the user anything — a red "stream failed" over the last frame for a blip the
 * stream recovered from was the actual complaint.
 */
export function isDroppedConnection(err: Error): boolean {
    return /code 1006\b/.test(err.message);
}

export class ConnectModal extends Modal {
    private handle?: StreamHandle | undefined;
    private readonly params: ParamsStreamScrcpy;
    private readonly fitToScreen: boolean;
    private readonly videoSettings: VideoSettings;
    private readonly deviceKind?: 'phone' | 'tablet' | 'tv' | undefined;
    /** Set while this class is restarting the stream by itself. */
    private reconnecting = false;
    /** One silent reconnect for a dropped pipe; the second drop is reported. */
    private retriedOnce = false;
    private reconnectTimer?: number | undefined;
    private statusEl?: HTMLElement | undefined;

    constructor(
        params: ParamsStreamScrcpy,
        _player: BasePlayer,
        fitToScreen: boolean,
        videoSettings: VideoSettings,
        deviceLabel: string,
        deviceKind?: 'phone' | 'tablet' | 'tv',
    ) {
        super({ title: deviceLabel });
        this.dialog.classList.add('connect-modal');
        this.params = params;
        this.fitToScreen = fitToScreen;
        this.videoSettings = videoSettings;
        this.deviceKind = deviceKind;
        this.openStream();
    }

    /**
     * Hide the window before tearing the stream down.
     *
     * `onBeforeClose` stops the stream first (it has to: the container refuses a
     * second stream until the first is released), and that stop can take a
     * moment when the pipe is already stalled — long enough to see the toolbox
     * vanish and a black rectangle sit there before the dialog disappears. Going
     * invisible up front makes the teardown cost invisible.
     */
    public override close(result?: unknown): void {
        this.dialog.classList.add('is-closing');
        super.close(result);
    }

    private openStream(): void {
        const { params, videoSettings } = this;
        const bounds = videoSettings.bounds;
        const maxDim = bounds ? Math.max(bounds.width, bounds.height) : 0;
        const maxSize = maxDim > 0 ? maxDim : undefined;
        const codec = normalizeCodec(params.videoCodec);

        this.handle = startStream(this.bodyEl, params.udid, {
            host: params.hostname || undefined,
            port: params.port || undefined,
            secure: params.secure || undefined,
            pathname: params.pathname || undefined,
            codec,
            encoder: params.encoderName,
            bitrate: videoSettings.bitrate || undefined,
            maxFps: videoSettings.maxFps || undefined,
            maxSize,
            // The dialog's advanced settings: dropping these let the viewport
            // override the dialog's max size and pinned the i-frame interval at 2.
            fitToScreen: this.fitToScreen,
            iFrameInterval: videoSettings.iFrameInterval || undefined,
            codecOptions: videoSettings.codecOptions || undefined,
            displayId: videoSettings.displayId || undefined,
            audio: params.audioEnabled,
            audioSource: params.audioSource,
            audioCodec: params.audioCodec as 'opus' | 'aac' | 'flac' | 'raw' | undefined,
            keyboard: true,
            deviceKind: this.deviceKind,
            turnScreenOff: params.turnScreenOff,
            lockOnDisconnect: params.lockOnDisconnect,
            stayAwake: params.stayAwake,
            wakeLock: params.wakeLock,
            onConnect: () => this.clearStatus(),
            onDisconnect: () => {
                // Our own stop() during a restart runs this callback; closing
                // here would tear the dialog down mid-reconnect.
                if (this.reconnecting) return;
                this.close();
            },
            onError: (err) => this.onStreamError(err),
        });
    }

    private onStreamError(err: Error): void {
        console.error('[ConnectModal]', err);
        if (isDroppedConnection(err) && !this.retriedOnce) {
            this.retriedOnce = true;
            this.showStatus(t('stream_reconnecting'), true);
            this.reconnectTimer = window.setTimeout(() => this.restart(), RECONNECT_DELAY_MS);
            return;
        }
        // A dropped pipe that survived the silent retry stays retryable by
        // hand; anything else keeps the old report-then-close behaviour.
        this.showFailure(err, isDroppedConnection(err));
    }

    /**
     * Stop the dead stream (which frees the container's active-stream attribute
     * `startStream` refuses to double-book) and open a fresh one. The stop is
     * flagged so its disconnect callback does not close the dialog.
     */
    private restart(): void {
        this.clearStatus();
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.reconnecting = true;
        this.handle?.stop();
        this.handle = undefined;
        this.reconnecting = false;
        this.showStatus(t('stream_reconnecting'), true);
        this.openStream();
    }

    /**
     * A status chip over the picture. `cancellable` adds the exit that the
     * toolbox used to be: the restart below calls `stop()`, which takes the
     * toolbox (and with it every close control) away until a new stream has
     * connected — so without this a waiting reconnect can only be waited out.
     */
    private showStatus(text: string, cancellable = false): void {
        let el = this.statusEl;
        if (!el) {
            el = document.createElement('div');
            el.className = 'connect-modal-reconnect';
            this.bodyEl.appendChild(el);
            this.statusEl = el;
        }
        el.textContent = text;
        if (cancellable) {
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'connect-modal-cancel';
            cancel.textContent = t('stream_cancel');
            cancel.addEventListener('click', () => this.close());
            el.appendChild(cancel);
        }
    }

    private clearStatus(): void {
        this.statusEl?.remove();
        this.statusEl = undefined;
    }

    /**
     * Overlay the reason instead of wiping the body: clearing it threw away the
     * toolbox, which is the only remaining way to close the stream, and left a
     * dead black box behind. The overlay sits over the picture and leaves the
     * toolbox above it (see modal.css).
     */
    private showFailure(err: Error, retryable: boolean): void {
        this.clearStatus();
        let el = this.bodyEl.querySelector<HTMLElement>('.connect-modal-error');
        if (!el) {
            el = document.createElement('div');
            el.className = 'connect-modal-error';
            this.bodyEl.appendChild(el);
        }
        el.textContent = `stream failed: ${err.message}`;
        const closeButton = (): HTMLButtonElement => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'connect-modal-dismiss';
            button.textContent = t('stream_close');
            button.addEventListener('click', () => this.close());
            return button;
        };
        if (retryable) {
            // The toolbar crops the overlay's text (it is drawn under the icon
            // column), and a tap on it is the obvious next move instead of
            // hunting for a way back in.
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'connect-modal-retry';
            button.textContent = t('stream_retry');
            button.addEventListener('click', () => {
                el.remove();
                this.dialog.classList.remove('stream-error');
                this.retriedOnce = false;
                this.restart();
            });
            el.appendChild(button);
        }
        // Always offered: on phones the title bar is hidden and the toolbox went
        // away with the stream, so this is the only way out of a dead window.
        el.appendChild(closeButton());
        this.dialog.classList.add('stream-error');
        // Close after 4s (long enough to read, short enough not to feel stuck)
        // only when there is nothing to retry; a retryable failure waits for the
        // user instead of vanishing under their finger.
        if (!retryable) {
            this.closeAfter(4000);
        }
    }

    protected buildBody(_container: HTMLElement): void {
        // Empty — startStream populates the container after super() completes
    }

    protected override onEscapeKey(_event: Event): void {
        // Block — UHID keyboard capture needs Escape
    }

    protected override onBackdropClick(_event: MouseEvent): void {
        // Block — protect stream from accidental close
    }

    protected override onBeforeClose(): void {
        this.reconnecting = true;
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.handle?.stop();
        this.handle = undefined;
    }
}

const RECONNECT_DELAY_MS = 3000;

function normalizeCodec(codec: string | undefined): StartStreamOptions['codec'] {
    if (codec === 'h264' || codec === 'h265' || codec === 'av1' || codec === 'vp8' || codec === 'vp9') return codec;
    return undefined;
}

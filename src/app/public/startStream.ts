import { ACTION } from '../../common/Action';
import type { ParamsStreamScrcpy } from '../../types/ParamsStreamScrcpy';
import { StreamClientScrcpy } from '../googDevice/client/StreamClientScrcpy';
import Size from '../Size';
import VideoSettings from '../VideoSettings';
import type { StartStreamOptions, StreamHandle, StreamInfo } from './types';

/**
 * Public facade over StreamClientScrcpy for programmatic stream control.
 *
 * Usage:
 *   const handle = startStream(containerEl, 'device-serial', { codec: 'h265' });
 *   handle.stop();
 */

const ACTIVE_STREAM_ATTR = 'data-ws-scrcpy-active';

// Optional async hooks that Task 3 will add to StreamClientScrcpy. We assign
// them here defensively so the API contract is future-proof; they are no-ops
// on the current StreamClientScrcpy instance until Task 3 wires them in.
interface StreamClientInstanceHooks {
    onMetadataReceived?: (info: StreamInfo) => void;
    onErrorReceived?: (err: Error) => void;
}

export function startStream(container: HTMLElement, deviceId: string, options: StartStreamOptions = {}): StreamHandle {
    if (!deviceId || typeof deviceId !== 'string') {
        throw new Error('startStream: deviceId is required');
    }
    if (container.hasAttribute(ACTIVE_STREAM_ATTR)) {
        throw new Error('startStream: container already has an active stream; call stop() first');
    }
    container.setAttribute(ACTIVE_STREAM_ATTR, '1');

    let isConnected = false;
    let stopFn: (() => void) | undefined;
    let wakeLockSentinel: { release: () => void } | null = null;

    // The browser drops a screen wake lock whenever the page is hidden (app
    // switch, screen off), so it has to be requested again on return — without
    // that the phone falls asleep a few seconds after coming back from another
    // app, which reads as "it does not stay awake".
    const releaseWakeLock = (): void => {
        try {
            wakeLockSentinel?.release();
        } catch {
            // already released
        }
        wakeLockSentinel = null;
    };
    const acquireWakeLock = (): void => {
        if (!options.wakeLock || !('wakeLock' in navigator) || !isConnected) {
            return;
        }
        if (wakeLockSentinel || document.visibilityState !== 'visible') {
            return;
        }
        navigator.wakeLock
            .request('screen')
            .then((sentinel) => {
                wakeLockSentinel = sentinel;
                // Released by the system on hide: forget it so the next
                // visibilitychange can request a fresh one.
                (sentinel as unknown as { addEventListener?: (t: string, h: () => void) => void }).addEventListener?.(
                    'release',
                    () => {
                        wakeLockSentinel = null;
                    },
                );
            })
            .catch((err) => {
                console.warn('[startStream] Failed to request wake lock:', err);
            });
    };
    const onVisibilityChange = (): void => {
        if (document.visibilityState === 'visible') {
            acquireWakeLock();
        }
    };

    // Some Android browsers reject or silently drop the Screen Wake Lock, and the
    // display then sleeps as soon as nobody touches it. Keeping a 1px muted video
    // playing marks the page as "playing media", so the system's own
    // video-player rule keeps the screen on as well.
    let playbackGuard: { destroy: () => void } | null = null;
    let wakeLockKeeper: number | undefined;
    const startPlaybackGuard = (): void => {
        if (playbackGuard || !options.wakeLock) {
            return;
        }
        if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext('2d');
        const video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('aria-hidden', 'true');
        video.style.cssText =
            'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;';
        const stream = canvas.captureStream(4);
        // Frames must actually change or the browser treats playback as stalled.
        const painter = window.setInterval(() => {
            if (!ctx) {
                return;
            }
            ctx.fillStyle = ctx.fillStyle === '#000' ? '#111' : '#000';
            ctx.fillRect(0, 0, 2, 2);
        }, 250);
        video.srcObject = stream;
        document.body.appendChild(video);
        void video.play().catch(() => {
            // Autoplay policy declined it; the wake lock below still applies.
        });
        playbackGuard = {
            destroy: () => {
                window.clearInterval(painter);
                for (const track of stream.getTracks()) {
                    track.stop();
                }
                video.srcObject = null;
                video.remove();
            },
        };
    };
    const stopPlaybackGuard = (): void => {
        playbackGuard?.destroy();
        playbackGuard = null;
    };

    const codecMap: Record<NonNullable<StartStreamOptions['codec']>, string> = {
        h264: 'h264',
        h265: 'h265',
        av1: 'av1',
        vp8: 'vp8',
        vp9: 'vp9',
    };
    const videoCodec = options.codec ? codecMap[options.codec] : undefined;

    // Fit to screen off needs a max size to mean anything. Without one, scrcpy
    // would stream at native size (3840x2160 on a 4K TV), which no caller asks
    // for on purpose: the config dialog saves fit off with blank max width and
    // height, and the card's connect link reads fit off for any device with no
    // saved settings. Both were sized to the viewport before #981, so keep that.
    const fitToScreen = (options.fitToScreen ?? true) || !options.maxSize;

    // Build the params object. The video knobs (bitrate, maxFps, maxSize,
    // iFrameInterval, codecOptions, displayId) do NOT belong on
    // ParamsStreamScrcpy — they live on VideoSettings, which StreamClientScrcpy
    // reads via player.getVideoSettings() when assembling the stream URL
    // (see buildStreamUrl). So we pass them via the 4th arg of
    // StreamClientScrcpy.start() rather than sneaking them onto params.
    const params: ParamsStreamScrcpy = {
        action: ACTION.STREAM_SCRCPY,
        udid: deviceId,
        player: 'webcodecs',
        hostname: options.host ?? '',
        port: options.port ?? 0,
        secure: options.secure ?? false,
        pathname: options.pathname ?? '',
        fitToScreen,
        ...(videoCodec !== undefined ? { videoCodec } : {}),
        ...(options.encoder !== undefined ? { encoderName: options.encoder } : {}),
        ...(typeof options.audio === 'boolean' ? { audioEnabled: options.audio } : {}),
        ...(options.audioSource !== undefined ? { audioSource: options.audioSource } : {}),
        ...(options.audioCodec !== undefined ? { audioCodec: options.audioCodec } : {}),
        ...(typeof options.turnScreenOff === 'boolean' ? { turnScreenOff: options.turnScreenOff } : {}),
        ...(typeof options.lockOnDisconnect === 'boolean' ? { lockOnDisconnect: options.lockOnDisconnect } : {}),
        ...(typeof options.stayAwake === 'boolean' ? { stayAwake: options.stayAwake } : {}),
    };

    // Only build a VideoSettings when the caller actually provided one of the
    // relevant knobs; otherwise pass undefined and let StreamClientScrcpy fall
    // back to the player's default (WebCodecsPlayer.preferredVideoSettings).
    let videoSettings: VideoSettings | undefined;
    if (
        options.bitrate !== undefined ||
        options.maxFps !== undefined ||
        options.maxSize !== undefined ||
        options.iFrameInterval !== undefined ||
        options.codecOptions !== undefined ||
        options.displayId !== undefined
    ) {
        videoSettings = new VideoSettings({
            bitrate: options.bitrate ?? 8000000,
            maxFps: options.maxFps ?? 15,
            iFrameInterval: options.iFrameInterval ?? 2,
            bounds: options.maxSize !== undefined ? new Size(options.maxSize, options.maxSize) : new Size(0, 0),
            sendFrameMeta: false,
            lockedVideoOrientation: -1,
            displayId: options.displayId,
            codecOptions: options.codecOptions,
        });
    }

    try {
        const { instance, stop } = StreamClientScrcpy.start(
            params,
            undefined,
            fitToScreen,
            videoSettings,
            container,
            () => {
                isConnected = false;
                // Release wake lock
                releaseWakeLock();
                window.clearInterval(wakeLockKeeper);
                stopPlaybackGuard();
                document.removeEventListener('visibilitychange', onVisibilityChange);
                options.onDisconnect?.();
            },
            options.deviceKind,
        );
        stopFn = () => {
            stop();
            container.removeAttribute(ACTIVE_STREAM_ATTR);
        };
        // Task 3 will make these hooks functional on StreamClientScrcpy.
        // Until then, these assignments silently create inert properties on
        // the instance — no runtime error.
        const hooked = instance as unknown as StreamClientInstanceHooks;
        hooked.onMetadataReceived = (info: StreamInfo) => {
            isConnected = true;
            // Keep the display awake while the stream runs, and re-arm it every
            // time the page becomes visible again.
            document.addEventListener('visibilitychange', onVisibilityChange);
            acquireWakeLock();
            startPlaybackGuard();
            // The lock is dropped by the system for reasons the page never hears
            // about (power saver kicking in, the browser reclaiming it), so try
            // again periodically instead of only on connect / visibility.
            wakeLockKeeper = window.setInterval(() => {
                acquireWakeLock();
            }, 15000);
            options.onConnect?.(info);
        };
        hooked.onErrorReceived = (err: Error) => {
            // A failed stream reports here INSTEAD of the disconnect callback
            // above, so it must clear the flag too.
            isConnected = false;
            options.onError?.(err);
        };
    } catch (err) {
        container.removeAttribute(ACTIVE_STREAM_ATTR);
        // A start failure is reported through onError only, and the caller
        // still gets a handle (isConnected false, stop() a no-op). Rethrowing
        // here reported the one failure twice.
        options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }

    let stopped = false;
    return {
        stop(): void {
            if (stopped) return;
            stopped = true;
            releaseWakeLock();
            window.clearInterval(wakeLockKeeper);
            stopPlaybackGuard();
            document.removeEventListener('visibilitychange', onVisibilityChange);
            stopFn?.();
        },
        get isConnected() {
            return isConnected;
        },
        get deviceId() {
            return deviceId;
        },
    };
}

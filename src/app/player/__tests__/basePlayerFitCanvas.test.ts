// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoSettings from '../../VideoSettings';
import { BasePlayer } from '../BasePlayer';
import ScreenInfo from '../../ScreenInfo';
import Rect from '../../Rect';
import Size from '../../Size';

/**
 * The picture must keep the device aspect ratio and be shown whole. Regressions
 * here are visible only on a real device, so pin the numbers down:
 * - modal: sized from the viewport (the frame hugs the picture), whole fit, and
 *   the device view pinned to the picture height so no bars appear;
 * - fullscreen: whole fit inside the screen, never cropped;
 * - plain stream page: inline sizes cleared, stylesheet caps take over.
 */

class TestPlayer extends BasePlayer {
    public getImageDataURL(): string {
        return '';
    }
    public getPreferredVideoSetting() {
        return new VideoSettings({ bitrate: 8_000_000, maxFps: 15, iFrameInterval: 2 });
    }
    protected calculateMomentumStats(): void {}
    public getFitToScreenStatus(): boolean {
        return false;
    }
    public loadVideoSettings() {
        return new VideoSettings({ bitrate: 8_000_000, maxFps: 15, iFrameInterval: 2 });
    }
}

const DEVICE_WIDTH = 1080;
const DEVICE_HEIGHT = 2400;
const TOOLBAR_WIDTH = 59;

interface Harness {
    player: TestPlayer;
    video: HTMLDivElement;
    deviceView: HTMLDivElement;
    toolbar: HTMLDivElement;
    frame: HTMLDivElement | null;
    videoCanvas: HTMLCanvasElement;
}

function buildDom(parentTag: 'dialog' | 'div'): Harness {
    const outer = parentTag === 'dialog' ? document.createElement('dialog') : document.createElement('div');
    const deviceView = document.createElement('div');
    deviceView.className = 'device-view';
    const toolbar = document.createElement('div');
    toolbar.className = 'control-buttons-list';
    Object.defineProperty(toolbar, 'offsetWidth', { value: TOOLBAR_WIDTH, configurable: true });
    const video = document.createElement('div');
    video.className = 'video';
    deviceView.append(toolbar, video);
    let frame: HTMLDivElement | null = null;
    if (parentTag === 'dialog') {
        outer.classList.add('modal');
        frame = document.createElement('div');
        frame.className = 'modal-frame';
        frame.append(deviceView);
        outer.append(frame);
    } else {
        outer.append(deviceView);
    }
    document.body.append(outer);

    const player = new TestPlayer('udid');
    player.setParent(video);
    player.setScreenInfo(
        new ScreenInfo(
            new Rect(0, 0, DEVICE_WIDTH, DEVICE_HEIGHT),
            new Size(DEVICE_WIDTH, DEVICE_HEIGHT),
            0,
        ),
    );
    return { player, video, deviceView, toolbar, frame, videoCanvas: video.children[0] as HTMLCanvasElement };
}

function setViewport(width: number, height: number): void {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

function setFullscreen(element: Element | null): void {
    Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
}

describe('BasePlayer.fitCanvasToParent', () => {
    beforeEach(() => {
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            cb(0);
            return 0;
        });
        setFullscreen(null);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
        setFullscreen(null);
    });

    it('sizes the modal picture from the viewport, whole, and pins the stack to it', () => {
        setViewport(424, 800);
        const h = buildDom('dialog');
        h.player.fitCanvasToParent();

        // 100vw - 24 (frame max-width) - toolbar - 2 (border) ; 90vh - 2
        const availWidth = 424 - 24 - TOOLBAR_WIDTH - 2;
        const availHeight = Math.floor(800 * 0.9) - 2;
        const scale = Math.min(availWidth / DEVICE_WIDTH, availHeight / DEVICE_HEIGHT);
        const cssWidth = Math.floor(DEVICE_WIDTH * scale);
        const cssHeight = Math.floor(DEVICE_HEIGHT * scale);
        const expectedWidth = `${cssWidth}px`;
        const expectedHeight = `${cssHeight}px`;

        expect(h.videoCanvas.style.width).toBe(expectedWidth);
        expect(h.videoCanvas.style.height).toBe(expectedHeight);
        // The touch surface must match the picture or taps land in the wrong place.
        expect(h.player.getTouchableElement().style.width).toBe(expectedWidth);
        expect(h.player.getTouchableElement().style.height).toBe(expectedHeight);

        // No wasted space: the frame is exactly picture + toolbox, no wider.
        expect(h.video.style.width).toBe(expectedWidth);
        expect(h.video.style.height).toBe(expectedHeight);
        expect(h.toolbar.style.height).toBe(expectedHeight);
        expect(h.frame?.style.width).toBe(`${cssWidth + TOOLBAR_WIDTH + 2}px`);
        expect(h.frame?.style.height).toBe(`${cssHeight + 2}px`);

        // Whole fit: the picture never exceeds the box it was given.
        expect(cssWidth).toBeLessThanOrEqual(availWidth);
        expect(cssHeight).toBeLessThanOrEqual(availHeight);
        expect(Math.abs(cssWidth / cssHeight - DEVICE_WIDTH / DEVICE_HEIGHT)).toBeLessThan(0.01);
    });

    it('keeps the device aspect ratio exactly in fullscreen (fits, never crops)', () => {
        setViewport(933, 424);
        const h = buildDom('div');
        Object.defineProperty(h.video, 'clientWidth', { value: 874, configurable: true });
        Object.defineProperty(h.video, 'clientHeight', { value: 424, configurable: true });
        h.deviceView.style.height = '400px';
        setFullscreen(h.deviceView);

        h.player.fitCanvasToParent();

        const width = Number.parseFloat(h.videoCanvas.style.width);
        const height = Number.parseFloat(h.videoCanvas.style.height);
        expect(width).toBeLessThanOrEqual(874);
        expect(height).toBeLessThanOrEqual(424);
        // Rounding may cost a pixel; the ratio itself must hold.
        expect(Math.abs(width / height - DEVICE_WIDTH / DEVICE_HEIGHT)).toBeLessThan(0.01);
        // Fullscreen is driven by CSS, so no inline row height may survive.
        expect(h.deviceView.style.height).toBe('');
    });

    it('clears inline sizes outside bounded contexts', () => {
        setViewport(424, 800);
        const h = buildDom('div');
        h.videoCanvas.style.width = '123px';
        h.player.getTouchableElement().style.width = '123px';
        h.deviceView.style.height = '456px';
        h.toolbar.style.height = '456px';

        h.player.fitCanvasToParent();

        expect(h.videoCanvas.style.width).toBe('');
        expect(h.player.getTouchableElement().style.width).toBe('');
        expect(h.deviceView.style.height).toBe('');
        expect(h.toolbar.style.height).toBe('');
        expect(h.video.style.width).toBe('');
    });
});

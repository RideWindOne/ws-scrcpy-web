import { Modal } from '../../ui/Modal';
import { t } from '../../client/i18n';

/** Per-grid-size tuning: dot size / gap / padding fill a ~264px canvas. */
const GRID_PRESETS: Record<number, { dot: number; gap: number; pad: number }> = {
    3: { dot: 56, gap: 24, pad: 24 }, // 264px
    4: { dot: 44, gap: 14, pad: 20 }, // 258px
    5: { dot: 36, gap: 12, pad: 16 }, // 260px
};

const SIZES = [3, 4, 5];

/**
 * Standalone pattern-drawing dialog. The grid is its own modal window (not
 * embedded in the settings panel, so scrolling the settings page never drags
 * it), the pattern is drawn by dragging across the dots — pointer events build
 * the sequence, exactly like an Android pattern lock. Supports 3x3 (default),
 * 4x4 and 5x5 grids for devices whose lock screen is not 3x3.
 *
 * Passwords are never persisted: the drawn pattern is handed straight to the
 * caller via onUnlock(points, size) when "立即解锁" is pressed.
 */
export class PatternEditorDialog extends Modal {
    private size = 3;
    private selected: number[] = [];
    private dots: HTMLDivElement[] = [];
    private centers: { x: number; y: number }[] = [];
    private pathEl: SVGPathElement | null = null;
    private statusEl: HTMLElement | null = null;
    private applyBtn: HTMLButtonElement | null = null;
    private drawing = false;
    private areaEl: HTMLDivElement | null = null;

    constructor(
        private readonly onClosed?: () => void,
        private readonly onUnlock?: (points: number[], size: number) => void,
    ) {
        super({ title: t('unlock_set_pattern') });
        this.dialog.classList.add('pattern-editor-modal');
        queueMicrotask(() => this.fillBody(this.bodyEl));
    }

    protected override onBeforeClose(): void {
        this.onClosed?.();
    }

    protected buildBody(_container: HTMLElement): void {
        // Rendered by fillBody() from the constructor via queueMicrotask.
    }

    private gridMetrics(n: number): { dot: number; gap: number; pad: number; size: number } {
        const p = GRID_PRESETS[n] ?? GRID_PRESETS[3]!;
        const size = p.pad * 2 + n * p.dot + (n - 1) * p.gap;
        return { ...p, size };
    }

    private fillBody(container: HTMLElement): void {
        container.replaceChildren();
        container.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
        container.style.fontFamily = 'system-ui, sans-serif';

        // ── Size selector (3x3 / 4x4 / 5x5) ─────────────────────────────
        const sizeRow = document.createElement('div');
        sizeRow.style.cssText =
            'display:flex;gap:8px;justify-content:center;margin-bottom:12px;flex-wrap:wrap;';
        const sizeBtns = new Map<number, HTMLButtonElement>();
        for (const n of SIZES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'modal-button';
            btn.textContent = `${n}×${n}`;
            btn.style.cssText = 'min-height:40px;padding:2px 14px;';
            btn.addEventListener('click', () => {
                this.size = n;
                this.selected = [];
                this.renderGrid(container, sizeRow);
                this.render();
                sizeBtns.forEach((b, key) => {
                    b.classList.toggle('modal-button-primary', key === n);
                });
            });
            sizeBtns.set(n, btn);
            sizeRow.appendChild(btn);
        }
        container.appendChild(sizeRow);

        // Draw area + pointer drawing are rebuilt per size; wire once here.
        this.renderGrid(container, sizeRow);

        // ── Pointer drawing (mouse + touch) ──────────────────────────────
        const area = this.areaEl!;
        const pointHit = (px: number, py: number): number | null => {
            for (let i = 0; i < this.centers.length; i++) {
                const dx = px - this.centers[i]!.x;
                const dy = py - this.centers[i]!.y;
                const hitR = (GRID_PRESETS[this.size]?.dot ?? 56) * 0.85;
                if (dx * dx + dy * dy <= hitR * hitR) return i;
            }
            return null;
        };

        const areaPoint = (e: PointerEvent): { x: number; y: number } => {
            const rect = area.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        area.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            area.setPointerCapture(e.pointerId);
            const p = areaPoint(e);
            const hit = pointHit(p.x, p.y);
            if (hit === null) return;
            this.drawing = true;
            this.selected = [hit];
            this.render();
        });
        area.addEventListener('pointermove', (e) => {
            if (!this.drawing) return;
            const p = areaPoint(e);
            const hit = pointHit(p.x, p.y);
            if (hit === null) return;
            // Android ignores re-visits of an already-touched dot; so do we
            // (prevents duplicated points when the finger sweeps back over one).
            if (this.selected.includes(hit)) return;
            this.selected.push(hit);
            this.render();
        });
        area.addEventListener('pointerup', () => {
            if (!this.drawing) return;
            this.drawing = false;
            this.updateStatus();
        });
        area.addEventListener('pointercancel', () => {
            this.drawing = false;
        });

        // ── Footer: status + clear + save (centered; wraps on narrow screens,
        // buttons keep a touch-friendly height) ──────────────────────────
        const footer = document.createElement('div');
        footer.style.cssText =
            'width:100%;display:flex;align-items:center;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px;';
        this.statusEl = document.createElement('div');
        this.statusEl.style.cssText =
            'font-size:12px;color:#888;flex:1 1 100%;min-height:1.4em;text-align:center;';
        const btnStyle = 'min-height:44px;display:flex;align-items:center;justify-content:center;';
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'modal-button';
        clearBtn.textContent = t('unlock_pattern_clear');
        clearBtn.style.cssText = btnStyle;
        clearBtn.addEventListener('click', () => {
            this.selected = [];
            this.render();
        });
        this.applyBtn = document.createElement('button');
        this.applyBtn.type = 'button';
        this.applyBtn.className = 'modal-button modal-button-primary';
        this.applyBtn.textContent = t('unlock_pattern_apply');
        this.applyBtn.style.cssText = btnStyle;
        this.applyBtn.addEventListener('click', () => {
            if (this.selected.length < 4) return;
            const points = [...this.selected];
            const size = this.size;
            this.close();
            this.onUnlock?.(points, size);
        });
        footer.appendChild(this.statusEl);
        footer.appendChild(clearBtn);
        footer.appendChild(this.applyBtn);
        container.appendChild(footer);

        // Start blank — never pre-fill anything (passwords are not persisted).
        this.render();
    }

    /** (Re)build the n×n dot grid + SVG overlay. The area element itself is
     * created once and reused (pointer listeners stay attached); only its
     * children and size change when the grid size switches. */
    private renderGrid(container: HTMLElement, sizeRow: HTMLDivElement): void {
        const n = this.size;
        const m = this.gridMetrics(n);
        const area =
            this.areaEl ??
            (() => {
                const a = document.createElement('div');
                a.style.cssText =
                    'position:relative;background:#1a1a1a;border-radius:10px;' +
                    'touch-action:none;user-select:none;cursor:crosshair;';
                this.areaEl = a;
                container.insertBefore(a, sizeRow.nextSibling);
                return a;
            })();
        area.style.width = `${m.size}px`;
        area.style.height = `${m.size}px`;
        area.replaceChildren();
        this.dots = [];
        this.centers = [];
        this.pathEl = null;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', String(m.size));
        svg.setAttribute('height', String(m.size));
        svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#0078d4');
        path.setAttribute('stroke-width', String(n === 5 ? 4 : 6));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
        area.appendChild(svg);
        this.pathEl = path;

        const cell = m.dot + m.gap;
        for (let i = 0; i < n * n; i++) {
            const row = Math.floor(i / n);
            const col = i % n;
            const cx = m.pad + col * cell + m.dot / 2;
            const cy = m.pad + row * cell + m.dot / 2;
            this.centers.push({ x: cx, y: cy });
            const dot = document.createElement('div');
            dot.style.cssText =
                `position:absolute;left:${m.pad + col * cell}px;top:${m.pad + row * cell}px;` +
                `width:${m.dot}px;height:${m.dot}px;border-radius:50%;` +
                'background:#444;box-shadow:inset 0 0 0 2px rgba(255,255,255,.08);';
            area.appendChild(dot);
            this.dots.push(dot);
        }
    }

    private render(): void {
        const selectedSet = new Set(this.selected);
        this.dots.forEach((dot, i) => {
            dot.style.background = selectedSet.has(i) ? '#0078d4' : '#444';
        });
        const pts = this.selected.map((idx) => this.centers[idx]!);
        if (pts.length > 0) {
            const d = 'M ' + pts.map((p) => `${p.x},${p.y}`).join(' L ');
            this.pathEl?.setAttribute('d', d);
        } else {
            this.pathEl?.setAttribute('d', '');
        }
        this.updateStatus();
    }

    private updateStatus(): void {
        const n = this.selected.length;
        const total = this.size * this.size;
        if (!this.statusEl || !this.applyBtn) return;
        if (n === 0) {
            this.statusEl.textContent = t('unlock_pattern_hint');
            this.applyBtn.disabled = true;
        } else if (n < 4) {
            this.statusEl.textContent = `${t('unlock_pattern_selected')}${n}/${total}`;
            this.applyBtn.disabled = true;
        } else {
            this.statusEl.textContent = `${t('unlock_pattern_selected')}${n}/${total} ✓`;
            this.applyBtn.disabled = false;
        }
    }
}

import { Modal } from '../../ui/Modal';
import { t } from '../../client/i18n';
import {
    EDGE_ZONE_LENGTH_MAX,
    EDGE_ZONE_LENGTH_MIN,
    EDGE_ZONE_WIDTH_MAX,
    EDGE_ZONE_WIDTH_MIN,
    loadEdgeZoneConfig,
    saveEdgeZoneConfig,
    type EdgeZoneConfig,
    type EdgeZoneSide,
} from '../client/EdgeZoneSettings';

/**
 * Settings for the fullscreen edge strip: which side it sits on, how long it is
 * and how thick. Every change is applied immediately (and saved), so the user
 * can drag the sliders while looking at the stream and see the bar move.
 */
export class EdgeZoneDialog extends Modal {
    private config: EdgeZoneConfig;
    private sideButtons: Record<EdgeZoneSide, HTMLButtonElement> | null = null;

    constructor() {
        super({ title: t('edge_zone_title') });
        this.dialog.classList.add('edge-zone-modal');
        this.config = loadEdgeZoneConfig();
        queueMicrotask(() => this.fillBody(this.bodyEl));
    }

    protected buildBody(container: HTMLElement): void {
        // Rendered by fillBody() from the constructor via queueMicrotask.
        container.classList.add('edge-zone-body');
    }

    private fillBody(container: HTMLElement): void {
        const hint = document.createElement('div');
        hint.className = 'edge-zone-hint';
        hint.innerText = t('edge_zone_hint');
        container.appendChild(hint);

        container.appendChild(this.buildSideRow());
        container.appendChild(
            this.buildSlider({
                label: t('edge_zone_length'),
                min: EDGE_ZONE_LENGTH_MIN,
                max: EDGE_ZONE_LENGTH_MAX,
                value: this.config.length,
                suffix: 'px',
                onInput: (value) => {
                    this.config.length = value;
                    saveEdgeZoneConfig(this.config);
                },
            })
        );
        container.appendChild(
            this.buildSlider({
                label: t('edge_zone_width'),
                min: EDGE_ZONE_WIDTH_MIN,
                max: EDGE_ZONE_WIDTH_MAX,
                value: this.config.width,
                suffix: 'px',
                onInput: (value) => {
                    this.config.width = value;
                    saveEdgeZoneConfig(this.config);
                },
            })
        );
    }

    private buildSideRow(): HTMLElement {
        const row = document.createElement('div');
        row.className = 'edge-zone-row';
        const label = document.createElement('span');
        label.className = 'edge-zone-label';
        label.innerText = `${t('edge_zone_side')}:`;
        row.appendChild(label);

        const group = document.createElement('div');
        group.className = 'edge-zone-segments';
        const buttons = {} as Record<EdgeZoneSide, HTMLButtonElement>;
        (['right', 'left'] as EdgeZoneSide[]).forEach((side) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.innerText = side === 'right' ? t('edge_zone_right') : t('edge_zone_left');
            button.className = 'edge-zone-segment';
            button.addEventListener('click', () => {
                this.config.side = side;
                this.refreshSegments();
                saveEdgeZoneConfig(this.config);
            });
            buttons[side] = button;
            group.appendChild(button);
        });
        this.sideButtons = buttons;
        row.appendChild(group);
        this.refreshSegments();
        return row;
    }

    private refreshSegments(): void {
        if (!this.sideButtons) {
            return;
        }
        (Object.keys(this.sideButtons) as EdgeZoneSide[]).forEach((side) => {
            this.sideButtons![side].classList.toggle('active', this.config.side === side);
        });
    }

    private buildSlider(opts: {
        label: string;
        min: number;
        max: number;
        value: number;
        suffix: string;
        onInput: (value: number) => void;
    }): HTMLElement {
        const row = document.createElement('div');
        row.className = 'edge-zone-row edge-zone-slider-row';
        const label = document.createElement('span');
        label.className = 'edge-zone-label';
        const value = document.createElement('span');
        value.className = 'edge-zone-value';
        const render = (n: number) => {
            value.innerText = `${n}${opts.suffix}`;
        };
        render(opts.value);
        label.innerText = `${opts.label}:`;
        row.appendChild(label);
        row.appendChild(value);

        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'edge-zone-range';
        input.min = String(opts.min);
        input.max = String(opts.max);
        input.step = '1';
        input.value = String(opts.value);
        input.addEventListener('input', () => {
            const n = Number.parseInt(input.value, 10) || opts.min;
            render(n);
            opts.onInput(n);
        });
        row.appendChild(input);
        return row;
    }
}

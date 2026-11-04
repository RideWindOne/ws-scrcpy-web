import { Modal } from '../../ui/Modal';
import { t } from '../../client/i18n';
import { clearSavedPin, getSavedPin, setSavedPin } from './unlockStore';

/**
 * Standalone numeric-PIN dialog used from the device list (and any place that
 * wants to set the lock-screen PIN without opening the stream settings).
 * Opens as a normal modal (no other modal is open at that point), saves to
 * localStorage per device, and offers a clear action when a PIN is stored.
 */
export class PinEditorDialog extends Modal {
    private readonly udid: string;

    constructor(udid: string, private readonly onClosed?: () => void) {
        super({ title: t('unlock_set_pin') });
        this.udid = udid;
        this.dialog.classList.add('pin-editor-modal');
        queueMicrotask(() => this.fillBody(this.bodyEl));
    }

    protected override onBeforeClose(): void {
        this.onClosed?.();
    }

    protected buildBody(_container: HTMLElement): void {
        // Rendered by fillBody() from the constructor via queueMicrotask.
    }

    private fillBody(container: HTMLElement): void {
        container.replaceChildren();
        container.style.fontFamily = 'system-ui, sans-serif';
        container.style.fontSize = '14px';

        const label = document.createElement('div');
        label.textContent = t('unlock_pin_label');
        label.style.cssText = 'font-size:13px;margin-bottom:6px;color:#888;';
        container.appendChild(label);

        const input = document.createElement('input');
        input.type = 'password';
        input.inputMode = 'numeric';
        input.value = getSavedPin(this.udid) ?? '';
        input.style.cssText =
            'width:100%;padding:6px 8px;box-sizing:border-box;font-size:15px;' +
            'background:#1a1a1a;border:1px solid #444;color:#eee;border-radius:4px;';
        container.appendChild(input);

        const status = document.createElement('div');
        status.style.cssText = 'font-size:12px;color:#e05555;margin-top:6px;min-height:1.2em;';
        container.appendChild(status);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';

        const hasSaved = getSavedPin(this.udid) !== null;
        if (hasSaved) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'modal-button';
            clearBtn.textContent = t('unlock_clear');
            clearBtn.addEventListener('click', () => {
                clearSavedPin(this.udid);
                this.close();
            });
            actions.appendChild(clearBtn);
        }

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'modal-button modal-button-primary';
        saveBtn.textContent = t('unlock_save');
        saveBtn.addEventListener('click', () => {
            const value = input.value.trim();
            if (!value) {
                status.textContent = t('unlock_need_pin');
                return;
            }
            setSavedPin(this.udid, value);
            this.close();
        });
        actions.appendChild(saveBtn);
        container.appendChild(actions);

        input.focus();
    }
}

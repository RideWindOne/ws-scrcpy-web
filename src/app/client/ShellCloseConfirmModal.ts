import { Modal } from '../ui/Modal';
import { t } from './i18n';

export class ShellCloseConfirmModal extends Modal {
    private resolveFn: ((value: boolean) => void) | null = null;
    private resolved = false;

    public static confirm(): Promise<boolean> {
        return new Promise((resolve) => {
            new ShellCloseConfirmModal(resolve);
        });
    }

    private constructor(resolve: (value: boolean) => void) {
        super({ title: t('shell_close_title') });
        this.resolveFn = resolve;
        this.dialog.classList.add('shell-close-confirm-modal');
        queueMicrotask(() => this.fillBody(this.bodyEl));
    }

    protected buildBody(_container: HTMLElement): void {
        // Body content rendered by fillBody() from the constructor via queueMicrotask.
    }

    private fillBody(container: HTMLElement): void {
        const message = document.createElement('p');
        message.style.cssText = 'margin: 0 0 12px;';
        message.textContent = t('shell_close_message');
        container.appendChild(message);

        const question = document.createElement('p');
        question.style.cssText = 'margin: 0 0 8px;';
        question.textContent = t('shell_close_question');
        container.appendChild(question);
    }

    protected override buildFooter(): HTMLElement | null {
        const footer = document.createElement('div');
        footer.style.cssText =
            'display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'modal-button';
        cancelBtn.textContent = t('cancel_btn');
        cancelBtn.style.cssText = 'min-height:44px;min-width:96px;';
        cancelBtn.addEventListener('click', () => this.resolveAndClose(false));
        footer.appendChild(cancelBtn);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'modal-button';
        closeBtn.textContent = t('close_anyway');
        closeBtn.style.cssText = 'min-height:44px;min-width:96px;';
        closeBtn.addEventListener('click', () => this.resolveAndClose(true));
        footer.appendChild(closeBtn);

        return footer;
    }

    protected override onEscapeKey(_event: Event): void {
        this.resolveAndClose(false);
    }

    protected override onBackdropClick(_event: MouseEvent): void {
        this.resolveAndClose(false);
    }

    protected override onCloseButtonClick(): void {
        this.resolveAndClose(false);
    }

    // Closed without an answer (its ShellModal closed first): settle as "keep",
    // so the caller is not left awaiting a dialog that is gone.
    protected override onBeforeClose(): void {
        this.settle(false);
    }

    private resolveAndClose(value: boolean): void {
        if (this.resolved) return;
        this.settle(value);
        this.close(value);
    }

    private settle(value: boolean): void {
        if (this.resolved) return;
        this.resolved = true;
        this.resolveFn?.(value);
        this.resolveFn = null;
    }
}

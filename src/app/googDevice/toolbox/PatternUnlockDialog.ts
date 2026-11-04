// Pattern unlock dialog
export function showPatternUnlockDialog(udid: string): void {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    // Create dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: #2a2a2a;
        border-radius: 12px;
        padding: 24px;
        width: 320px;
        max-width: 90vw;
        color: #eee;
        font-family: system-ui, sans-serif;
    `;

    // Title
    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0 0 16px 0; font-size: 18px; text-align: center;';
    title.innerText = 'Pattern Unlock';
    dialog.appendChild(title);

    // Pattern grid (3x3)
    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 16px;
        padding: 16px;
        background: #1a1a1a;
        border-radius: 8px;
    `;

    const points: { x: number; y: number; el: HTMLDivElement }[] = [];
    const selectedPoints: number[] = [];

    for (let i = 0; i < 9; i++) {
        const point = document.createElement('div');
        point.style.cssText = `
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: #444;
            cursor: pointer;
            transition: all 0.2s;
            margin: 0 auto;
        `;
        point.addEventListener('click', () => {
            if (selectedPoints.includes(i)) return;
            selectedPoints.push(i);
            point.style.background = '#0078d4';
            point.style.transform = 'scale(1.1)';
        });
        grid.appendChild(point);
        points.push({ x: 0, y: 0, el: point });
    }

    dialog.appendChild(grid);

    // Screen size inputs
    const sizeRow = document.createElement('div');
    sizeRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 16px; font-size: 13px;';
    
    const widthLabel = document.createElement('label');
    widthLabel.innerText = 'W:';
    widthLabel.style.flex = '1';
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.value = '1080';
    widthInput.style.cssText = 'width: 60px; background: #1a1a1a; border: 1px solid #444; color: #eee; border-radius: 4px; padding: 4px;';
    widthLabel.appendChild(widthInput);
    
    const heightLabel = document.createElement('label');
    heightLabel.innerText = 'H:';
    heightLabel.style.flex = '1';
    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.value = '1920';
    heightInput.style.cssText = 'width: 60px; background: #1a1a1a; border: 1px solid #444; color: #eee; border-radius: 4px; padding: 4px;';
    heightLabel.appendChild(heightInput);
    
    sizeRow.appendChild(widthLabel);
    sizeRow.appendChild(heightLabel);
    dialog.appendChild(sizeRow);

    // Buttons
    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display: flex; gap: 8px; justify-content: center;';

    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel';
    cancelBtn.style.cssText = 'padding: 8px 16px; background: #444; border: none; color: #eee; border-radius: 6px; cursor: pointer;';
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    const clearBtn = document.createElement('button');
    clearBtn.innerText = 'Clear';
    clearBtn.style.cssText = 'padding: 8px 16px; background: #444; border: none; color: #eee; border-radius: 6px; cursor: pointer;';
    clearBtn.addEventListener('click', () => {
        selectedPoints.length = 0;
        points.forEach((p) => {
            p.el.style.background = '#444';
            p.el.style.transform = 'scale(1)';
        });
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.innerText = 'Send';
    confirmBtn.style.cssText = 'padding: 8px 16px; background: #0078d4; border: none; color: #fff; border-radius: 6px; cursor: pointer;';
    confirmBtn.addEventListener('click', async () => {
        if (selectedPoints.length < 2) {
            alert('Please select at least 2 points');
            return;
        }

        const screenWidth = Number.parseInt(widthInput.value, 10);
        const screenHeight = Number.parseInt(heightInput.value, 10);

        // Calculate point coordinates (3x3 grid centered)
        const marginX = screenWidth * 0.2;
        const marginY = screenHeight * 0.25;
        const cellWidth = (screenWidth - marginX * 2) / 2;
        const cellHeight = (screenHeight - marginY * 2) / 2;

        const coords = selectedPoints.map((idx) => {
            const col = idx % 3;
            const row = Math.floor(idx / 3);
            return {
                x: Math.round(marginX + col * cellWidth),
                y: Math.round(marginY + row * cellHeight),
            };
        });

        // Send swipe events between consecutive points
        for (let i = 0; i < coords.length - 1; i++) {
            try {
                const curr = coords[i];
                const next = coords[i + 1];
                if (!curr || !next) continue;
                await fetch('/api/devices/input-swipe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        udid,
                        x1: curr.x,
                        y1: curr.y,
                        x2: next.x,
                        y2: next.y,
                        duration: 200,
                    }),
                });
                await new Promise((r) => setTimeout(r, 100));
            } catch (err) {
                alert('Error: ' + (err as Error).message);
                return;
            }
        }

        document.body.removeChild(overlay);
    });

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(clearBtn);
    buttonRow.appendChild(confirmBtn);
    dialog.appendChild(buttonRow);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

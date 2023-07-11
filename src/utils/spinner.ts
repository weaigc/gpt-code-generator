export class Spinner {
    tick: number = 300;
    processing = false;
    index = 0;
    tid: any;
    chars = {
        output: ['-', '\\', '|', '/'],
        input: ['│', ' '],
    }
    currentMode: 'input' | 'output' = 'output';
    setMode(mode: 'input' | 'output') {
        this.currentMode = mode;
        if (mode === 'input') {
            this.tick = 900;
        } else {
            this.tick = 300;
        }
    }

    start() {
        this.processing = true;
        if (this.tid) return;
        this.spin();
    }

    spin() {
        this.tid = setTimeout(() => {
            if (!this.processing) return;
            const chars = this.chars[this.currentMode];
            this.index = ++this.index % chars.length;
            const char = chars[this.index];
            process.stdout.write(char);
            process.stdout.moveCursor(-1, 0);
            this.spin();
        }, this.tick);
    }

    write(text: string) {
        if (text.charAt(0) === '\n') {
            process.stdout.write(' ');
        }
        process.stdout.write(text);
    }

    stop() {
        this.processing = false;
        this.tid = null;
    }
}
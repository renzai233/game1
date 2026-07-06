import { Dispose } from './contracts';

export class CompositeDisposable {
    private readonly disposables: Dispose[] = [];

    add(dispose?: Dispose): void {
        if (!dispose) {
            return;
        }
        this.disposables.push(dispose);
    }

    disposeAll(): void {
        while (this.disposables.length > 0) {
            const dispose = this.disposables.pop();
            if (!dispose) {
                continue;
            }

            try {
                dispose();
            } catch (error) {
                console.error('[CompositeDisposable] dispose failed:', error);
            }
        }
    }
}

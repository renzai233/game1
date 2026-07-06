import { Dispose, RuntimeLogger } from '../runtime/types';

export interface CompositeDisposableOptions {
    logger?: RuntimeLogger;
    onError?: (error: unknown) => void;
    scope?: string;
}

export class CompositeDisposable {
    private disposers: Dispose[] = [];
    private readonly logger: RuntimeLogger;
    private readonly onError?: (error: unknown) => void;
    private readonly scope: string;

    constructor(options: CompositeDisposableOptions = {}) {
        this.logger = options.logger || {};
        this.onError = options.onError;
        this.scope = options.scope || 'CompositeDisposable';
    }

    add(dispose: Dispose): void {
        this.disposers.push(dispose);
    }

    size(): number {
        return this.disposers.length;
    }

    disposeAll(): void {
        while (this.disposers.length > 0) {
            const dispose = this.disposers.pop();
            try {
                dispose?.();
            } catch (error) {
                this.onError?.(error);
                if (!this.onError) {
                    this.logger.error?.(`[ui-runtime][${this.scope}] dispose failed:`, error);
                }
            }
        }
    }
}

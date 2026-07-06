import {
    RuntimeContext,
    RuntimeHostState,
    RuntimeLogger,
    RuntimeModule,
    RuntimeStartupPolicy,
    RuntimeTelemetry
} from './types';

export interface RuntimeHostOptions<TContext extends RuntimeContext> {
    modules: RuntimeModule<TContext>[];
    createContext: () => TContext;
    logger?: RuntimeLogger;
    startupPolicy?: RuntimeStartupPolicy;
    telemetry?: RuntimeTelemetry;
}

export class RuntimeStartError extends Error {
    readonly failedModuleIds: readonly string[];

    constructor(message: string, failedModuleIds: readonly string[]) {
        super(message);
        this.name = 'RuntimeStartError';
        this.failedModuleIds = [...failedModuleIds];
    }
}

export class RuntimeHost<TContext extends RuntimeContext> {
    private readonly modules: RuntimeModule<TContext>[];
    private readonly createContext: () => TContext;
    private readonly logger: RuntimeLogger;
    private readonly startupPolicy: RuntimeStartupPolicy;
    private readonly telemetry?: RuntimeTelemetry;
    private readonly now: () => number;

    private state: RuntimeHostState = 'idle';
    private context: TContext | null = null;
    private activeModules: RuntimeModule<TContext>[] = [];
    private failedModuleIds: string[] = [];
    private startPromise: Promise<void> | null = null;
    private stopPromise: Promise<void> | null = null;

    constructor(options: RuntimeHostOptions<TContext>) {
        this.modules = options.modules;
        this.createContext = options.createContext;
        this.logger = options.logger || {};
        this.startupPolicy = options.startupPolicy || 'best-effort';
        this.telemetry = options.telemetry;
        this.now = () => Date.now();
    }

    isStarted(): boolean {
        return this.state === 'running';
    }

    getState(): RuntimeHostState {
        return this.state;
    }

    getFailedModuleIds(): readonly string[] {
        return [...this.failedModuleIds];
    }

    getActiveModuleIds(): readonly string[] {
        return this.activeModules.map((module) => module.id);
    }

    async start(): Promise<void> {
        if (this.state === 'running') {
            return;
        }

        if (this.startPromise) {
            return this.startPromise;
        }

        this.startPromise = this.startInternal();
        try {
            await this.startPromise;
        } finally {
            this.startPromise = null;
        }
    }

    private async startInternal(): Promise<void> {
        if (this.state === 'running') {
            return;
        }

        if (this.state === 'stopping' && this.stopPromise) {
            this.logger.info?.('[RuntimeHost] start waits for stop to complete');
            await this.stopPromise;
            if (this.state === 'running') {
                return;
            }
        }

        this.state = 'starting';
        try {
            const startedAt = this.now();
            this.failedModuleIds = [];
            this.activeModules = [];
            this.logger.info?.(
                `[RuntimeHost] start begin: modules=${this.modules.length}, policy=${this.startupPolicy}`
            );

            const context = this.createContext();
            const setupModules: RuntimeModule<TContext>[] = [];

            for (const module of this.modules) {
                const moduleStartedAt = this.now();
                this.logger.info?.(`[RuntimeHost] module setup start: ${module.id}`);

                try {
                    await module.setup(context);
                    setupModules.push(module);
                    const durationMs = this.now() - moduleStartedAt;
                    this.logger.info?.(`[RuntimeHost] module setup done: ${module.id} (${durationMs}ms)`);
                    this.reportModuleLifecycle({
                        moduleId: module.id,
                        phase: 'setup',
                        durationMs,
                        success: true
                    });
                } catch (error) {
                    const durationMs = this.now() - moduleStartedAt;
                    this.failedModuleIds.push(module.id);
                    this.logger.warn?.(`[RuntimeHost] module setup failed: ${module.id} (${durationMs}ms)`);
                    this.logger.error?.(`[RuntimeHost] module setup failed: ${module.id}`, error);
                    this.reportModuleLifecycle({
                        moduleId: module.id,
                        phase: 'setup',
                        durationMs,
                        success: false,
                        error
                    });

                    await this.compensateFailedSetup(module, context, error);

                    if (this.startupPolicy === 'all-or-nothing') {
                        this.state = 'stopping';
                        const rollbackFailures = await this.teardownModules([...setupModules].reverse());
                        this.context = null;
                        this.activeModules = [];
                        this.state = 'idle';

                        if (rollbackFailures.length > 0) {
                            this.logger.warn?.(
                                `[RuntimeHost] rollback teardown had failures: ${rollbackFailures.join(', ')}`
                            );
                        }

                        const durationMs = this.now() - startedAt;
                        this.reportStartCompleted({
                            durationMs,
                            totalModules: this.modules.length,
                            activeModuleIds: [],
                            failedModuleIds: [...this.failedModuleIds],
                            startupPolicy: this.startupPolicy,
                            succeeded: false,
                            rolledBack: true
                        });

                        throw new RuntimeStartError(
                            `[RuntimeHost] startup aborted by module setup failure: ${module.id}`,
                            this.failedModuleIds
                        );
                    }
                }
            }

            this.context = context;
            this.activeModules = setupModules;
            this.state = 'running';

            const durationMs = this.now() - startedAt;
            if (this.failedModuleIds.length > 0) {
                this.logger.warn?.(
                    `[RuntimeHost] start completed with failures: active=${this.activeModules.length}/${this.modules.length}`
                );
            } else {
                this.logger.info?.(
                    `[RuntimeHost] start completed: active=${this.activeModules.length}/${this.modules.length} (${durationMs}ms)`
                );
            }

            this.reportStartCompleted({
                durationMs,
                totalModules: this.modules.length,
                activeModuleIds: this.getActiveModuleIds(),
                failedModuleIds: this.getFailedModuleIds(),
                startupPolicy: this.startupPolicy,
                succeeded: this.failedModuleIds.length === 0,
                rolledBack: false
            });
        } catch (error) {
            if (this.state !== 'running') {
                this.context = null;
                this.activeModules = [];
                this.state = 'idle';
            }
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.state === 'idle') {
            return;
        }

        if (this.stopPromise) {
            return this.stopPromise;
        }

        this.stopPromise = this.stopInternal();
        try {
            await this.stopPromise;
        } finally {
            this.stopPromise = null;
        }
    }

    private async stopInternal(): Promise<void> {
        if (this.state === 'starting' && this.startPromise) {
            this.logger.info?.('[RuntimeHost] stop waits for start to complete');
            try {
                await this.startPromise;
            } catch {
                // start failed; state is expected to be idle now
            }
        }

        if (this.state !== 'running') {
            if (this.state !== 'stopping') {
                this.state = 'idle';
            }
            return;
        }

        this.state = 'stopping';
        const startedAt = this.now();
        const activeCount = this.activeModules.length;
        this.logger.info?.(`[RuntimeHost] stop begin: activeModules=${activeCount}`);
        const teardownFailedIds = await this.teardownModules([...this.activeModules].reverse());
        const durationMs = this.now() - startedAt;

        if (teardownFailedIds.length > 0) {
            this.logger.warn?.(
                `[RuntimeHost] stop completed with teardown failures: ${teardownFailedIds.join(', ')}`
            );
        } else {
            this.logger.info?.(`[RuntimeHost] stop completed: modules=${activeCount} (${durationMs}ms)`);
        }

        this.reportStopCompleted({
            durationMs,
            totalModules: activeCount,
            failedModuleIds: teardownFailedIds
        });

        this.context = null;
        this.activeModules = [];
        this.failedModuleIds = [];
        this.state = 'idle';
    }

    private async teardownModules(modules: RuntimeModule<TContext>[]): Promise<string[]> {
        const failedModuleIds: string[] = [];

        for (const module of modules) {
            if (!module.teardown) {
                continue;
            }

            const moduleStartedAt = this.now();
            this.logger.info?.(`[RuntimeHost] module teardown start: ${module.id}`);

            try {
                await module.teardown();
                const durationMs = this.now() - moduleStartedAt;
                this.logger.info?.(`[RuntimeHost] module teardown done: ${module.id} (${durationMs}ms)`);
                this.reportModuleLifecycle({
                    moduleId: module.id,
                    phase: 'teardown',
                    durationMs,
                    success: true
                });
            } catch (error) {
                const durationMs = this.now() - moduleStartedAt;
                failedModuleIds.push(module.id);
                this.logger.warn?.(`[RuntimeHost] module teardown failed: ${module.id} (${durationMs}ms)`);
                this.logger.error?.(`[RuntimeHost] module teardown failed: ${module.id}`, error);
                this.reportModuleLifecycle({
                    moduleId: module.id,
                    phase: 'teardown',
                    durationMs,
                    success: false,
                    error
                });
            }
        }

        return failedModuleIds;
    }

    private async compensateFailedSetup(
        module: RuntimeModule<TContext>,
        context: TContext,
        setupError: unknown
    ): Promise<void> {
        if (!module.onSetupFailed && !module.teardown) {
            return;
        }

        const startedAt = this.now();
        const mode = module.onSetupFailed ? 'onSetupFailed' : 'teardown-fallback';
        this.logger.info?.(
            `[RuntimeHost] module setup compensation start: ${module.id} (${mode})`
        );

        try {
            if (module.onSetupFailed) {
                await module.onSetupFailed(context, setupError);
            } else if (module.teardown) {
                await module.teardown();
            }

            const durationMs = this.now() - startedAt;
            this.logger.info?.(
                `[RuntimeHost] module setup compensation done: ${module.id} (${durationMs}ms)`
            );
            this.reportModuleLifecycle({
                moduleId: module.id,
                phase: 'setup-failed-compensation',
                durationMs,
                success: true
            });
        } catch (error) {
            const durationMs = this.now() - startedAt;
            this.logger.warn?.(
                `[RuntimeHost] module setup compensation failed: ${module.id} (${durationMs}ms)`
            );
            this.logger.error?.(`[RuntimeHost] module setup compensation failed: ${module.id}`, error);
            this.reportModuleLifecycle({
                moduleId: module.id,
                phase: 'setup-failed-compensation',
                durationMs,
                success: false,
                error
            });
        }
    }

    private reportModuleLifecycle(
        metric: Parameters<NonNullable<RuntimeTelemetry['onModuleLifecycle']>>[0]
    ): void {
        if (!this.telemetry?.onModuleLifecycle) {
            return;
        }

        try {
            this.telemetry.onModuleLifecycle(metric);
        } catch (error) {
            this.logger.error?.('[RuntimeHost] telemetry onModuleLifecycle failed', error);
        }
    }

    private reportStartCompleted(
        metric: Parameters<NonNullable<RuntimeTelemetry['onStartCompleted']>>[0]
    ): void {
        if (!this.telemetry?.onStartCompleted) {
            return;
        }

        try {
            this.telemetry.onStartCompleted(metric);
        } catch (error) {
            this.logger.error?.('[RuntimeHost] telemetry onStartCompleted failed', error);
        }
    }

    private reportStopCompleted(
        metric: Parameters<NonNullable<RuntimeTelemetry['onStopCompleted']>>[0]
    ): void {
        if (!this.telemetry?.onStopCompleted) {
            return;
        }

        try {
            this.telemetry.onStopCompleted(metric);
        } catch (error) {
            this.logger.error?.('[RuntimeHost] telemetry onStopCompleted failed', error);
        }
    }
}

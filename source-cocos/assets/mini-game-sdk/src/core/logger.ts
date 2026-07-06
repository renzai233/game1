export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface LoggerConfig {
  readonly level?: LogLevel;
  readonly prefix?: string;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly prefix: string;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? "info";
    this.prefix = config.prefix ?? "mini-game-sdk";
  }

  debug(message: string, fields?: LogFields): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.write("error", message, fields);
  }

  private write(level: Exclude<LogLevel, "silent">, message: string, fields?: LogFields): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.level]) {
      return;
    }

    const payload = fields === undefined ? undefined : { ...fields };
    const text = `[${this.prefix}] ${message}`;

    if (payload === undefined) {
      console[level](text);
      return;
    }

    console[level](text, payload);
  }
}

export class NoopLogger implements Logger {
  debug(): void {
    return;
  }

  info(): void {
    return;
  }

  warn(): void {
    return;
  }

  error(): void {
    return;
  }
}

export function createConsoleLogger(config?: LoggerConfig): Logger {
  return new ConsoleLogger(config);
}

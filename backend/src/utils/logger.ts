const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) ?? 'info';

function ts(): string {
    return new Date().toISOString().slice(11, 23);
}

function log(level: Level, tag: string, ...args: unknown[]) {
    if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;
    const prefix = `[${ts()}] [${level.toUpperCase()}] [${tag}]`;
    if (level === 'error') console.error(prefix, ...args);
    else if (level === 'warn') console.warn(prefix, ...args);
    else console.log(prefix, ...args);
}

export function createLogger(tag: string) {
    return {
        debug: (...args: unknown[]) => log('debug', tag, ...args),
        info: (...args: unknown[]) => log('info', tag, ...args),
        warn: (...args: unknown[]) => log('warn', tag, ...args),
        error: (...args: unknown[]) => log('error', tag, ...args),
    };
}

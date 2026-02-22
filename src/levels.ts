/**
 * Log level numeric values (Pino-compatible)
 */
export const LogLevels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
} as const;

export type LogLevelName = keyof typeof LogLevels;
export type LogLevelNumber = (typeof LogLevels)[keyof typeof LogLevels];

/**
 * Map level number to level name
 */
export const levelToName: Record<number, LogLevelName> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

/**
 * Check if a level is enabled given a minimum level
 */
export function isLevelEnabled(level: number, minLevel: number): boolean {
  return level >= minLevel;
}

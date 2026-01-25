import type { Destination } from '../types';

/**
 * Writer function type
 */
export type Writer = (data: string) => void;

/**
 * Create a synchronous writer for stdout
 */
function createSyncStdoutWriter(): Writer {
  return (data: string) => {
    Bun.write(Bun.stdout, data);
  };
}

/**
 * Create a synchronous writer for stderr
 */
function createSyncStderrWriter(): Writer {
  return (data: string) => {
    Bun.write(Bun.stderr, data);
  };
}

/**
 * Create a buffered async writer for better performance
 * Batches writes and flushes on next tick
 */
function createAsyncWriter(target: typeof Bun.stdout | typeof Bun.stderr): Writer {
  let buffer: string[] = [];
  let scheduled = false;

  const flush = () => {
    if (buffer.length === 0) return;
    const data = buffer.join('');
    buffer = [];
    scheduled = false;
    Bun.write(target, data);
  };

  return (data: string) => {
    buffer.push(data);
    if (!scheduled) {
      scheduled = true;
      // Use queueMicrotask for next-tick batching
      queueMicrotask(flush);
    }
  };
}

/**
 * Create a destination writer
 */
export function createDestination(
  destination: Destination,
  sync = false
): Writer {
  // stdout (default)
  if (destination === 'stdout') {
    return sync ? createSyncStdoutWriter() : createAsyncWriter(Bun.stdout);
  }

  // stderr
  if (destination === 'stderr') {
    return sync ? createSyncStderrWriter() : createAsyncWriter(Bun.stderr);
  }

  // Custom write function
  if ('write' in destination) {
    return (data: string) => {
      destination.write(data);
    };
  }

  // File path - handled by file.ts
  throw new Error('File destinations should use createFileDestination');
}

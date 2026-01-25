import type { Destination } from '../types';
import { createDestination as createStdDestination, type Writer } from './stdout';
import { createFileDestination, createRotatingFileDestination, type FileDestinationOptions, type RotatingFileOptions } from './file';

export { createFileDestination, createRotatingFileDestination };
export type { Writer, FileDestinationOptions, RotatingFileOptions };

/**
 * Create a writer for any destination type
 */
export function createDestination(
  destination: Destination = 'stdout',
  sync = false
): Writer {
  // File path destination
  if (typeof destination === 'object' && 'path' in destination) {
    return createFileDestination({ path: destination.path, sync });
  }

  // stdout, stderr, or custom write function
  return createStdDestination(destination, sync);
}

/**
 * Flushable writer interface for graceful shutdown
 */
export interface FlushableWriter extends Writer {
  flush(): Promise<void>;
}

/**
 * Create a flushable writer that buffers writes
 */
export function createFlushableDestination(
  destination: Destination = 'stdout'
): FlushableWriter {
  let buffer: string[] = [];
  let flushing = false;

  const getTarget = (): typeof Bun.stdout | typeof Bun.stderr | string => {
    if (destination === 'stdout') return Bun.stdout;
    if (destination === 'stderr') return Bun.stderr;
    if (typeof destination === 'object' && 'path' in destination) return destination.path;
    throw new Error('Custom write functions do not support flush');
  };

  const writer: FlushableWriter = (data: string) => {
    buffer.push(data);

    if (!flushing) {
      queueMicrotask(() => writer.flush());
    }
  };

  writer.flush = async () => {
    if (buffer.length === 0) return;

    flushing = true;
    const data = buffer.join('');
    buffer = [];

    const target = getTarget();
    await Bun.write(target, data);

    flushing = false;
  };

  return writer;
}

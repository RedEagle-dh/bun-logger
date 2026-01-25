import type { Writer } from './stdout';

/**
 * File destination options
 */
export interface FileDestinationOptions {
  /** File path */
  path: string;
  /** Append to existing file (default: true) */
  append?: boolean;
  /** Sync writes (default: false) */
  sync?: boolean;
  /** Buffer size in bytes before flushing (default: 4096) */
  bufferSize?: number;
}

/**
 * Create a file destination writer using Bun's file API
 */
export function createFileDestination(options: FileDestinationOptions): Writer {
  const { path, append = true, sync = false, bufferSize = 4096 } = options;

  // Use Bun's file writer for efficient buffered writes
  const file = Bun.file(path);

  if (sync) {
    // Synchronous writes - less efficient but guaranteed order
    return (data: string) => {
      Bun.write(path, data, { append });
    };
  }

  // Buffered async writes
  let buffer = '';
  let flushScheduled = false;

  const flush = async () => {
    if (buffer.length === 0) return;
    const data = buffer;
    buffer = '';
    flushScheduled = false;

    try {
      await Bun.write(path, data, { append });
    } catch (err) {
      // Log write errors to stderr
      console.error(`[bun-logger] Failed to write to ${path}:`, err);
    }
  };

  return (data: string) => {
    buffer += data;

    if (buffer.length >= bufferSize) {
      // Flush immediately if buffer is full
      flush();
    } else if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(() => flush());
    }
  };
}

/**
 * Create a rotating file destination (basic implementation)
 */
export interface RotatingFileOptions extends FileDestinationOptions {
  /** Max file size in bytes before rotation (default: 10MB) */
  maxSize?: number;
  /** Max number of rotated files to keep (default: 5) */
  maxFiles?: number;
}

export function createRotatingFileDestination(options: RotatingFileOptions): Writer {
  const { path, maxSize = 10 * 1024 * 1024, maxFiles = 5, ...fileOptions } = options;

  let currentSize = 0;
  let rotating = false;

  // Get initial file size
  try {
    const file = Bun.file(path);
    currentSize = file.size;
  } catch {
    currentSize = 0;
  }

  const baseWriter = createFileDestination({ path, ...fileOptions });

  const rotate = async () => {
    if (rotating) return;
    rotating = true;

    try {
      // Rotate existing files
      for (let i = maxFiles - 1; i >= 1; i--) {
        const oldPath = `${path}.${i}`;
        const newPath = `${path}.${i + 1}`;
        try {
          const oldFile = Bun.file(oldPath);
          if (await oldFile.exists()) {
            await Bun.write(newPath, oldFile);
          }
        } catch {
          // Ignore rotation errors for individual files
        }
      }

      // Rotate current file to .1
      const currentFile = Bun.file(path);
      if (await currentFile.exists()) {
        await Bun.write(`${path}.1`, currentFile);
        // Truncate current file
        await Bun.write(path, '');
      }

      currentSize = 0;
    } finally {
      rotating = false;
    }
  };

  return (data: string) => {
    currentSize += data.length;

    if (currentSize >= maxSize && !rotating) {
      rotate();
    }

    baseWriter(data);
  };
}

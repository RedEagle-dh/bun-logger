import type { Serializer } from '../types';

/**
 * Headers that should be filtered from serialized request/response objects
 */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
]);

/**
 * Filter sensitive headers from a Headers object
 */
function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Serialized error structure
 */
export interface SerializedError {
  type: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: SerializedError;
  [key: string]: unknown;
}

/**
 * Error serializer - extracts useful properties from Error objects
 */
export const errorSerializer: Serializer<Error> = (err: Error): SerializedError => {
  if (!(err instanceof Error)) {
    return { type: 'Unknown', message: String(err) };
  }

  const serialized: SerializedError = {
    type: err.constructor.name,
    message: err.message,
  };

  if (err.stack) {
    serialized.stack = err.stack;
  }

  // Include code if present (common in Node.js errors)
  if ('code' in err && err.code !== undefined) {
    serialized.code = err.code as string | number;
  }

  // Include any additional enumerable properties
  for (const key of Object.keys(err)) {
    if (!['name', 'message', 'stack', 'code'].includes(key)) {
      serialized[key] = (err as unknown as Record<string, unknown>)[key];
    }
  }

  // Handle cause (ES2022)
  if (err.cause instanceof Error) {
    serialized.cause = errorSerializer(err.cause) as SerializedError;
  }

  return serialized;
};

/**
 * Request serializer for Bun's Request objects
 */
export const requestSerializer: Serializer<Request> = (req: Request) => {
  return {
    method: req.method,
    url: req.url,
    headers: filterHeaders(req.headers),
  };
};

/**
 * Response serializer for Bun's Response objects
 */
export const responseSerializer: Serializer<Response> = (res: Response) => {
  return {
    status: res.status,
    statusText: res.statusText,
    headers: filterHeaders(res.headers),
  };
};

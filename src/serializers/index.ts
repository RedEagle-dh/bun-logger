import type { Serializer } from '../types';
import { errorSerializer, requestSerializer, responseSerializer } from './error';

export { errorSerializer, requestSerializer, responseSerializer };

/**
 * Default serializers applied automatically
 */
export const defaultSerializers: Record<string, Serializer> = {
  err: errorSerializer,
  error: errorSerializer,
  req: requestSerializer,
  res: responseSerializer,
};

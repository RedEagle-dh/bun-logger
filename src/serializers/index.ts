import type { Serializer } from '../types';
import { errorSerializer, requestSerializer, responseSerializer } from './error';

export { errorSerializer, requestSerializer, responseSerializer };

/**
 * Default serializers applied automatically
 */
export const defaultSerializers: Record<string, Serializer> = {
  err: errorSerializer as Serializer,
  error: errorSerializer as Serializer,
  req: requestSerializer as Serializer,
  res: responseSerializer as Serializer,
};

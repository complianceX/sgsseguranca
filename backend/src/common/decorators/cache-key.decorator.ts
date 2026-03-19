import { SetMetadata } from '@nestjs/common';

export const CACHE_KEY_METADATA = 'cache:key';
export const CACHE_TTL_METADATA = 'cache:ttl';
type CacheKeyFactory = (...args: unknown[]) => string;

/**
 * Decorator to set cache key for a method
 * @param key Cache key or function to generate key from args
 * @param ttl Time to live in seconds (optional)
 */
export const CacheKey = (key: string | CacheKeyFactory, ttl?: number) => {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    SetMetadata(CACHE_KEY_METADATA, key)(target, propertyKey, descriptor);
    if (ttl) {
      SetMetadata(CACHE_TTL_METADATA, ttl)(target, propertyKey, descriptor);
    }
    return descriptor;
  };
};

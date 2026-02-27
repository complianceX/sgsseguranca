import { getTenantManager } from './tenant-context';
import { EntityTarget, ObjectLiteral, Repository } from 'typeorm';

export const getTenantRepository = <T extends ObjectLiteral>(
  entity: EntityTarget<T>,
): Repository<T> => {
  const manager = getTenantManager();
  return manager.getRepository(entity);
};

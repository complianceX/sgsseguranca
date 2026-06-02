import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AprFeatureFlagGuard } from '../guards/apr-feature-flag.guard';

export const APR_FEATURE_FLAG_KEY = 'apr_feature_flag_key';

export function AprFeatureFlag(key: string) {
  return applyDecorators(
    SetMetadata(APR_FEATURE_FLAG_KEY, key),
    UseGuards(AprFeatureFlagGuard),
  );
}

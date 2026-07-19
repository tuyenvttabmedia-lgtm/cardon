import { BuildInfoService } from '@cardon/build-info';

/** @deprecated Use BuildInfoService.resolveVersion() */
export const PARTNER_BUILD_VERSION = BuildInfoService.resolveVersion();

export { BuildInfoService };

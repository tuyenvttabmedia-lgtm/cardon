import { BuildInfoService } from '@cardon/build-info';

/** @deprecated Use BuildInfoService.resolveVersion() */
export const ADMIN_BUILD_VERSION = BuildInfoService.resolveVersion();

export { BuildInfoService };

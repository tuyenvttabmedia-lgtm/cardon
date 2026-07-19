import { SetMetadata } from '@nestjs/common';
import { MaintenanceModuleKey } from '../../settings/entities/settings.constants';

export const MAINTENANCE_MODULE_KEY = 'maintenanceModule';

export const MaintenanceModule = (module: MaintenanceModuleKey) =>
  SetMetadata(MAINTENANCE_MODULE_KEY, module);

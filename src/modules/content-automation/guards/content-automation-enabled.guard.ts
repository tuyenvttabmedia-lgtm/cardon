import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ContentAutomationConfigService } from '../services/content-automation-config.service';

@Injectable()
export class ContentAutomationEnabledGuard implements CanActivate {
  constructor(private readonly config: ContentAutomationConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (!this.config.isEnabled()) {
      throw new ServiceUnavailableException('Content Automation is disabled');
    }
    return true;
  }
}

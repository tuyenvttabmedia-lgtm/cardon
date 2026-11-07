import { ForbiddenException, Injectable } from '@nestjs/common';
import { ESIM_LIVE_HTTP_DISABLED } from './esim.constants';

/**
 * Phase A live adapter. It has no HTTP client.
 * Calling it always fails before any network I/O, including when ESIM_LIVE_ARM is set.
 */
@Injectable()
export class EsimLiveAdapter {
  create(): never {
    throw new ForbiddenException(ESIM_LIVE_HTTP_DISABLED);
  }

  query(): never {
    throw new ForbiddenException(ESIM_LIVE_HTTP_DISABLED);
  }
}

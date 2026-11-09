import { Global, Module } from '@nestjs/common';
import { AbuseRateLimitService } from './abuse-rate-limit.service';

@Global()
@Module({
  providers: [AbuseRateLimitService],
  exports: [AbuseRateLimitService],
})
export class AbuseRateLimitModule {}

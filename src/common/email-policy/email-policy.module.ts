import { Global, Module } from '@nestjs/common';
import { EmailPolicyService } from './email-policy.service';

@Global()
@Module({
  providers: [EmailPolicyService],
  exports: [EmailPolicyService],
})
export class EmailPolicyModule {}

import { Global, Module } from '@nestjs/common';
import { TurnstilePublicController } from './turnstile-public.controller';
import { TurnstileService } from './turnstile.service';

@Global()
@Module({
  controllers: [TurnstilePublicController],
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class TurnstileModule {}

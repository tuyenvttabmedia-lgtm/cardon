import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SubmitContactMessageDto } from '../dto/contact.dto';
import { ContactService } from '../services/contact.service';

@Controller('contact')
export class ContactPublicController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit(@Body() dto: SubmitContactMessageDto) {
    return this.contactService.submit(dto);
  }
}

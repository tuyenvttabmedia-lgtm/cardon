import { Controller, Get, Res } from '@nestjs/common';

import type { Response } from 'express';

import { HealthService } from './health.service';



@Controller('health')

export class HealthController {

  constructor(private readonly healthService: HealthService) {}



  @Get()

  check() {

    return this.healthService.check();

  }



  @Get('ready')

  async ready(@Res() res: Response) {

    const result = await this.healthService.checkReady();

    return res.status(result.ready ? 200 : 503).json(result);

  }

}



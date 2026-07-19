import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export interface CorrelationRequest extends Request {
  correlationId?: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: CorrelationRequest, res: Response, next: NextFunction): void {
    const header = req.headers['x-correlation-id'];
    const correlationId =
      typeof header === 'string' && header.trim().length > 0
        ? header.trim()
        : randomUUID();

    req.correlationId = correlationId;
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}

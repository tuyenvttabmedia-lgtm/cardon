import { Request } from 'express';
import { ActivityRequestContext } from '../../activity-event/interfaces/activity-event.interface';
import { CorrelationRequest } from '../../audit-log/middleware/correlation-id.middleware';

export function activityContextFromRequest(req: Request): ActivityRequestContext {
  const correlationReq = req as CorrelationRequest;
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress =
    typeof forwarded === 'string' && forwarded.length > 0
      ? forwarded.split(',')[0]?.trim()
      : req.ip ?? req.socket?.remoteAddress;

  return {
    ipAddress,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    sessionId: (req.headers['x-session-id'] as string | undefined) ?? null,
    correlationId: correlationReq.correlationId ?? null,
  };
}

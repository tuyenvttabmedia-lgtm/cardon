import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodeType } from '../constants/error-codes.constants';

export class AppHttpException extends HttpException {
  constructor(
    public readonly code: ErrorCodeType,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, status);
  }
}

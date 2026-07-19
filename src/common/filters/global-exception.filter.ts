import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ErrorCode } from '../constants/error-codes.constants';
import { AppHttpException } from '../exceptions/app-http.exception';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    [key: string]: unknown;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.resolveException(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private resolveException(exception: unknown): {
    status: number;
    body: ErrorBody;
  } {
    if (exception instanceof AppHttpException) {
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.details ?? {}),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      return this.handleHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid database query parameters',
          },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      },
    };
  }

  private handleHttpException(exception: HttpException): {
    status: number;
    body: ErrorBody;
  } {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return {
        status,
        body: {
          success: false,
          error: {
            code: ErrorCode.RATE_LIMITED,
            message: 'Quá nhiều lần thử. Vui lòng thử lại sau vài phút.',
          },
        },
      };
    }

    if (status === HttpStatus.BAD_REQUEST && this.isValidationResponse(response)) {
      const message = this.formatValidationMessage(response.message);
      return {
        status,
        body: {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message,
          },
        },
      };
    }

    const message =
      typeof response === 'string'
        ? response
        : typeof response === 'object' && response !== null && 'message' in response
          ? String((response as { message: string | string[] }).message)
          : exception.message;

    return {
      status,
      body: {
        success: false,
        error: {
          code: this.mapHttpStatusToCode(status),
          message: Array.isArray(message) ? message.join('; ') : message,
        },
      },
    };
  }

  private handlePrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): { status: number; body: ErrorBody } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            success: false,
            error: {
              code: ErrorCode.CONFLICT,
              message: 'Resource already exists',
            },
          },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: {
            success: false,
            error: {
              code: ErrorCode.NOT_FOUND,
              message: 'Resource not found',
            },
          },
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          body: {
            success: false,
            error: {
              code: ErrorCode.DATABASE_ERROR,
              message: 'Database operation failed',
            },
          },
        };
    }
  }

  private isValidationResponse(
    response: string | object,
  ): response is { message: string[] } {
    return (
      typeof response === 'object' &&
      response !== null &&
      'message' in response &&
      Array.isArray((response as { message: unknown }).message)
    );
  }

  private formatValidationMessage(messages: string[]): string {
    return messages.join('; ');
  }

  private mapHttpStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}

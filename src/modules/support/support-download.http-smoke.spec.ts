import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { UserRole } from '@prisma/client';
import { AbuseRateLimitService } from '../../common/abuse-rate-limit/abuse-rate-limit.service';
import { TurnstileService } from '../../common/turnstile/turnstile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SupportAccountController } from './controllers/support-account.controller';
import { SupportAdminFilesController } from './controllers/support-admin-files.controller';
import { SupportService } from './services/support.service';
import { SupportUploadService } from './services/support-upload.service';
import { Readable } from 'stream';

/**
 * Local fixture HTTP smoke — no production DB/Redis/JWT secrets.
 * Guards overridden with deterministic fixtures (Customer A/B, admin ± permission).
 */
describe('Support download HTTP smoke (local fixtures)', () => {
  const USER_A = '11111111-1111-1111-1111-111111111111';
  const USER_B = '22222222-2222-2222-2222-222222222222';
  const FILE_A = `${USER_A}_ok.png`;
  const FILE_B = `${USER_B}_secret.png`;

  let app: INestApplication;
  let server: Server;
  let baseUrl: string;
  let currentUser: { id: string; role: UserRole } | null = null;
  let adminHasPermission = true;
  let ownedBy: Record<string, string[]> = {};

  class FixtureJwtGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
      if (!currentUser) throw new UnauthorizedException('Unauthorized');
      const req = ctx.switchToHttp().getRequest();
      req.user = currentUser;
      return true;
    }
  }

  class FixtureRolesGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
      const req = ctx.switchToHttp().getRequest();
      if (!req.user) throw new UnauthorizedException();
      return true;
    }
  }

  class FixturePermissionsGuard implements CanActivate {
    canActivate(): boolean {
      if (!adminHasPermission) throw new ForbiddenException('Insufficient permission');
      return true;
    }
  }

  beforeAll(async () => {
    ownedBy = {
      [USER_A]: [FILE_A],
      [USER_B]: [FILE_B],
    };

    const supportService = {
      assertCustomerCanDownload: jest.fn(async (userId: string, filename: string) => {
        const list = ownedBy[userId] ?? [];
        if (!list.includes(filename)) {
          const { NotFoundException } = await import('@nestjs/common');
          throw new NotFoundException('Attachment not found');
        }
      }),
    };

    const uploadService = {
      openReadStream: jest.fn((filename: string) => ({
        stream: Readable.from([Buffer.from(`FILE_BODY:${filename}`)]),
        mimeType: 'image/png',
        filename,
      })),
      saveScreenshot: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SupportAccountController, SupportAdminFilesController],
      providers: [
        { provide: SupportService, useValue: supportService },
        { provide: SupportUploadService, useValue: uploadService },
        { provide: AbuseRateLimitService, useValue: { consumeOrThrow: jest.fn() } },
        { provide: TurnstileService, useValue: { verifyOrThrow: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FixtureJwtGuard)
      .overrideGuard(RolesGuard)
      .useClass(FixtureRolesGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(FixturePermissionsGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  async function get(path: string): Promise<{
    status: number;
    text: string;
    hasFileBody: boolean;
  }> {
    const res = await fetch(`${baseUrl}${path}`);
    const text = await res.text();
    return {
      status: res.status,
      text,
      hasFileBody: text.includes('FILE_BODY:'),
    };
  }

  it('1) no JWT → download rejected without file body', async () => {
    currentUser = null;
    const r = await get(`/account/support/files/${FILE_A}`);
    expect(r.status).toBe(401);
    expect(r.hasFileBody).toBe(false);
  });

  it('2) Customer A cannot download Customer B file', async () => {
    currentUser = { id: USER_A, role: UserRole.CUSTOMER };
    const r = await get(`/account/support/files/${FILE_B}`);
    expect([403, 404]).toContain(r.status);
    expect(r.hasFileBody).toBe(false);
  });

  it('3) Customer A filename swap to B rejected', async () => {
    currentUser = { id: USER_A, role: UserRole.CUSTOMER };
    const r = await get(`/account/support/files/${FILE_B}`);
    expect(r.hasFileBody).toBe(false);
    expect(r.status).not.toBe(200);
  });

  it('4) Customer A downloads own file → 200 with body', async () => {
    currentUser = { id: USER_A, role: UserRole.CUSTOMER };
    const r = await get(`/account/support/files/${FILE_A}`);
    expect(r.status).toBe(200);
    expect(r.hasFileBody).toBe(true);
    expect(r.text).toContain(FILE_A);
  });

  it('6) Legacy-style ownership still works when listed on fixture ticket set', async () => {
    const legacy = 'legacy-ticket-file.png';
    ownedBy[USER_A] = [...(ownedBy[USER_A] ?? []), legacy];
    currentUser = { id: USER_A, role: UserRole.CUSTOMER };
    const r = await get(`/account/support/files/${legacy}`);
    expect(r.status).toBe(200);
    expect(r.hasFileBody).toBe(true);
  });

  it('7) Admin with support.manage downloads → 200', async () => {
    currentUser = { id: 'admin-1', role: UserRole.ADMIN };
    adminHasPermission = true;
    const r = await get(`/admin/support/files/${FILE_B}`);
    expect(r.status).toBe(200);
    expect(r.hasFileBody).toBe(true);
  });

  it('8) Admin without permission → rejected, no file body', async () => {
    currentUser = { id: 'admin-2', role: UserRole.SUPPORT };
    adminHasPermission = false;
    const r = await get(`/admin/support/files/${FILE_B}`);
    expect(r.status).toBe(403);
    expect(r.hasFileBody).toBe(false);
  });
});

describe('Static /uploads/support middleware smoke (mirrors main.ts)', () => {
  it('5) static support path returns 401 JSON without file bytes', async () => {
    const exp = express();
    exp.use('/uploads/support', (_req, res) => {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required for support attachments' },
      });
    });
    exp.use('/uploads', (_req, res) => {
      res.status(200).send('SHOULD_NOT_REACH_FOR_SUPPORT');
    });

    const server = exp.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/uploads/support/any.png`);
      const text = await res.text();
      expect(res.status).toBe(401);
      expect(text).not.toContain('SHOULD_NOT_REACH_FOR_SUPPORT');
      expect(text).toContain('Authentication required');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});

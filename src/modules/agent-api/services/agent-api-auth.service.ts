import {
  Injectable,
} from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { AgentStatus } from '@prisma/client';
import { AppHttpException } from '../../../common/exceptions/app-http.exception';
import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { AgentCredentialService, hashApiKeyForLookup } from '../../agent/services/agent-credential.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { AgentSecurityService } from '../../agent-security-center/services/agent-security.service';
import {
  buildSignaturePayload,
  verifyPartnerSignature,
} from '../entities/agent-api-signature';
import { AgentApiContext } from '../entities/agent-api.mapper';

@Injectable()
export class AgentApiAuthService {
  constructor(
    private readonly agentRepository: AgentRepository,
    private readonly credentialService: AgentCredentialService,
    private readonly securityService: AgentSecurityService,
  ) {}

  async authenticate(params: {
    apiKey: string;
    signature: string;
    requestId: string;
    method: string;
    path: string;
    rawBody: string;
    clientIp: string | null;
  }): Promise<AgentApiContext> {
    const logBase = {
      ip: params.clientIp,
      path: params.path,
      method: params.method,
    };

    if (!params.apiKey || !params.signature || !params.requestId) {
      throw new AppHttpException(
        ErrorCode.INVALID_API_KEY,
        'Missing authentication headers',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const lookup = hashApiKeyForLookup(params.apiKey);
    const agent = await this.agentRepository.findByApiKeyLookup(lookup);

    if (!agent?.apiKeyHash || !agent.secretKeyEncrypted) {
      this.securityService.recordAuthFailure(null, 'INVALID_KEY', {
        ...logBase,
        message: 'Invalid API key',
      });
      throw new AppHttpException(
        ErrorCode.INVALID_API_KEY,
        'Invalid API key',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const securityConfig = this.securityService.parseSecurityConfig(agent.securityConfig);
    if (
      securityConfig.apiKeyExpiresAt &&
      Date.parse(securityConfig.apiKeyExpiresAt) < Date.now()
    ) {
      this.securityService.recordAuthFailure(agent.id, 'EXPIRED_KEY', {
        ...logBase,
        message: 'API key expired',
      });
      throw new AppHttpException(
        ErrorCode.INVALID_API_KEY,
        'API key expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!this.credentialService.verifyApiKey(params.apiKey, agent.apiKeyHash)) {
      this.securityService.recordAuthFailure(agent.id, 'INVALID_KEY', {
        ...logBase,
        message: 'Invalid API key',
      });
      throw new AppHttpException(
        ErrorCode.INVALID_API_KEY,
        'Invalid API key',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!this.securityService.checkIpWhitelist(agent.id, agent.securityConfig, params.clientIp)) {
      this.securityService.recordAuthFailure(agent.id, 'BLOCKED_IP', {
        ...logBase,
        message: 'IP not in whitelist',
      });
      throw new AppHttpException(
        ErrorCode.FORBIDDEN,
        'IP address not allowed',
        HttpStatus.FORBIDDEN,
      );
    }

    if (agent.status === AgentStatus.SUSPENDED) {
      this.securityService.recordAuthFailure(agent.id, 'FORBIDDEN', {
        ...logBase,
        message: 'Agent suspended',
      });
      throw new AppHttpException(
        ErrorCode.AGENT_SUSPENDED,
        'Agent account is suspended',
        HttpStatus.FORBIDDEN,
      );
    }

    if (agent.status !== AgentStatus.ACTIVE || !agent.apiEnabled) {
      this.securityService.recordAuthFailure(agent.id, 'FORBIDDEN', {
        ...logBase,
        message: 'Agent inactive',
      });
      throw new AppHttpException(
        ErrorCode.AGENT_INACTIVE,
        'Agent account is not active',
        HttpStatus.FORBIDDEN,
      );
    }

    const secretKey = this.credentialService.decryptSecretKey(
      agent.secretKeyEncrypted,
    );
    const payload = buildSignaturePayload(
      params.method,
      params.path,
      params.requestId,
      params.rawBody,
    );

    if (!verifyPartnerSignature(secretKey, payload, params.signature)) {
      this.securityService.recordAuthFailure(agent.id, 'INVALID_SIGNATURE', {
        ...logBase,
        message: 'Invalid signature',
      });
      throw new AppHttpException(
        ErrorCode.INVALID_SIGNATURE,
        'Invalid request signature',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.agentRepository.touchLastUsedAt(agent.id);
    void this.securityService.validateApiAccess({
      agentId: agent.id,
      clientIp: params.clientIp,
      method: params.method,
      path: params.path,
      success: true,
    });

    return {
      agent,
      requestId: params.requestId,
      secretKey,
    };
  }
}

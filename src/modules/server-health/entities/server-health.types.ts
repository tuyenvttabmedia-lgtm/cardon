export type ServerComponentStatus = 'ok' | 'error' | 'stale' | 'unknown';

export type ServerOverallStatus = 'OK' | 'DEGRADED' | 'DOWN';

export interface ServerComponentCheck {
  status: ServerComponentStatus;
  latencyMs: number | null;
  detail?: string | null;
}

export interface ServerWorkerCheck {
  status: ServerComponentStatus;
  ageMs: number | null;
  lastHeartbeatAt: string | null;
  buildVersion: string | null;
  required: boolean;
}

export interface ServerProcessSnapshot {
  uptimeSec: number;
  pid: number;
  nodeVersion: string;
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  externalMb: number;
  eventLoopLagMs: number;
}

export interface ServerQueueSnapshot {
  waitingJobs: number;
  activeJobs: number;
  delayedJobs: number;
  failedJobs: number;
  redisStatus: 'ok' | 'error' | 'unknown';
  workerConnected: boolean;
}

export interface ServerHealthPack {
  overall: ServerOverallStatus;
  ready: boolean;
  checkedAt: string;
  buildVersion: string;
  gitCommit: string | null;
  appRole: string;
  database: ServerComponentCheck;
  redis: ServerComponentCheck;
  workers: ServerWorkerCheck;
  process: ServerProcessSnapshot;
  queues: ServerQueueSnapshot | null;
  links: {
    systemHealth: string;
    queues: string;
    configurationHealth: string;
  };
}

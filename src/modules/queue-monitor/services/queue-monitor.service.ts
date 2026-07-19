import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  SystemAuditAction,
  SystemAuditResource,
  UserRole,
} from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AuditLogService } from '../../audit-log/services/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { QUEUE_NAMES, QueueName } from '../../../queue/queue.constants';
import {
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SEC,
} from '../../../queue/worker-heartbeat.service';
import { QueueCleanDto, QueueHistoryQueryDto, QueueJobsQueryDto, BulkJobsDto } from '../dto/queue-monitor.dto';
import {
  BullJobStatus,
  JOB_STATUS_LIST,
  QUEUE_DISPLAY_NAMES,
  QUEUE_FAILED_ALERT_THRESHOLD,
} from '../entities/queue-monitor.constants';
import { QUEUE_READONLY_CONFIG } from '../entities/queue-config.constants';
import { maskQueuePayload } from '../utils/queue-payload-mask.util';
import {
  computeQueueHealth,
  percentile,
  QueueHealth,
  WORKER_HEARTBEAT_ALERT_MS,
  DELAYED_WARNING_THRESHOLD,
  RETRY_WARNING_THRESHOLD,
} from '../utils/queue-health.util';
import { matchesJobSearch } from '../utils/queue-job-search.util';
import { buildJobTimeline } from '../utils/queue-job-timeline.util';

export interface QueueSummaryRow {
  name: QueueName;
  displayName: string;
  status: 'running' | 'paused' | 'unknown';
  health: QueueHealth;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
  workerCount: number;
  workerOnline: boolean;
  redisStatus: 'ok' | 'error' | 'unknown';
  failureRatePct: number;
  lastActivityAt: string | null;
  avgProcessingTimeMs: number | null;
  retryCount: number;
}

export interface DashboardThroughput {
  jobsPerSec: number;
  jobsPerMinute: number;
  jobsPerHour: number;
  avgProcessingTimeMs: number | null;
  avgWaitingTimeMs: number | null;
  retryRate: number;
  failureRate: number;
}

export interface DashboardSummary {
  totalQueues: number;
  activeJobs: number;
  waitingJobs: number;
  delayedJobs: number;
  completedToday: number;
  failedJobs: number;
  retryingJobs: number;
  pausedQueues: number;
  criticalQueues: number;
  warningQueues: number;
  redisStatus: 'ok' | 'error' | 'unknown';
  workerConnected: boolean;
  throughput: DashboardThroughput;
}

@Injectable()
export class QueueMonitorService {
  private readonly queues: Map<QueueName, Queue>;
  private lastAlertAt = 0;

  constructor(
    @InjectQueue('payment_queue') paymentQueue: Queue,
    @InjectQueue('provider_queue') providerQueue: Queue,
    @InjectQueue('topup_queue') topupQueue: Queue,
    @InjectQueue('email_queue') emailQueue: Queue,
    @InjectQueue('reconciliation_queue') reconciliationQueue: Queue,
    @InjectQueue('notification_queue') notificationQueue: Queue,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly auditLogService: AuditLogService,
  ) {
    this.queues = new Map([
      ['payment_queue', paymentQueue],
      ['provider_queue', providerQueue],
      ['topup_queue', topupQueue],
      ['email_queue', emailQueue],
      ['reconciliation_queue', reconciliationQueue],
      ['notification_queue', notificationQueue],
    ]);
  }

  private getQueue(name: string): Queue {
    if (!QUEUE_NAMES.includes(name as QueueName)) {
      throw new NotFoundException(`Queue not found: ${name}`);
    }
    return this.queues.get(name as QueueName)!;
  }

  async listQueues() {
    const redisStatus = await this.checkRedis();
    const workerHeartbeat = await this.getWorkerHeartbeat();
    const workerConnected = workerHeartbeat.connected;
    const rows: QueueSummaryRow[] = [];
    let completedToday = 0;

    for (const name of QUEUE_NAMES) {
      rows.push(await this.buildQueueRow(name, workerConnected, redisStatus));
      completedToday += await this.countCompletedToday(this.queues.get(name)!);
    }

    const throughput = await this.buildThroughput();
    const summary = this.buildDashboardSummary(
      rows,
      redisStatus,
      workerConnected,
      completedToday,
      throughput,
    );
    await this.checkAlerts(summary, workerConnected, workerHeartbeat, rows);

    return { summary, queues: rows };
  }

  async getQueueDetail(name: string) {
    const queue = this.getQueue(name);
    const redisStatus = await this.checkRedis();
    const workerConnected = (await this.getWorkerHeartbeat()).connected;
    const row = await this.buildQueueRow(name as QueueName, workerConnected, redisStatus);
    const isPaused = await queue.isPaused();
    const config = this.getQueueConfig(name);
    return {
      ...row,
      isPaused,
      config,
    };
  }

  async listJobs(name: string, query: QueueJobsQueryDto) {
    const queue = this.getQueue(name);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const status = query.status ?? 'waiting';

    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let jobs = await queue.getJobs([status], start, end, query.sort === 'oldest');

    if (query.job_id?.trim()) {
      const needle = query.job_id.trim();
      jobs = jobs.filter((j) => String(j.id).includes(needle));
    }
    if (query.correlation_id?.trim()) {
      const needle = query.correlation_id.trim().toLowerCase();
      jobs = jobs.filter((j) => (this.extractCorrelationId(j) ?? '').toLowerCase().includes(needle));
    }
    if (query.request_id?.trim()) {
      const needle = query.request_id.trim().toLowerCase();
      jobs = jobs.filter((j) => (this.extractRequestId(j) ?? '').toLowerCase().includes(needle));
    }
    if (query.order_id?.trim()) {
      jobs = jobs.filter((j) => matchesJobSearch(j, query.order_id!.trim()));
    }
    if (query.payment_id?.trim()) {
      jobs = jobs.filter((j) => matchesJobSearch(j, query.payment_id!.trim()));
    }
    if (query.customer_email?.trim()) {
      jobs = jobs.filter((j) => matchesJobSearch(j, query.customer_email!.trim()));
    }
    if (query.provider_transaction?.trim()) {
      jobs = jobs.filter((j) => matchesJobSearch(j, query.provider_transaction!.trim()));
    }
    if (query.keyword?.trim()) {
      jobs = jobs.filter((j) => matchesJobSearch(j, query.keyword!.trim()));
    }
    if (query.date_from || query.date_to) {
      jobs = jobs.filter((j) => this.inDateRange(j, query.date_from, query.date_to));
    }

    const counts = await queue.getJobCounts(...JOB_STATUS_LIST);
    const total = counts[status] ?? jobs.length;

    return {
      items: jobs.map((job) => this.mapJob(name as QueueName, job)),
      total,
      page,
      limit,
      status,
    };
  }

  async getJob(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return this.mapJobDetail(queueName as QueueName, job);
  }

  async getStatistics(name: string) {
    const queue = this.getQueue(name);
    const counts = await queue.getJobCounts(...JOB_STATUS_LIST);
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [completedTodayJobs, failedTodayJobs, recentCompleted, recentFailed, waitingJobs] =
      await Promise.all([
        queue.getJobs(['completed'], 0, 499, false),
        queue.getJobs(['failed'], 0, 499, false),
        queue.getJobs(['completed'], 0, 499, false),
        queue.getJobs(['failed'], 0, 499, false),
        queue.getJobs(['waiting'], 0, 499, true),
      ]);

    const completedToday = completedTodayJobs.filter(
      (j) => j.finishedOn && j.finishedOn >= startOfToday.getTime(),
    ).length;
    const failedToday = failedTodayJobs.filter(
      (j) => j.finishedOn && j.finishedOn >= startOfToday.getTime(),
    ).length;

    const processingTimes = recentCompleted
      .map((j) => this.jobDurationMs(j))
      .filter((ms): ms is number => ms !== null);
    const avgProcessingTimeMs =
      processingTimes.length > 0
        ? Math.round(processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length)
        : null;
    const p95ProcessingTimeMs = percentile(processingTimes, 95);

    const waitingTimes = recentCompleted
      .map((j) => (j.processedOn && j.timestamp ? j.processedOn - j.timestamp : null))
      .filter((ms): ms is number => ms !== null);
    const avgWaitingTimeMs =
      waitingTimes.length > 0
        ? Math.round(waitingTimes.reduce((a, b) => a + b, 0) / waitingTimes.length)
        : null;

    const totalDone = (counts.completed ?? 0) + (counts.failed ?? 0);
    const successRate = totalDone > 0 ? ((counts.completed ?? 0) / totalDone) * 100 : 100;
    const failureRate = totalDone > 0 ? ((counts.failed ?? 0) / totalDone) * 100 : 0;
    const retries = recentFailed.reduce(
      (sum, j) => sum + Math.max(0, (j.attemptsMade ?? 1) - 1),
      0,
    );
    const retryRate = totalDone > 0 ? (retries / totalDone) * 100 : 0;

    const hourly = this.buildHourlyChart(recentCompleted, recentFailed);
    const hourWindow = 60 * 60 * 1000;
    const jobsPerHour = recentCompleted.filter(
      (j) => j.finishedOn && now - j.finishedOn < hourWindow,
    ).length;
    const minuteWindow = 60_000;
    const jobsPerMinute = recentCompleted.filter(
      (j) => j.finishedOn && now - j.finishedOn < minuteWindow,
    ).length;

    const durationsWithJobs = recentCompleted
      .map((j) => ({ id: String(j.id), ms: this.jobDurationMs(j) }))
      .filter((x): x is { id: string; ms: number } => x.ms !== null);
    const longestJob =
      durationsWithJobs.length > 0
        ? durationsWithJobs.reduce((a, b) => (b.ms > a.ms ? b : a))
        : null;

    const oldestWaiting =
      waitingJobs.length > 0
        ? {
            id: String(waitingJobs[0].id),
            createdAt: waitingJobs[0].timestamp
              ? new Date(waitingJobs[0].timestamp).toISOString()
              : null,
            waitingMs: waitingJobs[0].timestamp ? now - waitingJobs[0].timestamp : null,
          }
        : null;

    return {
      queue: name,
      displayName: QUEUE_DISPLAY_NAMES[name as QueueName],
      counts,
      completedToday,
      failedToday,
      avgProcessingTimeMs,
      p95ProcessingTimeMs,
      avgWaitingTimeMs,
      jobsPerMinute,
      jobsPerHour,
      jobsPerSec: Math.round((jobsPerMinute / 60) * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
      failureRate: Math.round(failureRate * 100) / 100,
      retryRate: Math.round(retryRate * 100) / 100,
      retries,
      longestJob,
      oldestWaiting,
      hourly,
    };
  }

  async getHistory(name: string, query: QueueHistoryQueryDto) {
    const queue = this.getQueue(name);
    const { from, to, bucketMs, labelFormat } = this.resolveHistoryRange(query);
    const completed = await queue.getJobs(['completed'], 0, 999, false);
    const failed = await queue.getJobs(['failed'], 0, 999, false);
    const buckets = this.buildHistoryBuckets(from, to, bucketMs, labelFormat);

    for (const job of completed) {
      if (!job.finishedOn || job.finishedOn < from || job.finishedOn > to) continue;
      const key = this.bucketKey(job.finishedOn, bucketMs);
      if (buckets[key]) buckets[key].completed += 1;
    }
    for (const job of failed) {
      if (!job.finishedOn || job.finishedOn < from || job.finishedOn > to) continue;
      const key = this.bucketKey(job.finishedOn, bucketMs);
      if (buckets[key]) {
        buckets[key].failed += 1;
        buckets[key].retry += Math.max(0, (job.attemptsMade ?? 1) - 1);
      }
    }

    const counts = await queue.getJobCounts('waiting', 'delayed');
    const waitingSnapshot = (counts.waiting ?? 0) + (counts.delayed ?? 0);
    const bucketList = Object.values(buckets);
    if (bucketList.length > 0) {
      bucketList[bucketList.length - 1].waiting = waitingSnapshot;
    }

    return {
      queue: name,
      displayName: QUEUE_DISPLAY_NAMES[name as QueueName],
      range: query.range ?? '24h',
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      buckets: bucketList,
    };
  }

  async getWorkers(name: string) {
    const queue = this.getQueue(name);
    const heartbeat = await this.getWorkerHeartbeat();
    const workers = await queue.getWorkers().catch(() => []);
    const config = QUEUE_READONLY_CONFIG[name as QueueName];

    return {
      queue: name,
      displayName: QUEUE_DISPLAY_NAMES[name as QueueName],
      configuredWorkerCount: config.workerCount,
      workers: workers.map((worker, index) => {
        const meta = worker as Record<string, unknown>;
        const addr = typeof meta.addr === 'string' ? meta.addr : null;
        const started =
          typeof meta.started === 'number'
            ? meta.started
            : typeof meta.started === 'string'
              ? Number(meta.started)
              : null;
        const online =
          heartbeat.connected &&
          heartbeat.ageMs != null &&
          heartbeat.ageMs < WORKER_HEARTBEAT_ALERT_MS;
        return {
          name: String(meta.name ?? meta.id ?? `worker-${index + 1}`),
          status: online ? 'online' : 'offline',
          pid: this.parseWorkerField(addr, 'pid'),
          hostname: this.parseWorkerHostname(meta, addr),
          startedAt: started ? new Date(started).toISOString() : null,
          uptimeMs: started ? Date.now() - started : null,
          memoryUsageMb: null,
          cpuUsagePct: null,
          lastHeartbeatAt: heartbeat.at,
          lastHeartbeatAgeMs: heartbeat.ageMs,
        };
      }),
      globalHeartbeat: heartbeat,
    };
  }

  getQueueConfig(name: string) {
    if (!QUEUE_NAMES.includes(name as QueueName)) {
      throw new NotFoundException(`Queue not found: ${name}`);
    }
    return {
      queue: name,
      displayName: QUEUE_DISPLAY_NAMES[name as QueueName],
      readonly: true,
      ...QUEUE_READONLY_CONFIG[name as QueueName],
    };
  }

  async bulkJobs(
    queueName: string,
    dto: BulkJobsDto,
    user: AuthenticatedUser,
    ctx: OperationContext,
  ) {
    let processed = 0;
    let failed = 0;
    for (const jobId of dto.job_ids) {
      try {
        const job = await this.requireJob(queueName, jobId);
        if (dto.action === 'retry') await job.retry();
        else if (dto.action === 'promote') await job.promote();
        else if (dto.action === 'remove') await job.remove();
        processed += 1;
      } catch {
        failed += 1;
      }
    }
    this.logOperation(user, ctx, queueName, `bulk_${dto.action}`, {
      jobIds: dto.job_ids,
      processed,
      failed,
    });
    return { ok: true, processed, failed };
  }

  async removeAllCompleted(queueName: string, user: AuthenticatedUser, ctx: OperationContext) {
    const queue = this.getQueue(queueName);
    const removed = await queue.clean(0, 5000, 'completed');
    this.logOperation(user, ctx, queueName, 'remove_all_completed', { removed: removed.length });
    return { ok: true, removed: removed.length };
  }

  async pauseQueue(name: string, user: AuthenticatedUser, ctx: OperationContext) {
    const queue = this.getQueue(name);
    await queue.pause();
    this.logOperation(user, ctx, name, 'pause');
    return { ok: true, paused: true };
  }

  async resumeQueue(name: string, user: AuthenticatedUser, ctx: OperationContext) {
    const queue = this.getQueue(name);
    await queue.resume();
    this.logOperation(user, ctx, name, 'resume');
    return { ok: true, paused: false };
  }

  async cleanQueue(name: string, dto: QueueCleanDto, user: AuthenticatedUser, ctx: OperationContext) {
    const queue = this.getQueue(name);
    const status = dto.status ?? 'completed';
    const removed = await queue.clean(dto.grace_ms ?? 0, dto.limit ?? 1000, status);
    this.logOperation(user, ctx, name, 'clean', { status, removed: removed.length });
    return { ok: true, removed: removed.length };
  }

  async retryJob(queueName: string, jobId: string, user: AuthenticatedUser, ctx: OperationContext) {
    const job = await this.requireJob(queueName, jobId);
    await job.retry();
    this.logOperation(user, ctx, queueName, 'retry_job', { jobId });
    return { ok: true };
  }

  async promoteJob(queueName: string, jobId: string, user: AuthenticatedUser, ctx: OperationContext) {
    const job = await this.requireJob(queueName, jobId);
    await job.promote();
    this.logOperation(user, ctx, queueName, 'promote_job', { jobId });
    return { ok: true };
  }

  async removeJob(queueName: string, jobId: string, user: AuthenticatedUser, ctx: OperationContext) {
    const job = await this.requireJob(queueName, jobId);
    await job.remove();
    this.logOperation(user, ctx, queueName, 'remove_job', { jobId });
    return { ok: true };
  }

  async retryAllFailed(queueName: string, user: AuthenticatedUser, ctx: OperationContext) {
    const queue = this.getQueue(queueName);
    const failed = await queue.getJobs(['failed'], 0, 499, false);
    let retried = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retried += 1;
      } catch {
        // skip jobs that cannot retry
      }
    }
    this.logOperation(user, ctx, queueName, 'retry_all_failed', { retried });
    return { ok: true, retried };
  }

  private async requireJob(queueName: string, jobId: string): Promise<Job> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  private async buildQueueRow(
    name: QueueName,
    workerConnected: boolean,
    redisStatus: 'ok' | 'error' | 'unknown',
  ): Promise<QueueSummaryRow> {
    const queue = this.queues.get(name)!;
    const redisOk = redisStatus === 'ok';
    try {
      const counts = await queue.getJobCounts(...JOB_STATUS_LIST);
      const isPaused = await queue.isPaused();
      const workers = await queue.getWorkers().catch(() => []);
      const workerOnline =
        workers.length > 0 || (workerConnected && QUEUE_READONLY_CONFIG[name].workerCount > 0);
      const recent = await queue.getJobs(['completed', 'failed', 'active'], 0, 9, false);
      const lastActivity = recent
        .map((j) => j.finishedOn ?? j.processedOn ?? j.timestamp)
        .filter(Boolean)
        .sort((a, b) => (b ?? 0) - (a ?? 0))[0];

      const completedRecent = await queue.getJobs(['completed'], 0, 49, false);
      const durations = completedRecent
        .map((j) => this.jobDurationMs(j))
        .filter((ms): ms is number => ms !== null);
      const avgProcessingTimeMs =
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null;

      const failedRecent = await queue.getJobs(['failed'], 0, 49, false);
      const retryCount = failedRecent.reduce(
        (sum, j) => sum + Math.max(0, (j.attemptsMade ?? 1) - 1),
        0,
      );

      const total = (counts.failed ?? 0) + (counts.completed ?? 0);
      const failureRatePct =
        total > 0 ? Math.round(((counts.failed ?? 0) / total) * 10000) / 100 : 0;

      const health = computeQueueHealth({
        isPaused,
        redisOk,
        workerOnline,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
        delayed: counts.delayed ?? 0,
        retryCount,
      });

      return {
        name,
        displayName: QUEUE_DISPLAY_NAMES[name],
        status: isPaused ? 'paused' : 'running',
        health,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        paused: counts.paused ?? 0,
        workerCount: workers.length > 0 ? workers.length : workerConnected ? 1 : 0,
        workerOnline,
        redisStatus,
        failureRatePct,
        lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null,
        avgProcessingTimeMs,
        retryCount,
      };
    } catch {
      return {
        name,
        displayName: QUEUE_DISPLAY_NAMES[name],
        status: 'unknown',
        health: 'CRITICAL',
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 0,
        paused: 0,
        workerCount: 0,
        workerOnline: false,
        redisStatus,
        failureRatePct: 0,
        lastActivityAt: null,
        avgProcessingTimeMs: null,
        retryCount: 0,
      };
    }
  }

  private buildDashboardSummary(
    rows: QueueSummaryRow[],
    redisStatus: 'ok' | 'error' | 'unknown',
    workerConnected: boolean,
    completedToday: number,
    throughput: DashboardThroughput,
  ): DashboardSummary {
    return {
      totalQueues: rows.length,
      activeJobs: rows.reduce((s, r) => s + r.active, 0),
      waitingJobs: rows.reduce((s, r) => s + r.waiting, 0),
      delayedJobs: rows.reduce((s, r) => s + r.delayed, 0),
      completedToday,
      failedJobs: rows.reduce((s, r) => s + r.failed, 0),
      retryingJobs: rows.reduce((s, r) => s + r.retryCount, 0),
      pausedQueues: rows.filter((r) => r.status === 'paused').length,
      criticalQueues: rows.filter((r) => r.health === 'CRITICAL').length,
      warningQueues: rows.filter((r) => r.health === 'WARNING').length,
      redisStatus,
      workerConnected,
      throughput,
    };
  }

  private async buildThroughput(): Promise<DashboardThroughput> {
    const now = Date.now();
    const minuteWindow = 60_000;
    const hourWindow = 60 * 60 * 1000;
    let completedMinute = 0;
    let completedHour = 0;
    const processingTimes: number[] = [];
    const waitingTimes: number[] = [];
    let totalFailed = 0;
    let totalCompleted = 0;
    let totalRetries = 0;

    for (const name of QUEUE_NAMES) {
      const queue = this.queues.get(name)!;
      try {
        const counts = await queue.getJobCounts('completed', 'failed');
        totalCompleted += counts.completed ?? 0;
        totalFailed += counts.failed ?? 0;
        const [completed, failed] = await Promise.all([
          queue.getJobs(['completed'], 0, 199, false),
          queue.getJobs(['failed'], 0, 99, false),
        ]);
        for (const job of completed) {
          if (job.finishedOn && now - job.finishedOn < minuteWindow) completedMinute += 1;
          if (job.finishedOn && now - job.finishedOn < hourWindow) completedHour += 1;
          const dur = this.jobDurationMs(job);
          if (dur !== null) processingTimes.push(dur);
          if (job.processedOn && job.timestamp) waitingTimes.push(job.processedOn - job.timestamp);
        }
        totalRetries += failed.reduce(
          (sum, j) => sum + Math.max(0, (j.attemptsMade ?? 1) - 1),
          0,
        );
      } catch {
        // skip queue
      }
    }

    const totalDone = totalCompleted + totalFailed;
    return {
      jobsPerSec: Math.round((completedMinute / 60) * 100) / 100,
      jobsPerMinute: completedMinute,
      jobsPerHour: completedHour,
      avgProcessingTimeMs:
        processingTimes.length > 0
          ? Math.round(processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length)
          : null,
      avgWaitingTimeMs:
        waitingTimes.length > 0
          ? Math.round(waitingTimes.reduce((a, b) => a + b, 0) / waitingTimes.length)
          : null,
      retryRate:
        totalDone > 0 ? Math.round((totalRetries / totalDone) * 10000) / 100 : 0,
      failureRate:
        totalDone > 0 ? Math.round((totalFailed / totalDone) * 10000) / 100 : 0,
    };
  }

  private async countCompletedToday(queue: Queue): Promise<number> {
    try {
      const jobs = await queue.getJobs(['completed'], 0, 499, false);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return jobs.filter((j) => j.finishedOn && j.finishedOn >= start.getTime()).length;
    } catch {
      return 0;
    }
  }

  private buildHourlyChart(completed: Job[], failed: Job[]) {
    const buckets: Record<
      string,
      { hour: string; completed: number; failed: number; waiting: number; active: number; retry: number }
    > = {};
    const now = Date.now();
    for (let i = 23; i >= 0; i -= 1) {
      const t = new Date(now - i * 60 * 60 * 1000);
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:00`;
      buckets[key] = { hour: key, completed: 0, failed: 0, waiting: 0, active: 0, retry: 0 };
    }

    for (const job of completed) {
      if (!job.finishedOn) continue;
      const key = this.hourKey(job.finishedOn);
      if (buckets[key]) buckets[key].completed += 1;
    }
    for (const job of failed) {
      if (!job.finishedOn) continue;
      const key = this.hourKey(job.finishedOn);
      if (buckets[key]) {
        buckets[key].failed += 1;
        buckets[key].retry += Math.max(0, (job.attemptsMade ?? 1) - 1);
      }
    }

    return Object.values(buckets);
  }

  private hourKey(ts: number): string {
    const t = new Date(ts);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:00`;
  }

  private mapJob(queueName: QueueName, job: Job) {
    return {
      id: String(job.id),
      queue: queueName,
      displayName: QUEUE_DISPLAY_NAMES[queueName],
      name: job.name,
      status: this.resolveJobStatus(job),
      priority: job.opts.priority ?? 0,
      attempts: job.attemptsMade ?? 0,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      durationMs: this.jobDurationMs(job),
      correlationId: this.extractCorrelationId(job),
      requestId: this.extractRequestId(job),
    };
  }

  private mapJobDetail(queueName: QueueName, job: Job) {
    const data = job.data as Record<string, unknown> | undefined;
    return {
      ...this.mapJob(queueName, job),
      payload: maskQueuePayload(job.data),
      result: maskQueuePayload(job.returnvalue),
      error: job.failedReason ?? null,
      stackTrace: job.stacktrace ?? [],
      maxAttempts: job.opts.attempts ?? null,
      logs: [],
      timeline: buildJobTimeline(job),
      orderId: this.extractField(data, 'orderId', 'order_id'),
      paymentId: this.extractField(data, 'paymentId', 'payment_id'),
      customerEmail: this.extractField(data, 'customerEmail', 'customer_email', 'email'),
      providerTransaction: this.extractField(
        data,
        'providerTransaction',
        'provider_transaction',
        'transactionId',
        'transaction_id',
      ),
    };
  }

  private resolveJobStatus(job: Job): BullJobStatus {
    if (job.finishedOn && job.failedReason) return 'failed';
    if (job.finishedOn) return 'completed';
    if (awaitingDelay(job)) return 'delayed';
    if (job.processedOn) return 'active';
    return 'waiting';
  }

  private jobDurationMs(job: Job): number | null {
    if (!job.processedOn || !job.finishedOn) return null;
    return job.finishedOn - job.processedOn;
  }

  private extractCorrelationId(job: Job): string | null {
    const data = job.data as Record<string, unknown> | undefined;
    const val = data?.correlationId ?? data?.correlation_id;
    return typeof val === 'string' ? val : null;
  }

  private extractRequestId(job: Job): string | null {
    const data = job.data as Record<string, unknown> | undefined;
    const val = data?.requestId ?? data?.request_id ?? job.id;
    return val != null ? String(val) : null;
  }

  private inDateRange(job: Job, dateFrom?: string, dateTo?: string): boolean {
    const ts = job.timestamp ?? 0;
    if (dateFrom && ts < new Date(dateFrom).getTime()) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (ts > end.getTime()) return false;
    }
    return true;
  }

  private async checkRedis(): Promise<'ok' | 'error' | 'unknown'> {
    try {
      const queue = this.queues.get('provider_queue')!;
      await queue.getJobCounts('waiting');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private extractField(
    data: Record<string, unknown> | undefined,
    ...keys: string[]
  ): string | null {
    if (!data) return null;
    for (const key of keys) {
      const val = data[key];
      if (val != null) return String(val);
    }
    return null;
  }

  private async getWorkerHeartbeat(): Promise<{
    connected: boolean;
    at: string | null;
    ageMs: number | null;
  }> {
    try {
      const queue = this.queues.get('provider_queue')!;
      const client = await queue.client;
      const raw = await client.get(WORKER_HEARTBEAT_KEY);
      if (!raw) return { connected: false, at: null, ageMs: null };
      const ts = Number(raw);
      const ageMs = Date.now() - ts;
      return {
        connected: ageMs < WORKER_HEARTBEAT_TTL_SEC * 1000,
        at: new Date(ts).toISOString(),
        ageMs,
      };
    } catch {
      return { connected: false, at: null, ageMs: null };
    }
  }

  private resolveHistoryRange(query: QueueHistoryQueryDto) {
    const now = Date.now();
    let from = now - 24 * 60 * 60 * 1000;
    let to = now;
    let bucketMs = 60 * 60 * 1000;
    let labelFormat: 'hour' | 'day' = 'hour';

    if (query.range === '7d') {
      from = now - 7 * 24 * 60 * 60 * 1000;
      bucketMs = 24 * 60 * 60 * 1000;
      labelFormat = 'day';
    } else if (query.range === '30d') {
      from = now - 30 * 24 * 60 * 60 * 1000;
      bucketMs = 24 * 60 * 60 * 1000;
      labelFormat = 'day';
    } else if (query.range === 'custom') {
      if (query.date_from) from = new Date(query.date_from).getTime();
      if (query.date_to) {
        const end = new Date(query.date_to);
        end.setHours(23, 59, 59, 999);
        to = end.getTime();
      }
      const span = to - from;
      if (span > 3 * 24 * 60 * 60 * 1000) {
        bucketMs = 24 * 60 * 60 * 1000;
        labelFormat = 'day';
      }
    }

    return { from, to, bucketMs, labelFormat };
  }

  private buildHistoryBuckets(
    from: number,
    to: number,
    bucketMs: number,
    labelFormat: 'hour' | 'day',
  ) {
    const buckets: Record<
      string,
      { label: string; completed: number; failed: number; retry: number; waiting: number }
    > = {};
    for (let t = from; t <= to; t += bucketMs) {
      const key = String(Math.floor(t / bucketMs));
      const d = new Date(t);
      const label =
        labelFormat === 'hour'
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      buckets[key] = { label, completed: 0, failed: 0, retry: 0, waiting: 0 };
    }
    return buckets;
  }

  private bucketKey(ts: number, bucketMs: number): string {
    return String(Math.floor(ts / bucketMs));
  }

  private parseWorkerHostname(
    meta: Record<string, unknown>,
    addr: string | null,
  ): string | null {
    if (typeof meta.hostname === 'string') return meta.hostname;
    if (addr) {
      const host = addr.split(':')[0];
      return host || addr;
    }
    return null;
  }

  private parseWorkerField(addr: string | null, _field: string): string | null {
    return null;
  }

  private async checkAlerts(
    summary: DashboardSummary,
    workerConnected: boolean,
    heartbeat: { connected: boolean; ageMs: number | null },
    rows: QueueSummaryRow[],
  ) {
    const now = Date.now();
    if (now - this.lastAlertAt < 60_000) return;
    this.lastAlertAt = now;

    const dispatch = (
      title: string,
      description: string,
      severity: SystemActivitySeverity,
      metadata: Record<string, unknown>,
      resourceId?: string,
      resourceDisplay?: string,
    ) => {
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.QUEUE_FAILED,
        eventCategory: SystemActivityEventCategory.QUEUE,
        severity,
        source: SystemActivitySource.SYSTEM,
        resource: 'queue',
        resourceId,
        resourceDisplay,
        title,
        description,
        metadata,
      });
    };

    if (summary.redisStatus !== 'ok') {
      dispatch(
        'Redis Disconnect',
        'Queue monitor cannot reach Redis',
        SystemActivitySeverity.CRITICAL,
        { alert: 'redis_disconnect' },
      );
    }

    if (
      !workerConnected ||
      (heartbeat.ageMs !== null && heartbeat.ageMs > WORKER_HEARTBEAT_ALERT_MS)
    ) {
      dispatch(
        'Worker Offline',
        'Worker heartbeat missing or stale (>60s)',
        SystemActivitySeverity.CRITICAL,
        { alert: 'worker_offline', ageMs: heartbeat.ageMs },
      );
    }

    if (summary.failedJobs > QUEUE_FAILED_ALERT_THRESHOLD) {
      dispatch(
        'Failed Jobs Spike',
        `${summary.failedJobs} failed jobs across queues`,
        SystemActivitySeverity.WARNING,
        { alert: 'failed_spike', failedJobs: summary.failedJobs },
      );
    }

    if (summary.retryingJobs > RETRY_WARNING_THRESHOLD) {
      dispatch(
        'Retry Spike',
        `${summary.retryingJobs} retries detected across queues`,
        SystemActivitySeverity.WARNING,
        { alert: 'retry_spike', retries: summary.retryingJobs },
      );
    }

    if (summary.delayedJobs > DELAYED_WARNING_THRESHOLD) {
      dispatch(
        'Delay Too High',
        `${summary.delayedJobs} delayed jobs across queues`,
        SystemActivitySeverity.WARNING,
        { alert: 'delay_high', delayed: summary.delayedJobs },
      );
    }

    for (const row of rows) {
      if (row.status === 'paused') {
        dispatch(
          'Queue Paused',
          `${row.displayName} queue is paused`,
          SystemActivitySeverity.CRITICAL,
          { alert: 'queue_paused', queue: row.name },
          row.name,
          row.displayName,
        );
      }
    }
  }

  private logOperation(
    user: AuthenticatedUser,
    ctx: OperationContext,
    queueName: string,
    operation: string,
    metadata?: Record<string, unknown>,
  ) {
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.QUEUE_RETRY,
      eventCategory: SystemActivityEventCategory.QUEUE,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.ADMIN,
      resource: 'queue',
      resourceId: queueName,
      resourceDisplay: QUEUE_DISPLAY_NAMES[queueName as QueueName] ?? queueName,
      title: `Queue ${operation}`,
      description: `${operation} on ${queueName}`,
      performedBy: user.id,
      performedEmail: user.email,
      performedRole: user.role,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      correlationId: ctx.correlationId ?? null,
      metadata: { operation, queue: queueName, ...metadata },
    });

    this.auditLogService.create({
      resource: SystemAuditResource.SYSTEM,
      resourceId: queueName,
      resourceName: QUEUE_DISPLAY_NAMES[queueName as QueueName] ?? queueName,
      action: this.mapAuditAction(operation),
      fieldName: operation,
      oldValue: null,
      newValue: metadata ?? { operation },
      performedBy: user.id,
      performedEmail: user.email,
      performedRole: user.role as UserRole,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      sessionId: ctx.sessionId ?? null,
      correlationId: ctx.correlationId ?? null,
      reason: `Queue monitor: ${operation}`,
    });
  }

  private mapAuditAction(operation: string): SystemAuditAction {
    if (operation.includes('remove') || operation === 'clean') return SystemAuditAction.DELETE;
    if (operation === 'pause') return SystemAuditAction.DISABLE;
    if (operation === 'resume') return SystemAuditAction.ENABLE;
    return SystemAuditAction.UPDATE;
  }
}

function awaitingDelay(job: Job): boolean {
  return Boolean(job.opts.delay && job.opts.delay > 0 && !job.processedOn);
}

export interface OperationContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
}

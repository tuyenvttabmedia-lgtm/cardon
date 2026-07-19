import { Job } from 'bullmq';

export interface JobTimelineStep {
  step: string;
  label: string;
  at: string | null;
  durationMs: number | null;
}

export function buildJobTimeline(job: Job): JobTimelineStep[] {
  const steps: JobTimelineStep[] = [];
  const created = job.timestamp ?? null;

  steps.push({
    step: 'created',
    label: 'Created',
    at: created ? new Date(created).toISOString() : null,
    durationMs: null,
  });

  if (created) {
    steps.push({
      step: 'waiting',
      label: 'Waiting',
      at: new Date(created).toISOString(),
      durationMs: job.processedOn ? job.processedOn - created : null,
    });
  }

  if (job.processedOn) {
    steps.push({
      step: 'active',
      label: 'Active',
      at: new Date(job.processedOn).toISOString(),
      durationMs: job.finishedOn ? job.finishedOn - job.processedOn : null,
    });
  }

  const attempts = job.attemptsMade ?? 0;
  if (attempts > 1) {
    for (let i = 1; i < attempts; i += 1) {
      steps.push({
        step: 'retry',
        label: `Retry #${i}`,
        at: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        durationMs: null,
      });
    }
  }

  if (job.finishedOn) {
    if (job.failedReason) {
      steps.push({
        step: 'failed',
        label: 'Failed',
        at: new Date(job.finishedOn).toISOString(),
        durationMs: null,
      });
      if (attempts < (job.opts.attempts ?? 3)) {
        steps.push({
          step: 'retry_pending',
          label: 'Retry pending',
          at: new Date(job.finishedOn).toISOString(),
          durationMs: null,
        });
      }
    } else {
      steps.push({
        step: 'completed',
        label: 'Completed',
        at: new Date(job.finishedOn).toISOString(),
        durationMs: job.processedOn ? job.finishedOn - job.processedOn : null,
      });
    }
  }

  return steps;
}

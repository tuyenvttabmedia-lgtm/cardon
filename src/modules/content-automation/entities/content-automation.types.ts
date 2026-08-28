import { AiTaskType } from '@prisma/client';
import type { ContentAutomationJobName } from './content-automation.constants';

export interface ContentAutomationQueueJobData {
  planId: string;
  task: AiTaskType;
  generationEpoch: number;
  jobName: ContentAutomationJobName;
}

export interface ContentAutomationStatusView {
  enabled: boolean;
  queue: string;
  version: string;
}

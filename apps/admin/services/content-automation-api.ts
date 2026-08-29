import { apiRequest } from '@/services/api-client';
import type {
  ContentAutomationContext,
  ContentAutomationStatus,
  ContentAiRunDetail,
  ContentAiRunListItem,
  ContentPlanDetail,
  ContentPlanListResponse,
  InternalLinkCandidate,
} from '@/types/api';

export interface CreateContentPlanInput {
  topic: string;
  primaryKeyword: string;
  searchIntent: string;
  contentType: string;
  audience?: string;
  businessObjective?: string;
  priority?: string;
  suggestedTitle?: string;
  supportingKeywords?: string[];
  angle?: string;
  adminNotes?: string;
}

export interface UpdateContentPlanInput {
  topic?: string;
  primaryKeyword?: string;
  searchIntent?: string;
  contentType?: string;
  audience?: string | null;
  businessObjective?: string | null;
  priority?: string;
  suggestedTitle?: string | null;
  supportingKeywords?: string[];
  angle?: string | null;
  adminNotes?: string | null;
  factVariantIds?: string[];
  action?: string;
}

export const contentAutomationApi = {
  status(): Promise<ContentAutomationStatus> {
    return apiRequest('/admin/content-automation/status');
  },

  listPlans(params?: {
    status?: string;
    contentType?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<ContentPlanListResponse> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.contentType) qs.set('contentType', params.contentType);
    if (params?.q) qs.set('q', params.q);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return apiRequest(`/admin/content-automation/plans${query ? `?${query}` : ''}`);
  },

  getPlan(id: string): Promise<ContentPlanDetail> {
    return apiRequest(`/admin/content-automation/plans/${id}`);
  },

  getPlanContext(id: string): Promise<ContentAutomationContext> {
    return apiRequest(`/admin/content-automation/plans/${id}/context`);
  },

  listAiRuns(planId: string): Promise<{ items: ContentAiRunListItem[] }> {
    return apiRequest(`/admin/content-automation/plans/${planId}/ai-runs`);
  },

  getAiRun(id: string): Promise<ContentAiRunDetail> {
    return apiRequest(`/admin/content-automation/ai-runs/${id}`);
  },

  createPlan(body: CreateContentPlanInput): Promise<ContentPlanDetail> {
    return apiRequest('/admin/content-automation/plans', { method: 'POST', body });
  },

  updatePlan(id: string, body: UpdateContentPlanInput): Promise<ContentPlanDetail> {
    return apiRequest(`/admin/content-automation/plans/${id}`, { method: 'PATCH', body });
  },

  archivePlan(id: string): Promise<ContentPlanDetail> {
    return apiRequest(`/admin/content-automation/plans/${id}/archive`, { method: 'POST' });
  },

  restorePlan(id: string): Promise<ContentPlanDetail> {
    return apiRequest(`/admin/content-automation/plans/${id}/restore`, { method: 'POST' });
  },

  deletePlan(id: string): Promise<{ deleted: true; id: string; cmsPageId: string | null }> {
    return apiRequest(`/admin/content-automation/plans/${id}/delete`, { method: 'POST' });
  },

  analyzePlan(id: string): Promise<{ jobId: string; aiRunId: string; reused?: boolean }> {
    return apiRequest(`/admin/content-automation/plans/${id}/analyze`, { method: 'POST' });
  },

  generateOutline(id: string): Promise<{ jobId: string; aiRunId: string; reused?: boolean; generationEpoch: number }> {
    return apiRequest(`/admin/content-automation/plans/${id}/generate-outline`, { method: 'POST' });
  },

  approveOutline(id: string): Promise<ContentPlanDetail> {
    return apiRequest(`/admin/content-automation/plans/${id}/approve-outline`, { method: 'POST' });
  },

  rejectOutline(id: string): Promise<ContentPlanDetail> {
    return apiRequest(`/admin/content-automation/plans/${id}/reject-outline`, { method: 'POST' });
  },

  generateArticle(id: string): Promise<{ jobId: string; aiRunId: string; reused?: boolean; generationEpoch: number }> {
    return apiRequest(`/admin/content-automation/plans/${id}/generate-article`, { method: 'POST' });
  },

  runQualityGate(id: string): Promise<ContentPlanDetail> {
    return apiRequest(`/admin/content-automation/plans/${id}/run-quality-gate`, { method: 'POST' });
  },

  approveContent(id: string): Promise<ContentPlanDetail> {
    return apiRequest(`/admin/content-automation/plans/${id}/approve-content`, { method: 'POST' });
  },

  rejectContent(id: string, mode: 're-write' | 're-outline' = 're-write'): Promise<ContentPlanDetail> {
    return apiRequest(`/admin/content-automation/plans/${id}/reject-content`, {
      method: 'POST',
      body: { mode },
    });
  },

  createCmsDraft(id: string, force = false): Promise<{ cmsPageId: string; created: boolean; slug: string }> {
    return apiRequest(`/admin/content-automation/plans/${id}/create-cms-draft`, {
      method: 'POST',
      body: { force },
    });
  },

  getPreview(id: string): Promise<{ html: string }> {
    return apiRequest(`/admin/content-automation/plans/${id}/preview`);
  },

  listInternalLinkCandidates(params?: {
    planId?: string;
    keyword?: string;
    excludePageId?: string;
    limit?: number;
  }): Promise<InternalLinkCandidate[]> {
    const qs = new URLSearchParams();
    if (params?.planId) qs.set('planId', params.planId);
    if (params?.keyword) qs.set('keyword', params.keyword);
    if (params?.excludePageId) qs.set('excludePageId', params.excludePageId);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return apiRequest(`/admin/content-automation/internal-link-candidates${query ? `?${query}` : ''}`);
  },
};

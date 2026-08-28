/** Internal link candidate — AI/backend only; no href from client. */
export interface InternalLinkCandidate {
  targetPageId: string;
  anchorText: string;
  reason: string;
  confidence: number;
  validated: boolean;
  validationError?: string;
  publicPath?: string;
}

export interface InternalLinkCandidateQuery {
  planId?: string;
  keyword?: string;
  excludePageId?: string;
  limit?: number;
}

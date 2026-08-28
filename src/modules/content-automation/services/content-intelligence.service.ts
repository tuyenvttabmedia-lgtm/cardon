import { Injectable } from '@nestjs/common';
import type { IntelligenceSnapshotV1 } from '../entities/intelligence-snapshot.types';
import type { GenerationContext } from '../entities/generation-context.types';
import { HeuristicAnalyzeStrategy } from '../strategies/heuristic-analyze.strategy';

/** M2 heuristic helpers — used by tests; production analyze via AiOrchestrator. */
@Injectable()
export class ContentIntelligenceService {
  constructor(private readonly heuristic: HeuristicAnalyzeStrategy) {}

  buildHeuristicSnapshot(context: GenerationContext): IntelligenceSnapshotV1 {
    return this.heuristic.buildSnapshot(context);
  }
}

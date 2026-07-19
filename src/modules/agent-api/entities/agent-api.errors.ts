export class DuplicateAgentRequestError extends Error {
  constructor() {
    super('DUPLICATE_AGENT_REQUEST');
    this.name = 'DuplicateAgentRequestError';
  }
}

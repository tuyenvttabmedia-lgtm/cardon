export interface PromptTemplateDocument {
  task: string;
  version: string;
  systemPrompt: string;
  userTemplate: string;
  outputSchema?: Record<string, unknown>;
  modelConfig?: {
    temperature?: number;
    maxTokens?: number;
  };
}

export interface ComposedPrompt {
  key: string;
  version: string;
  systemPrompt: string;
  userPrompt: string;
  modelConfig: {
    temperature: number;
    maxTokens: number;
  };
}

export function parsePromptTemplateContent(raw: string): PromptTemplateDocument {
  const parsed = JSON.parse(raw) as PromptTemplateDocument;
  if (!parsed.systemPrompt || !parsed.userTemplate || !parsed.version) {
    throw new Error('Invalid prompt template document');
  }
  return parsed;
}

export function renderUserTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
}

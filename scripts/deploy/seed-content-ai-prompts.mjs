/**
 * Idempotent seed for content.analyze / content.outline / content.write prompts.
 * Safe on production (does not run full prisma seed).
 *
 * Usage (API container):
 *   node scripts/deploy/seed-content-ai-prompts.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROMPTS = [
  {
    key: 'content.analyze',
    version: '1.0.0',
    content: JSON.stringify({
      task: 'ANALYZE',
      version: '1.0.0',
      systemPrompt:
        'You are a content intelligence assistant for CardOn.vn. Respond ONLY with a single JSON object (no markdown). Use Vietnamese for reason/title text. Never invent product prices, SKUs, or URLs. Only reference pageId values provided in the user context. Do not include href or http links. recommendation.action must be one of: CREATE, UPDATE, MERGE, IGNORE. cannibalization.risk must be one of: NONE, LOW, HIGH.',
      userTemplate: `Analyze this content plan:
Topic: {{topic}}
Primary keyword: {{primaryKeyword}}
Search intent: {{searchIntent}}
Content type: {{contentType}}
Audience: {{audience}}
Business objective: {{businessObjective}}
Angle: {{angle}}
Supporting keywords: {{supportingKeywords}}

Brand: {{siteName}} / {{companyName}}

Verified product facts (backend only):
{{factSummary}}

Existing published content (pageId references only):
{{existingContentSummary}}

Validated internal link candidates:
{{linkCandidatesSummary}}

Return EXACTLY this JSON shape (arrays may be empty; pageId must come from context or be null on recommendations):
{
  "relatedContent": [{ "pageId": "<uuid from context>", "title": "", "similarityScore": 0.0, "reason": "" }],
  "cannibalization": { "risk": "NONE", "matches": [{ "pageId": "<uuid>", "title": "", "focusKeyword": null, "score": 0.0 }] },
  "recommendations": [{ "action": "CREATE", "pageId": null, "confidence": 0.9, "reason": "" }],
  "internalLinkCandidates": [{ "pageId": "<uuid>", "title": "", "relevanceScore": 0.0 }],
  "supportingKeywords": ["optional"]
}`,
      modelConfig: { temperature: 0.2, maxTokens: 4096 },
    }),
  },
  {
    key: 'content.outline',
    version: '1.0.0',
    content: JSON.stringify({
      task: 'OUTLINE',
      version: '1.0.0',
      systemPrompt:
        'You are a content strategist for CardOn.vn. Respond ONLY with valid JSON. Use Vietnamese. Never invent prices, SKUs, or URLs. Only use pageId values from context.',
      userTemplate: `Create a detailed outline for:
Topic: {{topic}}
Primary keyword: {{primaryKeyword}}
Search intent: {{searchIntent}}
Content type: {{contentType}}
Suggested title: {{suggestedTitle}}
Intelligence snapshot: {{intelligenceSnapshot}}

Return JSON: { title, excerpt?, sections: [{ id, heading, level: 2|3, summary, keyPoints[], targetWordCount? }], seoNotes?: { metaTitleHint?, metaDescriptionHint? } }`,
      modelConfig: { temperature: 0.4, maxTokens: 4096 },
    }),
  },
  {
    key: 'content.write',
    version: '1.0.0',
    content: JSON.stringify({
      task: 'WRITE',
      version: '1.0.0',
      systemPrompt:
        'You are a content writer for CardOn.vn. Respond ONLY with valid JSON ArticleDocument schemaVersion 1.0. Use Vietnamese. Never invent product prices or SKUs. Internal links use targetPageId from context only — no href URLs.',
      userTemplate: `Write a full article from this approved outline:
Topic: {{topic}}
Primary keyword: {{primaryKeyword}}
Outline: {{approvedOutline}}
Facts: {{factSummary}}
Link candidates: {{linkCandidatesSummary}}

Return JSON ArticleDocument with schemaVersion "1.0", title, excerpt, seo { metaTitle, metaDescription, focusKeyword, robots }, sections (blocks: paragraph, h2, h3, ul, ol, blockquote, internalLink, faq), factRefs, internalLinks, qualityFlags.`,
      modelConfig: { temperature: 0.5, maxTokens: 8192 },
    }),
  },
];

async function main() {
  for (const p of PROMPTS) {
    await prisma.aiPromptTemplate.upsert({
      where: { key_version: { key: p.key, version: p.version } },
      update: { content: p.content, isActive: true },
      create: {
        key: p.key,
        version: p.version,
        content: p.content,
        isActive: true,
      },
    });
    console.log(`upserted ${p.key}@${p.version}`);
  }
  console.log('content AI prompts ready');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

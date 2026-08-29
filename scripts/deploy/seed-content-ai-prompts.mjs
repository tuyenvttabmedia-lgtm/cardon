/**
 * Idempotent seed for content.analyze / content.outline / content.write prompts.
 * Safe on production (does not run full prisma seed).
 *
 * Usage (API container):
 *   node scripts/deploy/seed-content-ai-prompts.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STRUCTURE_RULES = `
STRUCTURE RULES by contentType (MUST follow):

If contentType is TROUBLESHOOTING:
- Outline/article must include these sections in order:
  1) H2 Triệu chứng / dấu hiệu gặp phải (use ul for symptoms)
  2) H2 Nguyên nhân phổ biến with 3–4 H3 groups (vd. phía người dùng, mạng/thiết bị, ngân hàng/cổng thanh toán, phía CardOn)
  3) H2 Cách xử lý từng bước — writer MUST emit type "ol" with 5–8 concrete steps for CardOn checkout (not one long paragraph)
  4) H2 Khi nào cần liên hệ hỗ trợ (ul: thông tin cần chuẩn bị: mã đơn, thời điểm, ảnh màn hình…)
  5) FAQ block (type "faq", 3–5 items) — outline may list FAQ questions as keyPoints under an H2 FAQ
  6) Optional H2 Tham khảo thêm with internalLink blocks only (targetPageId from context)
- Forbidden: wall-of-text paragraphs; generic filler ("tiện lợi và phổ biến", "gây lo lắng"); inventing fake VietQR "enter QR code" flows
- Prefer short paragraphs (≤3 sentences). Prefer ul/ol/h3/faq over long prose
- Title/H1 must be SEO-ready with primary keyword; do NOT use headings like "Giới thiệu…", "Nội dung chính", "Kết luận" alone

If contentType is TUTORIAL:
- Must include numbered steps as outline keyPoints; writer MUST use type "ol"
- Include prerequisites (ul) and expected result

If contentType is GUIDE / EXPLAINER / COMPARISON / PRODUCT / NEWS / FAQ / PROMOTION:
- Use clear H2/H3 hierarchy; mix paragraph + ul; avoid 4+ consecutive long paragraphs
- Include at least one scannable list (ul or ol)
- Optional FAQ when it helps SEO

General for ALL types:
- sections in ArticleDocument is a FLAT array of blocks (never nested type "section")
- Allowed block types only: paragraph, h2, h3, ul, ol, blockquote, table, image, internalLink, faq, callout
- Never invent product prices, SKUs, or http URLs; internal links use targetPageId from context only
- Vietnamese body copy; actionable and specific to CardOn.vn when relevant
`.trim();

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
    version: '1.1.0',
    content: JSON.stringify({
      task: 'OUTLINE',
      version: '1.1.0',
      systemPrompt: `You are a content strategist for CardOn.vn. Respond ONLY with valid JSON outline. Use Vietnamese headings/summaries. Never invent prices, SKUs, or URLs. Only use pageId values from context.

${STRUCTURE_RULES}`,
      userTemplate: `Create a detailed outline for:
Topic: {{topic}}
Primary keyword: {{primaryKeyword}}
Search intent: {{searchIntent}}
Content type: {{contentType}}
Suggested title: {{suggestedTitle}}
Angle: {{angle}}
Intelligence snapshot: {{intelligenceSnapshot}}

${STRUCTURE_RULES}

Return JSON:
{
  "title": "SEO H1 including primary keyword",
  "excerpt": "1-2 sentences",
  "sections": [
    { "id": "sec-1", "heading": "", "level": 2, "summary": "", "keyPoints": ["..."], "targetWordCount": 120 },
    { "id": "sec-1a", "heading": "", "level": 3, "summary": "", "keyPoints": ["..."], "targetWordCount": 80 }
  ],
  "seoNotes": { "metaTitleHint": "", "metaDescriptionHint": "" }
}`,
      modelConfig: { temperature: 0.35, maxTokens: 4096 },
    }),
  },
  {
    key: 'content.write',
    version: '1.1.0',
    content: JSON.stringify({
      task: 'WRITE',
      version: '1.1.0',
      systemPrompt: `You are a content writer for CardOn.vn. Respond ONLY with a single JSON ArticleDocument (no markdown). schemaVersion must be "1.0". Use Vietnamese. Never invent product prices or SKUs. Never include href or http URLs. Internal links must use targetPageId from context only. IMPORTANT: sections is a FLAT array of content blocks. Never use type "section". Allowed block types only: paragraph, h2, h3, ul, ol, blockquote, table, image, internalLink, faq, callout.

${STRUCTURE_RULES}`,
      userTemplate: `Write a full article from this approved outline:
Topic: {{topic}}
Primary keyword: {{primaryKeyword}}
Search intent: {{searchIntent}}
Content type: {{contentType}}
Angle: {{angle}}
Outline: {{approvedOutline}}
Facts: {{factSummary}}
Link candidates: {{linkCandidatesSummary}}

${STRUCTURE_RULES}

Return EXACTLY this JSON shape (sections must be flat blocks, not nested outline sections):
{
  "schemaVersion": "1.0",
  "title": "",
  "excerpt": "",
  "seo": { "metaTitle": "", "metaDescription": "", "focusKeyword": "", "robots": "index,follow" },
  "sections": [
    { "id": "blk-1", "type": "paragraph", "text": "..." },
    { "id": "blk-2", "type": "h2", "text": "..." },
    { "id": "blk-3", "type": "h3", "text": "..." },
    { "id": "blk-4", "type": "ul", "items": ["...", "..."] },
    { "id": "blk-5", "type": "ol", "items": ["Bước 1: ...", "Bước 2: ..."] },
    { "id": "blk-6", "type": "faq", "faqItems": [{ "question": "...", "answer": "..." }] },
    { "id": "blk-7", "type": "internalLink", "targetPageId": "<uuid from context>", "anchorText": "..." }
  ],
  "factRefs": [],
  "internalLinks": [{ "sectionId": "blk-7", "targetPageId": "<uuid>", "anchorText": "...", "validated": true }],
  "qualityFlags": []
}`,
      modelConfig: { temperature: 0.35, maxTokens: 8192 },
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
    // Keep only this version active for the key (analyze stays 1.0.0).
    await prisma.aiPromptTemplate.updateMany({
      where: { key: p.key, NOT: { version: p.version } },
      data: { isActive: false },
    });
    console.log(`upserted ${p.key}@${p.version} (other versions deactivated)`);
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

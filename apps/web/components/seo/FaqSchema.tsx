import { plainTextFromFaqHtml } from '@/lib/sanitize-faq-html';

export type FaqSchemaItem = {
  question: string;
  answerHtml: string;
};

export function FaqSchema({
  question,
  answerHtml,
  items,
}: {
  question?: string;
  answerHtml?: string;
  items?: FaqSchemaItem[];
}) {
  const entities =
    items && items.length > 0
      ? items.map((item) => ({
          '@type': 'Question' as const,
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer' as const,
            text: plainTextFromFaqHtml(item.answerHtml),
          },
        }))
      : question && answerHtml
        ? [
            {
              '@type': 'Question' as const,
              name: question,
              acceptedAnswer: {
                '@type': 'Answer' as const,
                text: plainTextFromFaqHtml(answerHtml),
              },
            },
          ]
        : [];

  if (entities.length === 0) return null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entities,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

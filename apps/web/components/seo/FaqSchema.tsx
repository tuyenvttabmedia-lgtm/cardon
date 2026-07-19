import { plainTextFromFaqHtml } from '@/lib/sanitize-faq-html';

export function FaqSchema({ question, answerHtml }: { question: string; answerHtml: string }) {
  const text = plainTextFromFaqHtml(answerHtml);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text,
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

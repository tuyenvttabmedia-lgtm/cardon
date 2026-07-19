import { cn } from '@/lib/utils';

export function PageHero({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-cardon-border bg-gradient-to-br from-cardon-navy to-cardon-blue px-5 py-8 text-white shadow-card md:px-8 md:py-10',
        className,
      )}
    >
      <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-sm text-white/85 md:text-base">{subtitle}</p>}
    </section>
  );
}

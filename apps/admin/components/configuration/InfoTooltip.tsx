export function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      className="ml-1.5 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold leading-none text-zinc-600"
      title={text}
      aria-label={text}
      role="img"
    >
      ⓘ
    </span>
  );
}

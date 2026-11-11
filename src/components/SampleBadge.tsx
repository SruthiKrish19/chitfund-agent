export default function SampleBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Seeded sample circle for reviewers of the hosted demo"
      className={`inline-flex items-center rounded border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 ${className}`}
    >
      Sample
    </span>
  );
}

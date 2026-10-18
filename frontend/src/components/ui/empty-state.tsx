export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-10">
      <h2 className="text-[16px] font-medium">{title}</h2>
      <p className="mt-1 max-w-md text-[13px] text-muted">{body}</p>
    </div>
  );
}

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function Placeholder({
  title,
  description,
  body,
  crumbs,
}: {
  title: string;
  description: string;
  body: string;
  crumbs?: { href?: string; label: string }[];
}) {
  return (
    <>
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}
      <PageHeader title={title} description={description} />
      <EmptyState title="Nothing on the desk yet" body={body} />
    </>
  );
}

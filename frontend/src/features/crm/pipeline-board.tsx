"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMe } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DropdownItem, DropdownMenu } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { can } from "@/lib/permissions";
import { requiredMissing, useCrmMutations, useOpportunities, usePipelines, type CustomField, type Opportunity } from "./api";
import { CustomInputs, packedCustom } from "./custom-inputs";
import { Problem } from "./problem";

export function PipelineBoard() {
  const me = useMe();
  const toast = useToast();
  const pipelines = usePipelines(me.isSuccess);
  const [chosen, setChosen] = useState<string | null>(null);
  const [mode, setMode] = useState<"board" | "list">("board");
  const items = pipelines.data?.items ?? [];
  const pipeline = items.find((item) => item.id === (chosen ?? items.find((item) => item.isDefault)?.id ?? items[0]?.id));
  const opps = useOpportunities(pipeline?.id ?? "", me.isSuccess && Boolean(pipeline));
  const { moveOpportunity } = useCrmMutations();
  const [pending, setPending] = useState<{ opp: Opportunity; stageId: string } | null>(null);
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const canEdit = can(me.data, "crm.edit");
  const hidden = !can(me.data, "crm.view_values");

  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    for (const stage of pipeline?.stages ?? []) map.set(stage.id, []);
    for (const opp of opps.data?.items ?? []) map.get(opp.stageId)?.push(opp);
    return map;
  }, [pipeline, opps.data]);

  function askOrMove(opp: Opportunity, stageId: string) {
    if (opp.stageId === stageId) return;
    const stage = pipeline?.stages.find((item) => item.id === stageId);
    const needed = (stage?.requiredFieldIds ?? []).length > 0;
    if (needed) {
      setCustom({});
      setPending({ opp, stageId });
      return;
    }
    moveOpportunity.mutate(
      { id: opp.id, stageId, version: opp.version },
      {
        onSuccess: () => toast("Moved", "ok"),
        onError: (error) => {
          if (requiredMissing(error).length) {
            setCustom({});
            setPending({ opp, stageId });
          }
        },
      },
    );
  }

  const pendingFields: CustomField[] = pending
    ? (pipeline?.fields ?? []).filter((field) => (pipeline?.stages.find((stage) => stage.id === pending.stageId)?.requiredFieldIds ?? []).includes(field.id))
    : [];

  const columns: Column<Opportunity>[] = [
    { key: "name", header: "Name", render: (row) => <Link href={`/opportunities/${row.id}`} className="font-medium hover:underline">{row.name}</Link> },
    { key: "stage", header: "Stage", render: (row) => row.stageName },
    { key: "contact", header: "Contact", render: (row) => row.contactName },
    { key: "owner", header: "Owner", render: (row) => row.ownerName ?? "—" },
    { key: "value", header: "Value", align: "right", render: (row) => <Money cents={row.valueCents} currency={row.currency} hidden={hidden || row.valueCents == null} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Every opportunity, in the stage it is in now."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {items.length > 1 && pipeline ? (
              <Select label="Pipeline" value={pipeline.id} onValueChange={setChosen} options={items.map((item) => ({ value: item.id, label: item.name }))} />
            ) : null}
            <div className="flex rounded-full border border-border p-0.5" role="group" aria-label="Layout">
              <button type="button" className={`h-8 rounded-full px-3 text-[13px] ${mode === "board" ? "bg-surface-muted" : ""}`} aria-pressed={mode === "board"} onClick={() => setMode("board")}>Board</button>
              <button type="button" className={`h-8 rounded-full px-3 text-[13px] ${mode === "list" ? "bg-surface-muted" : ""}`} aria-pressed={mode === "list"} onClick={() => setMode("list")}>List</button>
            </div>
          </div>
        }
      />
      {pipelines.isLoading || opps.isLoading ? <Skeleton className="h-64 w-full" /> : null}
      {pipelines.isError ? <Problem error={pipelines.error} onRetry={() => void pipelines.refetch()} /> : null}
      {opps.isError ? <Problem error={opps.error} onRetry={() => void opps.refetch()} /> : null}
      {pipelines.data && items.length === 0 ? <EmptyState title="No pipeline yet" body="Create one under Settings, Pipelines and fields." /> : null}
      {moveOpportunity.isError && !pending && isApiError(moveOpportunity.error) && moveOpportunity.error.status === 409 ? <Problem error={moveOpportunity.error} /> : null}
      {moveOpportunity.isError && !pending && !(isApiError(moveOpportunity.error) && (moveOpportunity.error.status === 409 || moveOpportunity.error.code === "required_fields_missing")) ? <Problem error={moveOpportunity.error} /> : null}

      {pipeline && mode === "list" && opps.data ? (
        <div className="overflow-x-auto">
          <Table columns={columns} rows={opps.data.items} rowKey={(row) => row.id} pageSize={50} caption="Opportunities" />
        </div>
      ) : null}

      {pipeline && mode === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {pipeline.stages.map((stage) => (
            <section
              key={stage.id}
              aria-label={stage.name}
              className="w-[min(100%,260px)] shrink-0 rounded-xl bg-surface-muted p-2"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain");
                const opp = opps.data?.items.find((item) => item.id === id);
                if (opp) askOrMove(opp, stage.id);
              }}
            >
              <h2 className="px-2 py-2 text-[13px] font-medium text-text-muted">
                {stage.name}
                <span className="ml-2 tabular-nums">{byStage.get(stage.id)?.length ?? 0}</span>
              </h2>
              <div className="flex flex-col gap-2">
                {(byStage.get(stage.id) ?? []).map((opp) => (
                  <article key={opp.id} draggable={canEdit} onDragStart={(event) => event.dataTransfer.setData("text/plain", opp.id)} className="rounded-lg border border-border bg-surface p-3">
                    <Link href={`/opportunities/${opp.id}`} className="text-[14px] font-medium hover:underline">{opp.name}</Link>
                    <p className="mt-0.5 text-[13px] text-text-muted">{opp.contactName}</p>
                    <p className="text-[13px] text-text-muted">{opp.ownerName ?? "Unassigned"}</p>
                    <p className="mt-2"><Money cents={opp.valueCents} currency={opp.currency} hidden={hidden || opp.valueCents == null} /></p>
                    {canEdit ? (
                      <div className="mt-2">
                        <DropdownMenu
                          label={`Move ${opp.name}`}
                          trigger={<Button size="sm" variant="quiet">Move to stage</Button>}
                        >
                          {pipeline.stages.filter((item) => item.id !== stage.id).map((item) => (
                            <DropdownItem key={item.id} onSelect={() => askOrMove(opp, item.id)}>{item.name}</DropdownItem>
                          ))}
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        title="Required fields"
        description="This stage needs these fields before the move."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) return;
            moveOpportunity.mutate(
              { id: pending.opp.id, stageId: pending.stageId, version: pending.opp.version, custom: packedCustom(pendingFields, custom) },
              {
                onSuccess: () => {
                  setPending(null);
                  toast("Moved", "ok");
                },
              },
            );
          }}
        >
          <CustomInputs fields={pendingFields} values={custom} onChange={(id, value) => setCustom((current) => ({ ...current, [id]: value }))} />
          {pendingFields.length === 0 ? <p className="text-[13px] text-text-muted">The server asked for fields that are not on this pipeline. Add them under Settings, then try again.</p> : null}
          {moveOpportunity.isError ? <Problem error={moveOpportunity.error} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            <Button type="submit" disabled={moveOpportunity.isPending}>{moveOpportunity.isPending ? "Moving" : "Move"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

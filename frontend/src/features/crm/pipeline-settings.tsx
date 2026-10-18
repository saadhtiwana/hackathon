"use client";

import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useCrmMutations, usePipelines } from "./api";
import { Problem } from "./problem";

export function PipelineSettings() {
  const me = useMe();
  const toast = useToast();
  const allowed = me.isSuccess && can(me.data, "settings.manage");
  const pipelines = usePipelines(allowed);
  const { createPipeline, addStage, updateStage, reorderStages, deleteStage, setRequired } = useCrmMutations();
  const [chosen, setChosen] = useState<string | null>(null);
  const [pipelineName, setPipelineName] = useState("");
  const [stageName, setStageName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const items = pipelines.data?.items ?? [];
  const pipeline = items.find((item) => item.id === (chosen ?? items[0]?.id));

  if (me.isSuccess && !allowed) return <p className="text-[15px] text-text-muted">You need settings access to edit pipelines.</p>;

  function order(ids: string[]) {
    if (!pipeline) return;
    reorderStages.mutate(ids.length ? { pipelineId: pipeline.id, stageIds: ids } : { pipelineId: pipeline.id, stageIds: ids }, { onSuccess: () => toast("Order saved", "ok") });
  }

  return (
    <div>
      <PageHeader
        title="Pipelines"
        description="Stages, the order they appear in, and which fields a stage requires."
        actions={<Link href="/settings/fields" className="text-[14px] underline">Custom fields</Link>}
      />
      {pipelines.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {pipelines.isError ? <Problem error={pipelines.error} onRetry={() => void pipelines.refetch()} /> : null}
      <form
        className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pipelineName.trim()) return;
          createPipeline.mutate(pipelineName.trim(), { onSuccess: () => { setPipelineName(""); toast("Pipeline created", "ok"); } });
        }}
      >
        <Field label="New pipeline" htmlFor="pipeline-name" className="sm:w-64">
          <Input id="pipeline-name" value={pipelineName} onChange={(event) => setPipelineName(event.target.value)} />
        </Field>
        <Button type="submit" disabled={createPipeline.isPending}>{createPipeline.isPending ? "Saving" : "Create pipeline"}</Button>
      </form>
      {createPipeline.isError ? <Problem error={createPipeline.error} /> : null}
      {items.length > 1 && pipeline ? (
        <div className="mb-4"><Select label="Pipeline" value={pipeline.id} onValueChange={setChosen} options={items.map((item) => ({ value: item.id, label: item.name }))} /></div>
      ) : null}
      {pipeline ? (
        <div>
          <ol className="flex flex-col gap-2">
            {pipeline.stages.map((stage, index) => (
              <li
                key={stage.id}
                draggable
                onDragStart={() => setDragId(stage.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!dragId || dragId === stage.id) return;
                  const ids = pipeline.stages.map((item) => item.id);
                  const from = ids.indexOf(dragId);
                  const to = ids.indexOf(stage.id);
                  if (from < 0 || to < 0) return;
                  ids.splice(from, 1);
                  ids.splice(to, 0, dragId);
                  setDragId(null);
                  order(ids);
                }}
                className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center"
              >
                <Input
                  aria-label={`Rename ${stage.name}`}
                  defaultValue={stage.name}
                  key={stage.name}
                  className="sm:max-w-xs"
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next && next !== stage.name) updateStage.mutate({ id: stage.id, name: next }, { onSuccess: () => toast("Stage renamed", "ok") });
                  }}
                />
                <label className="inline-flex items-center gap-1.5 text-[13px]">
                  <input type="checkbox" checked={stage.isWon} onChange={(event) => updateStage.mutate({ id: stage.id, isWon: event.target.checked, isLost: event.target.checked ? false : stage.isLost })} />
                  Won
                </label>
                <label className="inline-flex items-center gap-1.5 text-[13px]">
                  <input type="checkbox" checked={stage.isLost} onChange={(event) => updateStage.mutate({ id: stage.id, isLost: event.target.checked, isWon: event.target.checked ? false : stage.isWon })} />
                  Lost
                </label>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="quiet" aria-label={`Move ${stage.name} up`} disabled={index === 0 || reorderStages.isPending} onClick={() => {
                    const ids = pipeline.stages.map((item) => item.id);
                    const swap = ids[index - 1];
                    if (!swap) return;
                    ids[index - 1] = ids[index]!;
                    ids[index] = swap;
                    order(ids);
                  }}>Up</Button>
                  <Button size="sm" variant="quiet" aria-label={`Move ${stage.name} down`} disabled={index === pipeline.stages.length - 1 || reorderStages.isPending} onClick={() => {
                    const ids = pipeline.stages.map((item) => item.id);
                    const swap = ids[index + 1];
                    if (!swap) return;
                    ids[index + 1] = ids[index]!;
                    ids[index] = swap;
                    order(ids);
                  }}>Down</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setRemoveId(stage.id); setMoveTo(""); deleteStage.mutate({ id: stage.id }, { onSuccess: () => { setRemoveId(null); toast("Stage deleted", "ok"); } }); }}>Delete</Button>
                </div>
              </li>
            ))}
          </ol>
          {updateStage.isError ? <Problem error={updateStage.error} /> : null}
          {reorderStages.isError ? <Problem error={reorderStages.error} /> : null}
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (!stageName.trim()) return;
              addStage.mutate({ pipelineId: pipeline.id, name: stageName.trim() }, { onSuccess: () => { setStageName(""); toast("Stage added", "ok"); } });
            }}
          >
            <Input aria-label="New stage name" value={stageName} onChange={(event) => setStageName(event.target.value)} placeholder="Stage name" />
            <Button type="submit" variant="quiet" disabled={addStage.isPending}>{addStage.isPending ? "Saving" : "Add stage"}</Button>
          </form>
          {addStage.isError ? <Problem error={addStage.error} /> : null}

          <h2 className="mt-8 text-[18px] font-semibold">Required to enter a stage</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {pipeline.stages.map((stage) => (
              <li key={stage.id}>
                <p className="text-[13px] text-text-muted">{stage.name}</p>
                <div className="mt-1 flex flex-wrap gap-3">
                  {pipeline.fields.map((field) => {
                    const on = (stage.requiredFieldIds ?? []).includes(field.id);
                    return (
                      <label key={field.id} className="inline-flex items-center gap-1.5 text-[13px]">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const current = new Set(stage.requiredFieldIds ?? []);
                            if (on) current.delete(field.id);
                            else current.add(field.id);
                            setRequired.mutate({ stageId: stage.id, fieldIds: [...current] }, { onSuccess: () => toast("Required fields saved", "ok") });
                          }}
                        />
                        {field.name}
                      </label>
                    );
                  })}
                  {pipeline.fields.length === 0 ? <span className="text-[13px] text-text-muted">Add a field first.</span> : null}
                </div>
              </li>
            ))}
          </ul>
          {setRequired.isError ? <Problem error={setRequired.error} /> : null}
        </div>
      ) : null}

      <Dialog
        open={Boolean(removeId) && deleteStage.isError && isApiError(deleteStage.error) && deleteStage.error.code === "stage_not_empty"}
        onOpenChange={(open) => { if (!open) setRemoveId(null); }}
        title="Move opportunities first"
        description={isApiError(deleteStage.error) ? deleteStage.error.message : "Choose where those opportunities should go."}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const target = moveTo || pipeline?.stages.find((stage) => stage.id !== removeId)?.id;
            if (!removeId || !target) return;
            deleteStage.mutate({ id: removeId, moveTo: target }, { onSuccess: () => { setRemoveId(null); toast("Stage deleted", "ok"); } });
          }}
        >
          {pipeline ? (
            <Select
              label="Move them to"
              value={moveTo || pipeline.stages.find((stage) => stage.id !== removeId)?.id || ""}
              onValueChange={setMoveTo}
              options={pipeline.stages.filter((stage) => stage.id !== removeId).map((stage) => ({ value: stage.id, label: stage.name }))}
            />
          ) : null}
          {deleteStage.isError ? <Problem error={deleteStage.error} /> : null}
          <Button type="submit" disabled={deleteStage.isPending}>{deleteStage.isPending ? "Moving" : "Move and delete"}</Button>
        </form>
      </Dialog>
    </div>
  );
}

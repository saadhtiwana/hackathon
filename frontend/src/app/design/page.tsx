"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Countdown } from "@/components/ui/countdown";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { Table, type Column } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { Avatar } from "@/components/ui/avatar";

type Row = { id: string; name: string; stage: string; cents: number | null };

const rows: Row[] = [
  { id: "1", name: "F-7 plot, Ahmed", stage: "Qualified", cents: 1850000000 },
  { id: "2", name: "E-11 apartment", stage: "Viewing", cents: 4200000000 },
  { id: "3", name: "Bahria villa", stage: "New", cents: null },
];

const columns: Column<Row>[] = [
  { key: "name", header: "Opportunity", sortValue: (row) => row.name, render: (row) => row.name },
  { key: "stage", header: "Stage", sortValue: (row) => row.stage, render: (row) => row.stage },
  {
    key: "value",
    header: "Value",
    align: "right",
    sortValue: (row) => row.cents ?? -1,
    render: (row) => <Money cents={row.cents} hidden={row.cents == null} />,
  },
];

function Specimen() {
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [stage, setStage] = useState("qualified");
  const [owner, setOwner] = useState("ahmad");

  return (
    <div className="flex flex-col gap-8 bg-paper p-4 text-ink">
      <PageHeader
        title="Desk"
        description="Paper, ink, and one signal colour for anything overdue."
        actions={<Button variant="signal">Escalate</Button>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button>Save</Button>
        <Button variant="quiet">Cancel</Button>
        <Button variant="ghost">Quiet</Button>
        <Kbd>Ctrl K</Kbd>
        <Avatar name="Ahmad Mustafa" />
        <Badge>12</Badge>
        <Badge tone="signal">Overdue</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <StatusPill tone="ok">Available</StatusPill>
        <StatusPill tone="warn">Busy</StatusPill>
        <StatusPill tone="signal">Offline</StatusPill>
        <StatusPill tone="neutral">Assigned</StatusPill>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Contact" htmlFor="contact-name" hint="Shown on the customer record.">
          <Input id="contact-name" defaultValue="Hira Qureshi" />
        </Field>
        <Field label="Note" htmlFor="note" error="Add a note before you acknowledge.">
          <Textarea id="note" defaultValue="" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
          Required field
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <Switch checked={on} onCheckedChange={setOn} aria-label="Night alerts" />
          Night alerts
        </label>
        <Select
          label="Stage"
          value={stage}
          onValueChange={setStage}
          options={[
            { value: "new", label: "New" },
            { value: "qualified", label: "Qualified" },
          ]}
        />
        <Combobox
          label="Owner"
          value={owner}
          onChange={setOwner}
          options={[
            { value: "ahmad", label: "Ahmad" },
            { value: "abdullah", label: "Abdullah" },
          ]}
        />
      </div>
      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="won">Won</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap gap-8">
        <Countdown seconds={74} />
        <Countdown seconds={12} />
        <Countdown seconds={-18} />
      </div>
      <Table caption="Sample opportunities" columns={columns} rows={rows} rowKey={(row) => row.id} pageSize={2} />
      <Timeline>
        <TimelineItem title="Assigned to Ahmad" meta="09:14" body="Round-robin, available." />
        <TimelineItem title="Escalated" meta="09:16" body="Acknowledgement window expired." />
      </Timeline>
      <EmptyState title="Recovery queue is clear" body="Leads with no owner action will collect here." />
      <Dialog title="Reassign lead" description="The current countdown stops." trigger={<Button variant="quiet">Open dialog</Button>}>
        <p className="text-[13px] text-muted">Pick the next owner. Only one person holds the lead.</p>
      </Dialog>
    </div>
  );
}

export default function DesignPage() {
  return (
    <main id="content" className="min-h-full bg-paper text-ink">
      <header className="border-b border-line px-4 py-4">
        <p className="font-mono text-[13px] text-muted">Relay / design</p>
        <h1 className="text-[28px] font-medium tracking-tight">Style guide</h1>
      </header>
      <div className="grid lg:grid-cols-2">
        <section className="light border-b border-line lg:border-r lg:border-b-0" aria-label="Day desk">
          <p className="px-4 pt-4 font-mono text-[12px] text-muted">Day</p>
          <Specimen />
        </section>
        <section className="dark" aria-label="Night shift">
          <p className="px-4 pt-4 font-mono text-[12px] text-muted">Night shift</p>
          <Specimen />
        </section>
      </div>
    </main>
  );
}

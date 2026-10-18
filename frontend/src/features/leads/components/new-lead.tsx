"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";

// Manual entry: the lead gets the source label "Manual" and is assigned like any other.
export function NewLead() {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ name: "", phone: "", email: "", message: "" });
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => apiFetch<{ lead: { id: string } }>("/leads", { method: "POST", body: { name: d.name.trim(), ...(d.phone.trim() ? { phone: d.phone.trim() } : {}), ...(d.email.trim() ? { email: d.email.trim() } : {}), ...(d.message.trim() ? { message: d.message.trim() } : {}) } }),
    onSuccess: (r) => {
      toast("Lead created and assigned", "ok");
      setOpen(false);
      setD({ name: "", phone: "", email: "", message: "" });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      if (r?.lead?.id) router.push(`/leads/${r.lead.id}`);
    },
  });
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={setOpen} title="New lead" description="Record an enquiry that came in by phone or in person." trigger={<Button size="sm"><Plus className="size-4" aria-hidden /> New lead</Button>}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (d.name.trim()) create.mutate(); }}>
        <Field label="Name" htmlFor="nl-name"><Input id="nl-name" required maxLength={200} value={d.name} onChange={set("name")} /></Field>
        <Field label="Phone" htmlFor="nl-phone" hint="With country code, for example +92 300 1234567"><Input id="nl-phone" type="tel" value={d.phone} onChange={set("phone")} /></Field>
        <Field label="Email" htmlFor="nl-email"><Input id="nl-email" type="email" value={d.email} onChange={set("email")} /></Field>
        <Field label="What do they need?" htmlFor="nl-msg"><Textarea id="nl-msg" value={d.message} onChange={set("message")} /></Field>
        <Notice error={create.error} />
        <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating" : "Create lead"}</Button>
      </form>
    </Dialog>
  );
}

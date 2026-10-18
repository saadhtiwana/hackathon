"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, CalendarX2, Clock } from "lucide-react";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { can } from "@/lib/permissions";
import { fmt, useAppointments, useCancelAppointment, useUpdateAppointment, zonedToUtc, type Appointment } from "./api";
import { BookingDialog } from "./booking-dialog";
import { DayBusy } from "./components/day-busy";

export function AppointmentsList() {
  const me = useMe();
  const [mine, setMine] = useState(false);
  const list = useAppointments({ userId: mine ? me.data?.user.id : undefined }, me.isSuccess);
  const canEdit = can(me.data, "crm.edit");
  const items = list.data?.items ?? [];
  const groups = new Map<string, Appointment[]>();
  for (const a of items) {
    const k = fmt(a.startsAt, a.timezone, "EEEE, d MMMM");
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Upcoming visits and calls, booked on each employee's Google Calendar."
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Whose appointments">
              <Button size="sm" variant={!mine ? "dark" : "ghost"} aria-pressed={!mine} onClick={() => setMine(false)}>
                Everyone
              </Button>
              <Button size="sm" variant={mine ? "dark" : "ghost"} aria-pressed={mine} onClick={() => setMine(true)}>
                Mine
              </Button>
            </div>
            {canEdit ? <BookingDialog /> : null}
          </div>
        }
      />
      {list.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Notice error={list.error} />
          <Button size="sm" variant="quiet" onClick={() => void list.refetch()}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nothing booked yet" body="Book from a lead, contact or opportunity. Employees need a connected Google Calendar to be bookable." />
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups].map(([dayLabel, appts]) => (
            <section key={dayLabel} aria-label={dayLabel}>
              <h2 className="mb-2 text-[13px] font-semibold text-text-muted">{dayLabel}</h2>
              <ul className="flex flex-col gap-2">
                {appts.map((a) => (
                  <li key={a.id}>
                    <Card className="flex flex-col gap-3 p-4 animate-row-in sm:flex-row sm:items-center">
                      <div className="flex w-28 shrink-0 flex-col">
                        <span className="text-[18px] font-semibold tabular-nums">{fmt(a.startsAt, a.timezone, "HH:mm")}</span>
                        <span className="text-[12px] text-text-muted tabular-nums">
                          to {fmt(a.endsAt, a.timezone, "HH:mm")} · {a.timezone}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">{a.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <Avatar name={a.contactName} id={a.contactId} size="xs" />
                            {a.contactName}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Avatar name={a.userName} id={a.userId} size="xs" />
                            with {a.userId === me.data?.user.id ? "you" : a.userName}
                          </span>
                        </p>
                      </div>
                      {canEdit && a.status === "scheduled" ? (
                        <div className="flex gap-1">
                          <RescheduleDialog appt={a} />
                          <CancelDialog appt={a} />
                        </div>
                      ) : null}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function RescheduleDialog({ appt }: { appt: Appointment }) {
  const tz = appt.timezone;
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(fmt(appt.startsAt, tz, "yyyy-MM-dd"));
  const [start, setStart] = useState(fmt(appt.startsAt, tz, "HH:mm"));
  const [end, setEnd] = useState(fmt(appt.endsAt, tz, "HH:mm"));
  const update = useUpdateAppointment();
  const toast = useToast();
  const clash = isApiError(update.error) && update.error.code === "calendar_conflict";

  function save(force = false) {
    update.mutate(
      { id: appt.id, start: zonedToUtc(day, start, tz).toISOString(), end: zonedToUtc(day, end, tz).toISOString(), timeZone: tz, force },
      {
        onSuccess: () => {
          toast("Rescheduled. The calendar event moved too.", "ok");
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) update.reset();
      }}
      trigger={
        <Button size="sm" variant="quiet">
          <Clock className="size-3.5" aria-hidden />
          Reschedule
        </Button>
      }
      title="Reschedule"
      description={`${appt.title} with ${appt.contactName}. Times are in ${tz}.`}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <Field label="Day" htmlFor={`rs-day-${appt.id}`}>
          <Input id={`rs-day-${appt.id}`} type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <DayBusy userId={appt.userId} day={day} tz={tz} name={appt.userName} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Start (${tz})`} htmlFor={`rs-s-${appt.id}`}>
            <Input id={`rs-s-${appt.id}`} type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End" htmlFor={`rs-e-${appt.id}`}>
            <Input id={`rs-e-${appt.id}`} type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {clash ? (
          <div className="rounded-lg bg-tint-yellow p-3 text-[13px] text-tint-yellow-text" role="alert">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" aria-hidden />
              {update.error?.message}
            </p>
            <Button size="sm" variant="dark" className="mt-2" disabled={update.isPending} onClick={() => save(true)}>
              Move anyway
            </Button>
          </div>
        ) : (
          <Notice error={update.error} />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? "Saving" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CancelDialog({ appt }: { appt: Appointment }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelAppointment();
  const toast = useToast();
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) cancel.reset();
      }}
      trigger={
        <Button size="sm" variant="ghost">
          <CalendarX2 className="size-3.5" aria-hidden />
          Cancel
        </Button>
      }
      title="Cancel this appointment?"
      description={`${appt.title} with ${appt.contactName}. It is also removed from ${appt.userName}'s calendar.`}
    >
      <Notice error={cancel.error} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Keep it
        </Button>
        <Button
          variant="signal"
          disabled={cancel.isPending}
          onClick={() =>
            cancel.mutate(appt.id, {
              onSuccess: () => {
                toast("Appointment cancelled", "ok");
                setOpen(false);
              },
            })
          }
        >
          {cancel.isPending ? "Cancelling" : "Cancel appointment"}
        </Button>
      </div>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fieldErrors, Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { fmt, useCalendarUsers, useContactSearch, useCreateAppointment, useWorkspaceTimezone, zonedToUtc } from "./api";
import { DayBusy } from "./components/day-busy";

type Conflict = { start?: string; end?: string; startsAt?: string; endsAt?: string; title?: string };

// Mount from a contact or opportunity page: <BookingDialog contactId=... contactName=... opportunityId=... />
export function BookingDialog({
  contactId,
  contactName,
  opportunityId,
  trigger,
}: {
  contactId?: string;
  contactName?: string;
  opportunityId?: string;
  trigger?: React.ReactNode;
}) {
  const tz = useWorkspaceTimezone();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [pickedContact, setPickedContact] = useState(contactId ?? "");
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("10:30");
  const [title, setTitle] = useState(contactName ? `Meeting with ${contactName}` : "Site visit");
  const [notes, setNotes] = useState("");
  const users = useCalendarUsers(open);
  const contacts = useContactSearch(search);
  const create = useCreateAppointment();
  const toast = useToast();

  const all = users.data?.items ?? [];
  const bookable = all.filter((u) => u.bookable);
  const blocked = all.filter((u) => !u.bookable);
  const chosen = all.find((u) => u.userId === userId);
  const conflict = isApiError(create.error) && create.error.code === "calendar_conflict";
  const conflicts = conflict ? (((create.error as unknown as { conflicts?: Conflict[] }).conflicts ?? []) as Conflict[]) : [];
  const errors = fieldErrors(create.error) ?? {};
  const contact = contactId ?? pickedContact;

  function submit(force = false) {
    if (!userId || !contact || !day) return;
    create.mutate(
      {
        userId,
        contactId: contact,
        opportunityId,
        start: zonedToUtc(day, start, tz).toISOString(),
        end: zonedToUtc(day, end, tz).toISOString(),
        timeZone: tz,
        title: title.trim(),
        notes: notes.trim() || undefined,
        force,
      },
      {
        onSuccess: () => {
          toast(`Booked with ${chosen?.name ?? "the employee"} on their Google Calendar`, "ok");
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
        if (v && !day) setDay(fmt(new Date(), tz, "yyyy-MM-dd"));
        if (!v) create.reset();
      }}
      trigger={
        trigger ?? (
          <Button size="sm">
            <CalendarPlus className="size-3.5" aria-hidden />
            Book appointment
          </Button>
        )
      }
      title="Book an appointment"
      description={`Times are in ${tz}. The booking goes onto the employee's Google Calendar.`}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        {!contactId ? (
          <Field label="Customer" htmlFor="book-contact-q" error={errors.contactId}>
            <Input id="book-contact-q" placeholder="Search contacts by name" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select
              label="Customer"
              placeholder={contacts.isLoading ? "Loading contacts" : contacts.isError ? "Contacts unavailable" : "Pick a contact"}
              value={pickedContact || undefined}
              onValueChange={setPickedContact}
              disabled={!contacts.data?.items.length}
              options={(contacts.data?.items ?? []).map((c) => ({ value: c.id, label: c.name, icon: <Avatar name={c.name} id={c.id} size="xs" /> }))}
            />
          </Field>
        ) : null}

        <Field label="Employee" error={errors.userId}>
          <Select
            label="Employee"
            placeholder={users.isLoading ? "Loading people" : bookable.length ? "Pick who meets them" : "Nobody has a calendar connected"}
            value={userId || undefined}
            onValueChange={setUserId}
            disabled={!bookable.length}
            options={bookable.map((u) => ({ value: u.userId, label: u.name, icon: <Avatar name={u.name} id={u.userId} size="xs" /> }))}
          />
        </Field>
        {users.isError ? <Notice error={users.error} onRetry={() => void users.refetch()} /> : null}
        {blocked.length ? (
          <ul className="flex flex-col gap-1 text-[12px] text-text-muted" aria-label="Cannot be booked">
            {blocked.map((u) => (
              <li key={u.userId} className="flex items-center gap-2">
                <Avatar name={u.name} id={u.userId} size="xs" />
                <span>
                  <span className="font-medium text-text">{u.name}</span> cannot be booked: {u.reason}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <Field label="Day" htmlFor="book-day">
          <Input id="book-day" type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        {userId && day ? <DayBusy userId={userId} day={day} tz={tz} name={chosen?.name ?? "They"} /> : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Start (${tz})`} htmlFor="book-start" error={errors.start}>
            <Input id="book-start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} className="tabular-nums" />
          </Field>
          <Field label="End" htmlFor="book-end" error={errors.end}>
            <Input id="book-end" type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className="tabular-nums" />
          </Field>
        </div>
        <Field label="Title" htmlFor="book-title" error={errors.title}>
          <Input id="book-title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Notes" hint="Optional, added to the calendar event" htmlFor="book-notes">
          <Textarea id="book-notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
        </Field>

        {conflict ? (
          <div className="rounded-lg bg-tint-yellow p-3 text-[13px] text-tint-yellow-text" role="alert">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" aria-hidden />
              {create.error?.message}
            </p>
            {conflicts.length ? (
              <p className="mt-1">
                Overlaps{" "}
                {conflicts
                  .map((c) => {
                    const s = c.start ?? c.startsAt;
                    const e = c.end ?? c.endsAt;
                    return s && e ? `${fmt(s, tz, "HH:mm")}–${fmt(e, tz, "HH:mm")}` : "an existing booking";
                  })
                  .join(", ")}
                .
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="quiet" onClick={() => create.reset()}>
                Pick another time
              </Button>
              <Button size="sm" variant="dark" disabled={create.isPending} onClick={() => submit(true)}>
                Book anyway
              </Button>
            </div>
          </div>
        ) : (
          <Notice error={create.error} />
        )}

        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!userId || !contact || !day || create.isPending}>
            {create.isPending ? "Booking" : "Book"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

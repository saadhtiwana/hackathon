"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, isApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

const schema = z.object({
  name: z.string().min(1, "Enter your name"),
  password: z.string().min(8, "Use at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export function InviteForm() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: "", password: "" } });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await api.acceptInvite({ token: params.token, ...values });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/");
    } catch (error) {
      if (isApiError(error) && error.fields) {
        for (const [key, message] of Object.entries(error.fields)) {
          if (key === "name" || key === "password") form.setError(key, { message });
        }
      }
      setSubmitError(error);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div>
        <h1 className="text-[20px] font-medium">Accept invite</h1>
        <p className="mt-1 text-[13px] text-muted">Set your name and a password to join the workspace.</p>
      </div>
      <Field label="Your name" htmlFor="name" error={form.formState.errors.name?.message}>
        <Input id="name" autoComplete="name" {...form.register("name")} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters." error={form.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Notice error={submitError} onRetry={() => void form.handleSubmit(onSubmit)()} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Joining" : "Join workspace"}
      </Button>
    </form>
  );
}

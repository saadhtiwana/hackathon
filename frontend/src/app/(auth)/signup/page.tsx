"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  workspaceName: z.string().min(2, "Enter the company name"),
  name: z.string().min(1, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { workspaceName: "", name: "", email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await api.signup(values);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/dashboard");
    } catch (error) {
      if (isApiError(error) && error.fields) {
        for (const [key, message] of Object.entries(error.fields)) {
          if (key in values) form.setError(key as keyof FormValues, { message });
        }
      }
      setSubmitError(error);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight">Create a workspace</h1>
        <p className="mt-1 text-[13px] text-muted">The first account becomes the owner.</p>
      </div>
      <Field label="Company" htmlFor="workspaceName" error={form.formState.errors.workspaceName?.message}>
        <Input id="workspaceName" autoComplete="organization" {...form.register("workspaceName")} />
      </Field>
      <Field label="Your name" htmlFor="name" error={form.formState.errors.name?.message}>
        <Input id="name" autoComplete="name" {...form.register("name")} />
      </Field>
      <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters." error={form.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Notice error={submitError} onRetry={() => void form.handleSubmit(onSubmit)()} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Creating workspace" : "Create workspace"}
      </Button>
      <p className="text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent-text hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

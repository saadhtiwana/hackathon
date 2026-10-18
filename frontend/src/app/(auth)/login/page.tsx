"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, isApiError } from "@/lib/api";
import { useMe } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  useEffect(() => {
    if (me.isSuccess) router.replace("/");
  }, [me.isSuccess, router]);

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await api.login(values);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/");
    } catch (error) {
      if (isApiError(error) && error.fields) {
        for (const [key, message] of Object.entries(error.fields)) {
          if (key === "email" || key === "password") form.setError(key, { message });
        }
      }
      setSubmitError(error);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-[13px] text-muted">Use the workspace account you were invited to.</p>
      </div>
      <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
      </Field>
      <Notice error={submitError} onRetry={() => void form.handleSubmit(onSubmit)()} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Signing in" : "Sign in"}
      </Button>
      <p className="text-[13px] text-muted">
        New company?{" "}
        <Link href="/signup" className="font-medium text-accent-text hover:underline">
          Create a workspace
        </Link>
      </p>
    </form>
  );
}

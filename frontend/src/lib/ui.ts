import type { ApplicationStatus, JobPost, JobPostStatus } from "../types";
import { formatCurrency } from "./format";

export function salaryRange(job: Pick<JobPost, "salary_min" | "salary_max" | "currency">): string {
  if (job.salary_min == null && job.salary_max == null) return "Thỏa thuận";
  if (job.salary_min != null && job.salary_max != null) {
    return `${formatCurrency(job.salary_min, job.currency)} - ${formatCurrency(job.salary_max, job.currency)}`;
  }
  return formatCurrency(job.salary_min ?? job.salary_max, job.currency);
}

export function isDeadlinePassed(deadline: string | null | undefined): boolean {
  return Boolean(deadline && new Date(deadline).getTime() < Date.now());
}

export const EMPLOYMENT_BADGE: Record<string, "primary" | "accent" | "success" | "warning" | "muted"> = {
  full_time: "primary",
  part_time: "warning",
  internship: "accent",
  contract: "muted",
  remote: "success",
  hybrid: "success",
};

export const JOB_STATUS_COLORS: Record<JobPostStatus, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  closed: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
  archived: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export const APP_STATUS_COLORS: Record<ApplicationStatus, string> = {
  pending: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  screening: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  interview: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  offer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  withdrawn: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export const TERMINAL_APP_STATUSES: ApplicationStatus[] = ["accepted", "rejected", "withdrawn"];

export type UserRole = "candidate" | "recruiter" | "admin";

/**
 * Whether the current user may browse the "Job postings → submitted CVs"
 * picker on the Repo Evaluation page.
 *
 * Candidates must NOT see other applicants' CVs and which jobs they applied to,
 * so this picker is restricted to recruiter and admin roles.
 *
 * ponytail: pure function, no React, no Supabase. Trivially testable.
 */
export function canBrowseJobApplications(role: UserRole | null | undefined): boolean {
  return role === "recruiter" || role === "admin";
}

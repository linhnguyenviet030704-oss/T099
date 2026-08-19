import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Send, Sparkles, Users2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { apiJson } from '../lib/api';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { getResumeSignedUrl } from '../lib/storage';
import { ENUM_LABELS } from '../lib/format';
import { JobPost } from '../types';

const QUICK_PROMPT = 'Gợi ý ứng viên phù hợp';

type RerankStatus = 'success' | 'fallback' | 'not_requested';

type ChatCandidate = {
  application_id: string;
  applicant_user_id: string;
  full_name: string | null;
  email: string | null;
  resume_title: string | null;
  resume_storage_path: string | null;
  current_status: string;
  rrf_score: number;
  rerank_score: number | null;
  rerank_status: RerankStatus;
};

const displayScore = (c: ChatCandidate) =>
  c.rerank_status === 'success' && c.rerank_score != null ? c.rerank_score : c.rrf_score;

type HistoryRun = {
  id: string;
  created_at: string;
  rerank_mode: string | null;
  rerank_status: string | null;
  recruiter_message: string | null;
};

type ChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  candidates?: ChatCandidate[];
};

type ChatApiResponse = {
  response: string;
  candidates?: ChatCandidate[];
};

type JobOption = JobPost & { company_name?: string };

const welcomeFor = (jobTitle?: string) =>
  jobTitle
    ? `Vị trí “${jobTitle}”. Pool chỉ gồm CV đã nộp tin này.`
    : 'Chọn một vị trí tuyển dụng, rồi bấm “Gợi ý ứng viên phù hợp” hoặc gõ tin nhắn.';

export const MatchCandidatesPage: React.FC = () => {
  const { user, session } = useAuth();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobId, setJobId] = useState('');
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [rerank, setRerank] = useState<'qwen' | 'agent'>('qwen');
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([
    { id: 'welcome', role: 'assistant', text: welcomeFor() },
  ]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadJobs = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setJobsError(null);

      // Admin: every job. Recruiter: only jobs they posted at companies they belong to.
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const isAdmin = profileRow?.role === 'admin';

      if (isAdmin) {
        const { data: jobsData, error: jobsErr } = await supabase
          .from('job_posts')
          .select('*, companies(name)')
          .order('updated_at', { ascending: false });
        if (jobsErr) throw jobsErr;
        setJobs(
          ((jobsData || []) as any[]).map((job) => ({
            ...job,
            company_name: Array.isArray(job.companies)
              ? job.companies[0]?.name
              : job.companies?.name,
          })),
        );
        return;
      }

      const { data: memberData, error: memberErr } = await supabase
        .from('company_members')
        .select('company_id, companies(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .in('role', ['owner', 'recruiter']);
      if (memberErr) throw memberErr;

      const companyIds = Array.from(new Set((memberData || []).map((row: { company_id: string }) => row.company_id)));
      const companyNames: Record<string, string> = {};
      (memberData || []).forEach((row: { company_id: string; companies?: { name?: string } | { name?: string }[] }) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
        if (company?.name) companyNames[row.company_id] = company.name;
      });

      if (companyIds.length === 0) {
        setJobs([]);
        return;
      }

      const { data: jobsData, error: jobsErr } = await supabase
        .from('job_posts')
        .select('*')
        .in('company_id', companyIds)
        .eq('created_by_user_id', user.id)
        .order('updated_at', { ascending: false });
      if (jobsErr) throw jobsErr;

      setJobs(
        ((jobsData || []) as JobPost[]).map((job) => ({
          ...job,
          company_name: companyNames[job.company_id],
        })),
      );
    } catch (err: unknown) {
      setJobsError(handleSupabaseError(err));
    }
  }, [user]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, sending]);

  const handleJobChange = async (nextId: string) => {
    setJobId(nextId);
    const job = jobs.find((item) => item.id === nextId);
    setTurns([{ id: 'welcome', role: 'assistant', text: welcomeFor(job?.title) }]);
    setHistory([]);
    if (!nextId || !supabase) return;
    const { data } = await supabase
      .from('match_resume')
      .select('id, created_at, rerank_mode, rerank_status, recruiter_message')
      .eq('job_post_id', nextId)
      .order('created_at', { ascending: false })
      .limit(20);
    setHistory((data || []) as HistoryRun[]);
  };

  const replayHistory = async (run: HistoryRun) => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('get_match_run', { p_run_id: run.id });
    if (error) {
      alert(error.message);
      return;
    }
    const rows = (data || []) as Array<Record<string, unknown>>;
    const candidates: ChatCandidate[] = rows.map((row) => ({
      application_id: String(row.application_id),
      applicant_user_id: String(row.applicant_user_id),
      full_name: (row.full_name as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      resume_title: (row.resume_title as string | null) ?? null,
      resume_storage_path: (row.resume_storage_path as string | null) ?? null,
      current_status: String(row.current_status || 'pending'),
      rrf_score: Number(row.rrf_score),
      rerank_score: row.rerank_score == null ? null : Number(row.rerank_score),
      rerank_status: (String(row.rerank_status || run.rerank_status || 'not_requested') as RerankStatus),
    }));
    const n = candidates.length;
    const assistantText =
      n === 0
        ? `Lịch sử · ${run.created_at}\nChưa có CV nộp cho vị trí này.`
        : `Lịch sử · ${run.created_at}\nGợi ý ${n} ứng viên phù hợp.`;
    setTurns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', text: run.recruiter_message || QUICK_PROMPT },
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: assistantText,
        candidates,
      },
    ]);
  };

  const openCv = async (candidate: ChatCandidate) => {
    if (!supabase || !candidate.resume_storage_path) {
      alert('Tập tin hồ sơ snapshot của ứng viên bị thiếu hoặc không tồn tại.');
      return;
    }
    try {
      setOpeningId(candidate.application_id);
      const signedUrl = await getResumeSignedUrl(candidate.resume_storage_path);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Không mở được CV.');
    } finally {
      setOpeningId(null);
    }
  };

  const sendMessage = async (text: string) => {
    const message = text.trim();
    if (!message || sending || !jobId || !session?.access_token) return;

    setDraft('');
    setSending(true);
    setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: message }]);

    try {
      const body = await apiJson<ChatApiResponse>('/chat', session.access_token, {
        method: 'POST',
        body: JSON.stringify({ message, job_id: jobId, rerank }),
      });
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: body.response,
          candidates: body.candidates || [],
        },
      ]);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Không gửi được tin nhắn.';
      setTurns((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: detail },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-2 animate-fade-in">
      <section className="border-b border-slate-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-100 sm:text-3xl">
          <Users2 className="h-7 w-7 text-emerald-400" />
          Gợi ý ứng viên
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Chat matching cho nhà tuyển dụng. Chỉ xét CV đã nộp vào vị trí đang chọn.
        </p>
      </section>

      <label className="block space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">
          Vị trí
        </span>
        <select
          value={jobId}
          onChange={(event) => handleJobChange(event.target.value)}
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Chọn tin tuyển dụng</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.company_name ? `${job.company_name} — ${job.title}` : job.title}
            </option>
          ))}
        </select>
        {jobsError && <p className="text-xs text-red-400">{jobsError}</p>}
        {history.length > 0 && (
          <ul className="mt-2 space-y-1">
            {history.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => void replayHistory(run)}
                  className="w-full truncate rounded-lg px-2 py-1 text-left text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  {run.created_at} · {run.rerank_mode || '—'}
                  {run.recruiter_message ? ` · ${run.recruiter_message}` : ''}
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>

      <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-md">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {turns.map((turn) => (
            <div
              key={turn.id}
              className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] space-y-3 rounded-2xl px-4 py-3 text-sm ${
                  turn.role === 'user'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'border border-slate-800 bg-slate-950 text-slate-200'
                }`}
              >
                <p className="leading-relaxed whitespace-pre-line">{turn.text}</p>
                {turn.candidates && turn.candidates.length > 0 && (
                  <ul className="space-y-3">
                    {turn.candidates.map((candidate) => (
                      <li
                        key={candidate.application_id}
                        className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">
                              {candidate.email || 'Không có email'}
                            </p>
                            <h2 className="text-sm font-extrabold text-slate-100">
                              {candidate.full_name || 'Ứng viên chưa cấu hình hồ sơ'}
                            </h2>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-black text-emerald-400">
                              {Math.round(displayScore(candidate) * 100)}%
                            </span>
                            {candidate.rerank_status === 'fallback' && (
                              <span className="text-[10px] font-mono text-amber-400">fallback</span>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-emerald-400">
                          {ENUM_LABELS.application_status[
                            candidate.current_status as keyof typeof ENUM_LABELS.application_status
                          ] || candidate.current_status}
                        </p>
                        <p className="mt-1 text-[10px] font-mono text-slate-400">
                          {candidate.resume_title || 'CV snapshot'}
                        </p>
                        <button
                          type="button"
                          onClick={() => void openCv(candidate)}
                          disabled={openingId === candidate.application_id}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-50"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Mở CV
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <p className="text-xs font-mono text-slate-500">Đang gợi ý ứng viên...</p>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-t border-slate-800 p-4 sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(draft);
          }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={sending || !jobId}
              onClick={() => void sendMessage(QUICK_PROMPT)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {QUICK_PROMPT}
            </button>
            <button
              type="button"
              disabled={sending || !jobId}
              onClick={() => setRerank('qwen')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                rerank === 'qwen'
                  ? 'border-emerald-500/30 bg-emerald-500 text-slate-950'
                  : 'border-slate-700 bg-slate-950 text-slate-400'
              }`}
            >
              qwen
            </button>
            <button
              type="button"
              disabled={sending || !jobId}
              onClick={() => setRerank('agent')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                rerank === 'agent'
                  ? 'border-emerald-500/30 bg-emerald-500 text-slate-950'
                  : 'border-slate-700 bg-slate-950 text-slate-400'
              }`}
            >
              agent
            </button>
          </div>
          <div className="flex gap-2">
            <label htmlFor="match-candidates-input" className="sr-only">
              Tin nhắn
            </label>
            <input
              id="match-candidates-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={sending || !jobId}
              placeholder={jobId ? 'Gõ tin nhắn...' : 'Chọn vị trí trước'}
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !jobId || !draft.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-3 text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Gửi"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default MatchCandidatesPage;

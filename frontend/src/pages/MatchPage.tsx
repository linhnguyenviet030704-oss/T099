import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, DollarSign, MapPin, Send, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { apiJson } from '../lib/api';
import { ENUM_LABELS, formatCurrency } from '../lib/format';

const QUICK_PROMPT = 'Gợi ý việc phù hợp';

type ChatJob = {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  score: number;
};

type ChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  jobs?: ChatJob[];
};

type ChatApiResponse = {
  response: string;
  analysis?: string;
  jobs?: ChatJob[];
};

export const MatchPage: React.FC = () => {
  const { session } = useAuth();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Bấm “Gợi ý việc phù hợp” hoặc gõ tin nhắn. Matching thật chưa chạy — backend trả tin đang mở kèm điểm mock.',
    },
  ]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, sending]);

  const sendMessage = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    if (!session?.access_token) return;

    setDraft('');
    setSending(true);
    setTurns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', text: message },
    ]);

    try {
      const body = await apiJson<ChatApiResponse>('/chat', session.access_token, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: body.response,
          jobs: body.jobs || [],
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
          <Sparkles className="h-7 w-7 text-emerald-400" />
          Gợi ý việc làm
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Chat matching cho ứng viên. Điểm phù hợp hiện tại là mock.
        </p>
      </section>

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
                <p className="leading-relaxed">{turn.text}</p>
                {turn.jobs && turn.jobs.length > 0 && (
                  <ul className="space-y-3">
                    {turn.jobs.map((job) => (
                      <li
                        key={job.id}
                        className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">
                              {job.company_name || 'Công ty ẩn danh'}
                            </p>
                            <h2 className="text-sm font-extrabold text-slate-100">
                              <Link to={`/jobs/${job.id}`} className="hover:text-emerald-400">
                                {job.title}
                              </Link>
                            </h2>
                          </div>
                          <span className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-black text-emerald-400">
                            {Math.round(job.score * 100)}%
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-1 font-mono text-[10px] text-slate-400 sm:grid-cols-2">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-500" />
                            {job.location || 'Toàn quốc'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                            {formatCurrency(job.salary_min, job.currency)} - {formatCurrency(job.salary_max, job.currency)}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-emerald-400">
                          {job.employment_type
                            ? ENUM_LABELS.employment_type[
                                job.employment_type as keyof typeof ENUM_LABELS.employment_type
                              ] || job.employment_type
                            : ''}
                        </p>
                        <Link
                          to={`/jobs/${job.id}`}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-emerald-500 hover:text-slate-950"
                        >
                          Xem tin
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <p className="text-xs font-mono text-slate-500">Đang gợi ý việc làm...</p>
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
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendMessage(QUICK_PROMPT)}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {QUICK_PROMPT}
          </button>
          <div className="flex gap-2">
            <label htmlFor="match-chat-input" className="sr-only">
              Tin nhắn
            </label>
            <input
              id="match-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={sending}
              placeholder="Gõ tin nhắn..."
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
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

export default MatchPage;

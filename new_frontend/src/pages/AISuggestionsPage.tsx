import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, MapPin, DollarSign, ExternalLink, Bot, User } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiJson } from "../lib/api";
import { ENUM_LABELS, formatCurrency } from "../lib/format";
import AnimatedPage from "../components/AnimatedPage";
import Badge from "../components/Badge";

const QUICK_PROMPT = "Gợi ý việc phù hợp";

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

type Message = { id: string; role: "user" | "system"; text: string; jobs?: ChatJob[] };

export default function AISuggestionsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "system", text: "Xin chào! Bấm “Gợi ý việc phù hợp” hoặc gõ tin nhắn." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || sending || !session?.access_token) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: msgText }]);
    try {
      const body = await apiJson<{ response: string; jobs?: ChatJob[] }>("/chat", session.access_token, {
        method: "POST",
        body: JSON.stringify({ message: msgText }),
      });
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "system", text: body.response, jobs: body.jobs || [] }]);
    } catch (err: unknown) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "system", text: err instanceof Error ? err.message : "Không gửi được tin nhắn." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Gợi ý việc làm AI</h1>
            <p className="text-xs text-slate-500">Chat matching cho ứng viên</p>
          </div>
        </div>
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden" style={{ minHeight: "60vh" }}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white ${msg.role === "system" ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-gradient-to-br from-orange-400 to-pink-500"}`}>
                    {msg.role === "system" ? <Bot size={14} /> : <User size={14} />}
                  </div>
                  <div className="max-w-[80%] flex flex-col gap-2">
                    <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-line ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200"}`}>
                      {msg.text}
                    </div>
                    {msg.jobs?.map((job) => (
                      <div key={job.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{Math.round(job.score * 100)}% phù hợp</span>
                          {job.employment_type && <Badge variant="primary">{ENUM_LABELS.employment_type[job.employment_type as keyof typeof ENUM_LABELS.employment_type] || job.employment_type}</Badge>}
                        </div>
                        <p className="font-semibold text-sm">{job.title}</p>
                        <p className="text-xs text-slate-500">{job.company_name}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><MapPin size={11} />{job.location || "Toàn quốc"}</span>
                          <span className="flex items-center gap-1 text-emerald-600"><DollarSign size={11} />{formatCurrency(job.salary_min, job.currency)}</span>
                        </div>
                        <button onClick={() => navigate(`/jobs/${job.id}`)} className="mt-3 w-full py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-xl flex items-center justify-center gap-1">
                          Xem tin <ExternalLink size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {sending && <p className="text-xs text-slate-400">Đang gợi ý việc làm...</p>}
            <div ref={bottomRef} />
          </div>
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex gap-2">
            <button disabled={sending} onClick={() => void handleSend(QUICK_PROMPT)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-full disabled:opacity-50">
              <Sparkles size={12} /> {QUICK_PROMPT}
            </button>
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSend()}
              disabled={sending}
              placeholder="Nhắn tin với AI..."
              className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm"
            />
            <button onClick={() => void handleSend()} disabled={!input.trim() || sending} className="p-2.5 bg-indigo-600 disabled:opacity-50 text-white rounded-xl">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}

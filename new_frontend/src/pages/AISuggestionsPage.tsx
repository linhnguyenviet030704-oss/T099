import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, MapPin, DollarSign, ExternalLink, Bot, User } from "lucide-react";
import { useApp } from "../context/AppContext";
import { AI_JOB_RESPONSES, formatSalary, JOB_TYPE_LABELS } from "../data/mockData";
import AnimatedPage from "../components/AnimatedPage";
import Badge from "../components/Badge";

interface Message {
  id: string;
  role: "user" | "system";
  text?: string;
  jobIds?: string[];
  error?: boolean;
}

export default function AISuggestionsPage() {
  const { currentUser, jobs, companies } = useApp();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "system",
      text: "Xin chào! Tôi là trợ lý AI của NextJob 👋\nTôi có thể giúp bạn tìm những công việc phù hợp nhất dựa trên hồ sơ của bạn. Hãy hỏi tôi hoặc nhấn chip gợi ý bên dưới!",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [responseIdx, setResponseIdx] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  if (!currentUser) { navigate("/login"); return null; }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const msgText = text || input.trim();
    if (!msgText || sending) return;
    setInput("");
    setSending(true);

    const userMsg: Message = { id: `msg-${Date.now()}`, role: "user", text: msgText };
    setMessages((prev) => [...prev, userMsg]);

    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    const response = AI_JOB_RESPONSES[responseIdx % AI_JOB_RESPONSES.length];
    const sysMsg: Message = {
      id: `sys-${Date.now()}`,
      role: "system",
      text: response.text,
      jobIds: response.jobs,
    };
    setMessages((prev) => [...prev, sysMsg]);
    setResponseIdx((i) => i + 1);
    setSending(false);
  };

  const activeJobs = jobs.filter((j) => j.status === "active");

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Gợi ý việc làm AI</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Được cá nhân hóa theo hồ sơ của bạn</p>
          </div>
        </div>

        {/* Chat window */}
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden" style={{ minHeight: "60vh" }}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white ${msg.role === "system" ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-gradient-to-br from-orange-400 to-pink-500"}`}>
                    {msg.role === "system" ? <Bot size={14} /> : <User size={14} />}
                  </div>

                  <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-2`}>
                    {msg.text && (
                      <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-tr-sm"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm"
                      }`}>
                        {msg.text}
                      </div>
                    )}

                    {/* Job cards */}
                    {msg.jobIds?.map((jid) => {
                      const job = activeJobs.find((j) => j.id === jid);
                      const company = job ? companies.find((c) => c.id === job.companyId) : null;
                      if (!job || !company) return null;
                      return (
                        <motion.div
                          key={jid}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl p-4 w-full shadow-sm"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                              {85 + Math.floor(Math.random() * 14)}% phù hợp
                            </span>
                            <Badge variant="primary">{JOB_TYPE_LABELS[job.type]}</Badge>
                          </div>
                          <p className="font-semibold text-slate-800 dark:text-white text-sm">{job.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{company.name}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>
                            <span className="flex items-center gap-1 text-emerald-600"><DollarSign size={11} />{formatSalary(job)}</span>
                          </div>
                          <button
                            onClick={() => navigate(`/jobs/${job.id}`)}
                            className="mt-3 w-full py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
                          >
                            Xem tin <ExternalLink size={11} />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
            {sending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 bg-slate-400 rounded-full"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick chips */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex gap-2 overflow-x-auto">
            <button
              disabled={sending}
              onClick={() => handleSend("Gợi ý việc phù hợp với tôi")}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 text-xs font-medium rounded-full hover:bg-indigo-100 disabled:opacity-50 transition-colors border border-indigo-100 dark:border-indigo-800"
            >
              <Sparkles size={12} /> Gợi ý việc phù hợp
            </button>
            <button
              disabled={sending}
              onClick={() => handleSend("Tôi muốn tìm việc remote có mức lương cao")}
              className="flex-shrink-0 px-3 py-1.5 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-slate-100 disabled:opacity-50 transition-colors border border-slate-200 dark:border-slate-600"
            >
              Việc remote lương cao
            </button>
            <button
              disabled={sending}
              onClick={() => handleSend("Có vị trí nào ở Hà Nội không?")}
              className="flex-shrink-0 px-3 py-1.5 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-slate-100 disabled:opacity-50 transition-colors border border-slate-200 dark:border-slate-600"
            >
              Việc tại Hà Nội
            </button>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !sending && handleSend()}
                disabled={sending}
                placeholder="Nhắn tin với AI..."
                className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors"
              >
                <Send size={16} />
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}

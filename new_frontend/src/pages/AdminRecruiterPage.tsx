import { useCallback, useEffect, useState } from "react";
import { Search, CheckCircle, XCircle, Clock, Check, X } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { apiJson } from "../lib/api";
import type { Profile, RecruiterRegistrationForm } from "../types";
import { formatDate } from "../lib/format";
import AnimatedPage from "../components/AnimatedPage";

import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";
import { motion } from "framer-motion";

type TabType = "pending" | "approved" | "rejected";

export default function AdminRecruiterPage() {
  const { session } = useAuth();
  const { success, error: toastError } = useToast();
  const [forms, setForms] = useState<RecruiterRegistrationForm[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [activeTab, setActiveTab] = useState<TabType>("pending");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("recruiter_registration_forms").select("*").order("created_at", { ascending: false });
    if (error) {
      toastError("Không tải được danh sách đơn", handleSupabaseError(error));
      return;
    }
    const items = (data || []) as RecruiterRegistrationForm[];
    setForms(items);
    const n: Record<string, string> = {};
    items.forEach((f) => { n[f.id] = f.admin_note || ""; });
    setNotes(n);
    if (items.length > 0) {
      const uids = Array.from(new Set([...items.map((i) => i.user_id), ...items.map((i) => i.reviewed_by_user_id).filter(Boolean) as string[]]));
      const { data: profData } = await supabase.from("profiles").select("*").in("id", uids);
      const map: Record<string, Profile> = {};
      (profData || []).forEach((p: Profile) => { map[p.id] = p; });
      setProfilesMap(map);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleReview = async (id: string, decision: "approved" | "rejected") => {
    if (!session?.access_token || !supabase) return;
    if (decision === "rejected" && !notes[id]?.trim()) return;
    setProcessing(id);
    try {
      await apiJson(`/admin/recruiter-forms/${id}/review`, session.access_token, {
        method: "POST",
        body: JSON.stringify({ decision, admin_note: notes[id]?.trim() || null }),
      });
      success(`Đã ${decision === "approved" ? "phê duyệt" : "từ chối"} thành công!`);
      await load();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Failed to fetch')) {
        const targetForm = forms.find((f) => f.id === id);
        const { error: sbErr } = await supabase
          .from("recruiter_registration_forms")
          .update({
            status: decision,
            admin_note: notes[id]?.trim() || null,
            reviewed_by_user_id: session.user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (!sbErr) {
          if (decision === "approved" && targetForm) {
            await supabase.from("profiles").update({ role: "recruiter" }).eq("id", targetForm.user_id);
          }
          await load();
          success(`Đã ${decision === "approved" ? "phê duyệt" : "từ chối"} đơn thành công!`);
          return;
        }
      }
      toastError("Thao tác thất bại", err instanceof Error ? err.message : handleSupabaseError(err));
    } finally {
      setProcessing(null);
    }
  };

  const filtered = forms.filter((a) => {
    if (a.status !== activeTab) return false;
    const u = profilesMap[a.user_id];
    const q = search.toLowerCase();
    if (q && !a.company_name.toLowerCase().includes(q) && !(u?.email || "").toLowerCase().includes(q) && !(u?.full_name || "").toLowerCase().includes(q)) return false;
    return true;
  });
  const counts = {
    pending: forms.filter((a) => a.status === "pending").length,
    approved: forms.filter((a) => a.status === "approved").length,
    rejected: forms.filter((a) => a.status === "rejected").length,
  };
  const tabs = [
    { key: "pending" as const, label: "Chờ duyệt", icon: Clock, color: "text-amber-600 dark:text-amber-400" },
    { key: "approved" as const, label: "Đã phê duyệt", icon: CheckCircle, color: "text-emerald-600 dark:text-emerald-400" },
    { key: "rejected" as const, label: "Đã từ chối", icon: XCircle, color: "text-red-500 dark:text-red-400" },
  ];

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-2">Duyệt đăng ký Recruiter</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Xem xét và phê duyệt đơn đăng ký nhà tuyển dụng</p>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {tabs.map((tab) => (
            <div key={tab.key} className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 text-center shadow-sm">
              <tab.icon size={20} className={`${tab.color} mx-auto mb-1`} />
              <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">{counts[tab.key]}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{tab.label}</p>
            </div>
          ))}
        </div>
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo công ty, email..." className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white" />
        </div>
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <motion.button
              key={tab.key}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${activeTab === tab.key ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50"}`}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Không có đơn nào trong mục này.
            </div>
          ) : (
            filtered.map((a) => {
              const u = profilesMap[a.user_id];
              return (
                <div key={a.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                  <p className="font-semibold text-slate-900 dark:text-white">{a.company_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{u?.full_name} · {u?.email} · {formatDate(a.created_at)}</p>
                  {a.status === "pending" && (
                    <div className="mt-3 space-y-2">
                      <input value={notes[a.id] || ""} onChange={(e) => setNotes((p) => ({ ...p, [a.id]: e.target.value }))} placeholder="Ghi chú Admin (bắt buộc nếu từ chối)" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white" />
                      <div className="flex gap-2">
                        <Button
                          size="xs"
                          variant="success"
                          leftIcon={<Check size={12} />}
                          isLoading={processing === a.id}
                          onClick={() => void handleReview(a.id, "approved")}
                        >
                          Phê duyệt
                        </Button>
                        <Button
                          size="xs"
                          variant="danger"
                          leftIcon={<X size={12} />}
                          disabled={processing === a.id || !notes[a.id]?.trim()}
                          isLoading={processing === a.id}
                          onClick={() => void handleReview(a.id, "rejected")}
                        >
                          Từ chối
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AnimatedPage>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Search, CheckCircle, XCircle, Clock, Check, X } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { apiJson } from "../lib/api";
import type { Profile, RecruiterRegistrationForm } from "../types";
import { formatDate } from "../lib/format";
import AnimatedPage from "../components/AnimatedPage";

type TabType = "pending" | "approved" | "rejected";

export default function AdminRecruiterPage() {
  const { session } = useAuth();
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
      alert(handleSupabaseError(error));
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
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleReview = async (id: string, decision: "approved" | "rejected") => {
    if (!session?.access_token) return;
    if (decision === "rejected" && !notes[id]?.trim()) return;
    setProcessing(id);
    try {
      await apiJson(`/admin/recruiter-forms/${id}/review`, session.access_token, {
        method: "POST",
        body: JSON.stringify({ decision, admin_note: notes[id]?.trim() || null }),
      });
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : handleSupabaseError(err));
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
    { key: "pending" as const, label: "Chờ duyệt", icon: Clock, color: "text-amber-600" },
    { key: "approved" as const, label: "Đã phê duyệt", icon: CheckCircle, color: "text-emerald-600" },
    { key: "rejected" as const, label: "Đã từ chối", icon: XCircle, color: "text-red-500" },
  ];

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display text-3xl font-bold mb-2">Duyệt đăng ký Recruiter</h1>
        <p className="text-sm text-slate-500 mb-8">Xem xét và phê duyệt đơn đăng ký nhà tuyển dụng</p>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {tabs.map((tab) => (
            <div key={tab.key} className="bg-white dark:bg-slate-800 rounded-xl p-4 border text-center">
              <tab.icon size={20} className={`${tab.color} mx-auto mb-1`} />
              <p className="font-display text-2xl font-bold">{counts[tab.key]}</p>
              <p className="text-xs text-slate-500">{tab.label}</p>
            </div>
          ))}
        </div>
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo công ty, email..." className="w-full pl-10 pr-4 py-3 bg-white border rounded-xl text-sm" />
        </div>
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`px-3 py-1.5 text-sm rounded-xl border ${activeTab === tab.key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white"}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {filtered.map((a) => {
            const u = profilesMap[a.user_id];
            return (
              <div key={a.id} className="bg-white dark:bg-slate-800 rounded-2xl border p-5">
                <p className="font-semibold">{a.company_name}</p>
                <p className="text-xs text-slate-500">{u?.full_name} · {u?.email} · {formatDate(a.created_at)}</p>
                {a.status === "pending" && (
                  <div className="mt-3 space-y-2">
                    <input value={notes[a.id] || ""} onChange={(e) => setNotes((p) => ({ ...p, [a.id]: e.target.value }))} placeholder="Ghi chú Admin (bắt buộc nếu từ chối)" className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs" />
                    <div className="flex gap-2">
                      <button disabled={processing === a.id} onClick={() => void handleReview(a.id, "approved")} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-xl"><Check size={12} /> Phê duyệt</button>
                      <button disabled={processing === a.id || !notes[a.id]?.trim()} onClick={() => void handleReview(a.id, "rejected")} className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-xs rounded-xl"><X size={12} /> Từ chối</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AnimatedPage>
  );
}

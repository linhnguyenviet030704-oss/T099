import { useCallback, useEffect, useState } from "react";
import { Search, CheckCircle, XCircle, Clock, Check, X, Shield, Users, UserCheck } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useLang } from "../context/LangContext";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { apiJson } from "../lib/api";
import type { Profile, ProfileRole, RecruiterRegistrationForm } from "../types";
import { getEnumLabels, formatDate } from "../lib/format";
import AnimatedPage from "../components/AnimatedPage";
import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";
import { motion } from "framer-motion";

type TabType = "pending" | "approved" | "rejected";
type AdminSection = "requests" | "roles";

export default function AdminRecruiterPage() {
  const { session } = useAuth();
  const { lang, t } = useLang();
  const { success, error: toastError } = useToast();
  const [section, setSection] = useState<AdminSection>("requests");
  const [forms, setForms] = useState<RecruiterRegistrationForm[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [activeTab, setActiveTab] = useState<TabType>("pending");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const enumLabels = getEnumLabels(lang);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: formsData, error: formsErr } = await supabase
      .from("recruiter_registration_forms")
      .select("*")
      .order("created_at", { ascending: false });
    if (formsErr) {
      toastError(lang === "en" ? "Failed to load registration list" : "Không tải được danh sách đơn", handleSupabaseError(formsErr));
    } else {
      const items = (formsData || []) as RecruiterRegistrationForm[];
      setForms(items);
      const n: Record<string, string> = {};
      items.forEach((f) => { n[f.id] = f.admin_note || ""; });
      setNotes(n);
    }

    const { data: profData, error: profErr } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (!profErr && profData) {
      const pList = profData as Profile[];
      setAllProfiles(pList);
      const map: Record<string, Profile> = {};
      pList.forEach((p) => { map[p.id] = p; });
      setProfilesMap(map);
    }
  }, [toastError, lang]);

  useEffect(() => { void load(); }, [load]);

  const handleReview = async (id: string, decision: "approved" | "rejected") => {
    if (!supabase || !session?.user?.id) return;
    if (decision === "rejected" && !notes[id]?.trim()) return;
    setProcessing(id);
    try {
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
      if (sbErr) throw sbErr;
      if (decision === "approved" && targetForm) {
        await supabase.from("profiles").update({ role: "recruiter" }).eq("id", targetForm.user_id);
        if (targetForm.company_name) {
          const rawSlug = targetForm.company_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          const slug = `${rawSlug || "company"}-${targetForm.user_id.slice(0, 5)}`;
          const { data: comp } = await supabase.from("companies").insert({
            name: targetForm.company_name,
            slug,
            website_url: targetForm.company_website_url,
            created_by_user_id: targetForm.user_id,
            verification_status: "verified",
          }).select("*").maybeSingle();
          if (comp) {
            await supabase.from("company_members").insert({
              company_id: comp.id,
              user_id: targetForm.user_id,
              role: "owner",
              is_active: true,
            });
          }
        }
      }
      await load();
      success(decision === "approved" ? t.approveSuccess : t.rejectSuccess);
    } catch (err: unknown) {
      toastError(lang === "en" ? "Action failed" : "Thao tác thất bại", handleSupabaseError(err));
    } finally {
      setProcessing(null);
    }
  };

  const handleUpdateRole = async (targetUserId: string, newRole: ProfileRole) => {
    if (!session?.access_token || !supabase) return;
    setProcessing(targetUserId);
    try {
      if (session.access_token) {
        await apiJson(`/admin/profiles/${targetUserId}`, session.access_token, {
          method: "PATCH",
          body: JSON.stringify({ role: newRole }),
        });
      } else {
        const { error: sbErr } = await supabase.from("profiles").update({ role: newRole }).eq("id", targetUserId);
        if (sbErr) throw sbErr;
      }
      success(t.roleChangedSuccess);
      await load();
    } catch (err: unknown) {
      toastError(lang === "en" ? "Failed to update role" : "Cập nhật quyền thất bại", handleSupabaseError(err));
    } finally {
      setProcessing(null);
    }
  };

  const filteredForms = forms.filter((a) => {
    if (a.status !== activeTab) return false;
    const u = profilesMap[a.user_id];
    const q = search.toLowerCase();
    if (q && !a.company_name.toLowerCase().includes(q) && !(u?.email || "").toLowerCase().includes(q) && !(u?.full_name || "").toLowerCase().includes(q)) return false;
    return true;
  });

  const filteredProfiles = allProfiles.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (p.full_name || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q)
    );
  });

  const counts = {
    pending: forms.filter((a) => a.status === "pending").length,
    approved: forms.filter((a) => a.status === "approved").length,
    rejected: forms.filter((a) => a.status === "rejected").length,
  };

  const tabs = [
    { key: "pending" as const, label: t.tabPending, icon: Clock, color: "text-amber-600 dark:text-amber-400" },
    { key: "approved" as const, label: t.tabApproved, icon: CheckCircle, color: "text-emerald-600 dark:text-emerald-400" },
    { key: "rejected" as const, label: t.tabRejected, icon: XCircle, color: "text-red-500 dark:text-red-400" },
  ];

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-2">{t.adminTitle}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t.adminSubtitle}</p>

        {/* Section Navigation Tabs */}
        <div className="flex gap-3 mb-6 border-b border-slate-200 dark:border-slate-700 pb-3">
          <button
            onClick={() => { setSection("requests"); setSearch(""); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
              section === "requests"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <UserCheck size={16} /> {t.recruiterApproval} ({counts.pending})
          </button>
          <button
            onClick={() => { setSection("roles"); setSearch(""); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
              section === "roles"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <Shield size={16} /> {t.roleManagement} ({allProfiles.length})
          </button>
        </div>

        <div className="relative mb-6">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={section === "requests" ? t.searchByCompanyEmail : t.searchByNameEmailRole}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
          />
        </div>

        {section === "requests" ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {tabs.map((tab) => (
                <div key={tab.key} className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 text-center shadow-sm">
                  <tab.icon size={20} className={`${tab.color} mx-auto mb-1`} />
                  <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">{counts[tab.key]}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{tab.label}</p>
                </div>
              ))}
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
              {filteredForms.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t.noFormsFound}
                </div>
              ) : (
                filteredForms.map((a) => {
                  const u = profilesMap[a.user_id];
                  return (
                    <div key={a.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                      <p className="font-semibold text-slate-900 dark:text-white">{a.company_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{u?.full_name} · {u?.email} · {formatDate(a.created_at, false, lang)}</p>
                      {a.status === "pending" && (
                        <div className="mt-3 space-y-2">
                          <input value={notes[a.id] || ""} onChange={(e) => setNotes((p) => ({ ...p, [a.id]: e.target.value }))} placeholder={t.adminNotePlaceholder} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-900 dark:text-white" />
                          <div className="flex gap-2">
                            <Button
                              size="xs"
                              variant="success"
                              leftIcon={<Check size={12} />}
                              isLoading={processing === a.id}
                              onClick={() => void handleReview(a.id, "approved")}
                            >
                              {t.approveBtn}
                            </Button>
                            <Button
                              size="xs"
                              variant="danger"
                              leftIcon={<X size={12} />}
                              disabled={processing === a.id || !notes[a.id]?.trim()}
                              isLoading={processing === a.id}
                              onClick={() => void handleReview(a.id, "rejected")}
                            >
                              {t.rejectBtn}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Users size={16} /> {t.userList} ({filteredProfiles.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredProfiles.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">{t.noUsersFound}</div>
              ) : (
                filteredProfiles.map((p) => (
                  <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm text-slate-900 dark:text-white">{p.full_name || (lang === "en" ? "Unnamed" : "Chưa đặt tên")}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{p.email} · {t.joinedAt(formatDate(p.created_at, false, lang))}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">{t.currentRole}:</span>
                      <select
                        value={p.role}
                        disabled={processing === p.id}
                        onChange={(e) => void handleUpdateRole(p.id, e.target.value as ProfileRole)}
                        className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                      >
                        <option value="candidate">{enumLabels.profile_role.candidate}</option>
                        <option value="recruiter">{enumLabels.profile_role.recruiter}</option>
                        <option value="admin">{enumLabels.profile_role.admin}</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}


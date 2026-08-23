import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, Clock, XCircle, LayoutDashboard } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import type { RecruiterRegistrationForm } from "../types";
import { formatDate } from "../lib/format";
import AnimatedPage from "../components/AnimatedPage";

import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";

export default function RecruiterRegisterPage() {
  const { user } = useAuth();
  const { profile, refreshProfile } = useCurrentProfile();
  const { success } = useToast();
  const [forms, setForms] = useState<RecruiterRegistrationForm[]>([]);
  const [form, setForm] = useState({ companyName: "", companyEmail: "", website: "", licenseUrl: "" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pending = forms.find((f) => f.status === "pending");
  const latest = forms[0];
  const elevated = profile?.role === "recruiter" || profile?.role === "admin";

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase.from("recruiter_registration_forms").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) setMessage(handleSupabaseError(error));
    else {
      const items = (data || []) as RecruiterRegistrationForm[];
      setForms(items);
      const active = items.find((f) => f.status === "pending");
      if (active) {
        setForm({
          companyName: active.company_name || "",
          companyEmail: active.company_email || "",
          website: active.company_website_url || "",
          licenseUrl: active.business_license_storage_path || "",
        });
      }
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (latest?.status === "approved" && profile?.role === "candidate") {
      void refreshProfile();
    }
  }, [latest?.status, profile?.role, refreshProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user || !form.companyName.trim()) {
      setMessage("Tên công ty là bắt buộc.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const payload = {
        company_name: form.companyName.trim(),
        company_email: form.companyEmail.trim() || null,
        company_website_url: form.website.trim() || null,
        business_license_storage_path: form.licenseUrl.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (pending) {
        const { error } = await supabase.from("recruiter_registration_forms").update(payload).eq("id", pending.id).eq("user_id", user.id);
        if (error) throw error;
        success("Đã cập nhật đơn đăng ký!");
      } else {
        const { error } = await supabase.from("recruiter_registration_forms").insert({ ...payload, user_id: user.id, status: "pending" });
        if (error) throw error;
        success("Đã gửi đơn đăng ký thành công!");
      }
      await load();
    } catch (err: unknown) {
      setMessage(handleSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (elevated) {
    return (
      <AnimatedPage className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border p-10 text-center max-w-sm">
          <LayoutDashboard size={40} className="text-emerald-500 mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold mb-2">Bạn đã là Nhà tuyển dụng</h2>
          <Link to="/dashboard" className="block w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm">Đến Bàn tuyển dụng</Link>
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-lg mx-auto px-4 py-10">
        <h1 className="font-display text-3xl font-bold mb-2">Đăng ký Nhà tuyển dụng</h1>
        <p className="text-sm text-slate-500 mb-6">Điền thông tin công ty để Admin phê duyệt</p>
        {latest && !pending && (
          <div className="mb-6 p-4 rounded-xl bg-slate-100 dark:bg-slate-800 border text-sm">
            {latest.status === "approved" ? <CheckCircle2 className="inline text-emerald-500 mr-2" size={16} /> : latest.status === "rejected" ? <XCircle className="inline text-red-500 mr-2" size={16} /> : <Clock className="inline text-amber-500 mr-2" size={16} />}
            Đơn gần nhất: {latest.status} · {formatDate(latest.created_at)}
            {latest.admin_note && <p className="mt-1 text-xs">Ghi chú: {latest.admin_note}</p>}
          </div>
        )}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-3">
          <div className="relative">
            <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input required value={form.companyName} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} placeholder="Tên công ty *" className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
          </div>
          <input value={form.companyEmail} onChange={(e) => setForm((p) => ({ ...p, companyEmail: e.target.value }))} placeholder="Email công ty" className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
          <input value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} placeholder="Website" className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
          <input value={form.licenseUrl} onChange={(e) => setForm((p) => ({ ...p, licenseUrl: e.target.value }))} placeholder="Đường dẫn giấy phép kinh doanh" className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
          {message && <p className="text-xs text-indigo-600 dark:text-indigo-400">{message}</p>}
          <Button
            type="submit"
            isLoading={submitting}
            loadingText="Đang gửi..."
            fullWidth
          >
            {pending ? "Cập nhật đơn" : "Gửi đơn đăng ký"}
          </Button>
        </form>
      </div>
    </AnimatedPage>
  );
}

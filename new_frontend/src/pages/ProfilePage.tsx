import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { User, Phone, Plus, Trash2, FileText, Check } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { apiJson } from "../lib/api";
import type { Profile, UserProfileLine } from "../types";
import { ENUM_LABELS } from "../lib/format";
import AnimatedPage from "../components/AnimatedPage";
import ConfirmModal from "../components/ConfirmModal";

export default function ProfilePage() {
  const { user, session } = useAuth();
  const { profile, isAdmin, refreshProfile } = useCurrentProfile();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lines, setLines] = useState<UserProfileLine[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [lineType, setLineType] = useState<UserProfileLine["name"]>("experience");
  const [lineValue, setLineValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<Profile[]>([]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  const loadLines = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase.from("profile_lines").select("*").eq("user_id", user.id).order("display_order");
    setLines((data || []) as UserProfileLine[]);
  }, [user]);

  useEffect(() => { void loadLines(); }, [loadLines]);
  useEffect(() => {
    if (!isAdmin || !supabase) return;
    void supabase.from("profiles").select("*").order("updated_at", { ascending: false }).limit(50).then(({ data }) => setAdminUsers((data || []) as Profile[]));
  }, [isAdmin]);

  const handleSaveProfile = async () => {
    if (!supabase || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      alert(handleSupabaseError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddLine = async () => {
    if (!supabase || !user || !lineValue.trim()) return;
    const { error } = await supabase.from("profile_lines").insert({
      user_id: user.id, name: lineType, value: lineValue.trim(), display_order: lines.length,
    });
    if (error) alert(handleSupabaseError(error));
    else {
      setLineValue("");
      setShowAdd(false);
      await loadLines();
    }
  };

  const handleDeleteLine = async () => {
    if (!supabase || !user || !deleteId) return;
    await supabase.from("profile_lines").delete().eq("id", deleteId).eq("user_id", user.id);
    setDeleteId(null);
    await loadLines();
  };

  const changeRole = async (userId: string, role: Profile["role"]) => {
    if (!session?.access_token) return;
    try {
      await apiJson(`/admin/profiles/${userId}`, session.access_token, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setAdminUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Không đổi được vai trò.");
    }
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">Hồ sơ</h1>
          <Link to="/cv-vault" className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-xl">
            <FileText size={15} /> Tủ hồ sơ/CV
          </Link>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border p-7 mb-6">
          <h2 className="font-semibold mb-5">Thông tin cá nhân</h2>
          <div className="space-y-3">
            <label className="block text-xs text-slate-500">Họ tên</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border rounded-xl text-sm" />
            </div>
            <label className="block text-xs text-slate-500">Điện thoại</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border rounded-xl text-sm" />
            </div>
            <label className="block text-xs text-slate-500">URL ảnh đại diện</label>
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border rounded-xl text-sm" />
            <button onClick={() => void handleSaveProfile()} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl">
              {saved ? <span className="inline-flex items-center gap-1"><Check size={14} /> Đã lưu</span> : saving ? "Đang lưu..." : "Lưu thông tin"}
            </button>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border p-7 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Dòng hồ sơ</h2>
            <button onClick={() => setShowAdd((v) => !v)} className="flex items-center gap-1 text-sm text-indigo-600"><Plus size={14} /> Thêm dòng</button>
          </div>
          {showAdd && (
            <div className="mb-4 space-y-2">
              <select value={lineType} onChange={(e) => setLineType(e.target.value as UserProfileLine["name"])} className="px-3 py-2 bg-slate-50 border rounded-xl text-sm">
                {Object.entries(ENUM_LABELS.line_type).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <textarea value={lineValue} onChange={(e) => setLineValue(e.target.value)} rows={3} className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-sm" placeholder="Nội dung" />
              <button onClick={() => void handleAddLine()} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-xl">Thêm</button>
            </div>
          )}
          {lines.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có dòng hồ sơ nào.</p>
          ) : lines.map((line) => (
            <div key={line.id} className="flex items-start justify-between gap-3 py-3 border-t border-slate-100">
              <div>
                <p className="text-xs text-indigo-600 font-medium">{ENUM_LABELS.line_type[line.name]}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{line.value}</p>
              </div>
              <button onClick={() => setDeleteId(line.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        {isAdmin && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border p-7">
            <h2 className="font-semibold mb-4">Quản lý người dùng (Admin)</h2>
            <div className="space-y-2">
              {adminUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-100">
                  <span>{u.full_name || u.email}</span>
                  <select value={u.role} onChange={(e) => void changeRole(u.id, e.target.value as Profile["role"])} className="px-2 py-1 border rounded-lg text-xs">
                    {Object.entries(ENUM_LABELS.profile_role).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Xóa dòng hồ sơ"
        message="Bạn có chắc muốn xóa dòng hồ sơ này không?"
        danger
        onConfirm={() => void handleDeleteLine()}
        onCancel={() => setDeleteId(null)}
      />
    </AnimatedPage>
  );
}

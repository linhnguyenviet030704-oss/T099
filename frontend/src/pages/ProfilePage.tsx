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

import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";
import { motion } from "framer-motion";

export default function ProfilePage() {
  const { user, session } = useAuth();
  const { profile, isAdmin, refreshProfile } = useCurrentProfile();
  const { success, error: toastError } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
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
      success("Đã cập nhật thông tin cá nhân!");
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      toastError("Lỗi lưu thông tin", handleSupabaseError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddLine = async () => {
    if (!supabase || !user) return;
    if (!lineValue.trim()) {
      toastError("Thiếu nội dung", "Vui lòng nhập nội dung dòng hồ sơ!");
      return;
    }
    setAddingLine(true);
    try {
      const { error } = await supabase.from("profile_lines").insert({
        user_id: user.id, name: lineType, value: lineValue.trim(), display_order: lines.length,
      });
      if (error) throw error;
      success("Đã thêm dòng hồ sơ!");
      setLineValue("");
      setShowAdd(false);
      await loadLines();
    } catch (err: unknown) {
      toastError("Thêm dòng thất bại", handleSupabaseError(err));
    } finally {
      setAddingLine(false);
    }
  };

  const handleDeleteLine = async () => {
    if (!supabase || !user || !deleteId) return;
    try {
      const { error } = await supabase.from("profile_lines").delete().eq("id", deleteId).eq("user_id", user.id);
      if (error) throw error;
      success("Đã xóa dòng hồ sơ!");
      await loadLines();
    } catch (err: unknown) {
      toastError("Xóa thất bại", handleSupabaseError(err));
    } finally {
      setDeleteId(null);
    }
  };

  const changeRole = async (userId: string, role: Profile["role"]) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
      if (error) throw error;
      setAdminUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      success("Đã đổi vai trò người dùng!");
    } catch (err: unknown) {
      toastError("Không đổi được vai trò", handleSupabaseError(err));
    }
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">Hồ sơ</h1>
          <Link to="/cv-vault" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 transition-colors w-fit">
            <FileText size={15} /> Tủ hồ sơ/CV
          </Link>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border p-5 sm:p-7 mb-6">
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
            <div className="pt-2">
              <Button
                onClick={() => void handleSaveProfile()}
                isLoading={saving}
                loadingText="Đang lưu..."
                leftIcon={saved ? <Check size={16} /> : undefined}
              >
                {saved ? "Đã lưu" : "Lưu thông tin"}
              </Button>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 sm:p-7 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 dark:text-white">Dòng hồ sơ</h2>
            <Button size="xs" variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setShowAdd((v) => !v)}>
              Thêm dòng
            </Button>
          </div>
          {showAdd && (
            <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600 space-y-3">
              <select value={lineType} onChange={(e) => setLineType(e.target.value as UserProfileLine["name"])} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm">
                {Object.entries(ENUM_LABELS.line_type).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <textarea value={lineValue} onChange={(e) => setLineValue(e.target.value)} rows={3} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" placeholder="Nội dung" />
              <div className="flex gap-2 justify-end">
                <Button size="xs" variant="ghost" onClick={() => setShowAdd(false)}>Hủy</Button>
                <Button size="xs" onClick={() => void handleAddLine()} isLoading={addingLine} loadingText="Đang thêm...">
                  Thêm
                </Button>
              </div>
            </div>
          )}
          {lines.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có dòng hồ sơ nào.</p>
          ) : lines.map((line) => (
            <div key={line.id} className="flex items-start justify-between gap-3 py-3 border-t border-slate-100 dark:border-slate-700">
              <div className="min-w-0 flex-1 break-words">
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">{ENUM_LABELS.line_type[line.name]}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line mt-0.5">{line.value}</p>
              </div>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setDeleteId(line.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></motion.button>
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

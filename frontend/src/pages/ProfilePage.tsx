import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { User, Phone, Plus, Trash2, Edit2, FileText, Check, X, Save } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import type { Profile, UserProfileLine } from "../types";
import { getEnumLabels } from "../lib/format";
import { getLineTypeOptions, getLineTypeLabel } from "../lib/profileLines";
import { handleTextareaTabKey } from "../lib/entryFormat";
import FormattedEntry from "../components/FormattedEntry";
import EntryIndentToolbar from "../components/EntryIndentToolbar";
import EntryLivePreview from "../components/EntryLivePreview";
import AnimatedPage from "../components/AnimatedPage";
import ConfirmModal from "../components/ConfirmModal";
import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";
import { useLang } from "../context/LangContext";
import { motion } from "framer-motion";

export default function ProfilePage() {
  const { user } = useAuth();
  const { profile, isAdmin, refreshProfile } = useCurrentProfile();
  const { success, error: toastError } = useToast();
  const { lang, t } = useLang();
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

  // State for inline editing of existing entries
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<UserProfileLine["name"]>("experience");
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const addTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const enumLabels = getEnumLabels(lang);
  const lineTypeOptions = getLineTypeOptions(lang);

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
      success(lang === "en" ? "Profile updated successfully!" : "Đã cập nhật thông tin cá nhân!");
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      toastError(lang === "en" ? "Save Error" : "Lỗi lưu thông tin", handleSupabaseError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddLine = async () => {
    if (!supabase || !user) return;
    if (!lineValue.trim()) {
      toastError(
        lang === "en" ? "Missing content" : "Thiếu nội dung",
        lang === "en" ? "Please enter entry content!" : "Vui lòng nhập nội dung dòng hồ sơ!",
      );
      return;
    }
    setAddingLine(true);
    try {
      const { error } = await supabase.from("profile_lines").insert({
        user_id: user.id, name: lineType, value: lineValue.trim(), display_order: lines.length,
      });
      if (error) throw error;
      success(lang === "en" ? "Added profile entry!" : "Đã thêm dòng hồ sơ!");
      setLineValue("");
      setShowAdd(false);
      await loadLines();
    } catch (err: unknown) {
      toastError(lang === "en" ? "Failed to add" : "Thêm dòng thất bại", handleSupabaseError(err));
    } finally {
      setAddingLine(false);
    }
  };

  const startEdit = (line: UserProfileLine) => {
    setEditingId(line.id);
    setEditType(line.name);
    setEditValue(line.value || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleUpdateLine = async () => {
    if (!supabase || !user || !editingId) return;
    if (!editValue.trim()) {
      toastError(
        lang === "en" ? "Missing content" : "Thiếu nội dung",
        lang === "en" ? "Please enter entry content!" : "Vui lòng nhập nội dung dòng hồ sơ!",
      );
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase.from("profile_lines").update({
        name: editType,
        value: editValue.trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", editingId).eq("user_id", user.id);
      if (error) throw error;
      success(t.updatedItemSuccess || (lang === "en" ? "Entry updated successfully!" : "Đã cập nhật dòng hồ sơ!"));
      setEditingId(null);
      await loadLines();
    } catch (err: unknown) {
      toastError(lang === "en" ? "Update failed" : "Cập nhật thất bại", handleSupabaseError(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteLine = async () => {
    if (!supabase || !user || !deleteId) return;
    try {
      const { error } = await supabase.from("profile_lines").delete().eq("id", deleteId).eq("user_id", user.id);
      if (error) throw error;
      success(lang === "en" ? "Entry deleted!" : "Đã xóa dòng hồ sơ!");
      if (editingId === deleteId) setEditingId(null);
      await loadLines();
    } catch (err: unknown) {
      toastError(lang === "en" ? "Delete failed" : "Xóa thất bại", handleSupabaseError(err));
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
      success(lang === "en" ? "Role changed!" : "Đã đổi vai trò người dùng!");
    } catch (err: unknown) {
      toastError(lang === "en" ? "Cannot change role" : "Không đổi được vai trò", handleSupabaseError(err));
    }
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">{t.profileTitle}</h1>
          <Link to="/cv-vault" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 transition-colors w-fit font-medium">
            <FileText size={15} /> {t.cvVaultTitle}
          </Link>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 sm:p-7 mb-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-5">{t.personalInfo}</h2>
          <div className="space-y-3">
            <label className="block text-xs text-slate-500">{t.fullName}</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white" />
            </div>
            <label className="block text-xs text-slate-500">{t.phone}</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white" />
            </div>
            <label className="block text-xs text-slate-500">{t.avatarUrl}</label>
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white" />
            <div className="pt-2">
              <Button
                onClick={() => void handleSaveProfile()}
                isLoading={saving}
                loadingText={t.savingProfile}
                leftIcon={saved ? <Check size={16} /> : undefined}
              >
                {saved ? t.saved : t.saveInfo}
              </Button>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 sm:p-7 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t.profileItems}</h2>
            <Button size="xs" variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setShowAdd((v) => !v)}>
              {t.addItem}
            </Button>
          </div>
          {showAdd && (
            <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600 space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {lang === 'en' ? 'Category' : 'Phân loại'}
                </label>
                <select value={lineType} onChange={(e) => setLineType(e.target.value as UserProfileLine["name"])} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white">
                  {lineTypeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t.itemContent}
                </label>
                <EntryIndentToolbar
                  textareaRef={addTextareaRef}
                  value={lineValue}
                  onChange={setLineValue}
                  lang={lang}
                />
                <textarea
                  ref={addTextareaRef}
                  value={lineValue}
                  onChange={(e) => setLineValue(e.target.value)}
                  onKeyDown={(e) => handleTextareaTabKey(e, setLineValue)}
                  rows={4}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder={lang === 'en' ? "e.g.\nWork skills:\n- Project management\n  - Agile methodology" : "Ví dụ:\nWork skills:\n- Project management, time management\n  - Agile & Scrum\n- Good teamwork"}
                />
                <EntryLivePreview value={lineValue} lang={lang} />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button size="xs" variant="ghost" onClick={() => setShowAdd(false)}>{t.cancel}</Button>
                <Button size="xs" onClick={() => void handleAddLine()} isLoading={addingLine} loadingText={lang === "en" ? "Adding..." : "Đang thêm..."}>
                  {t.add}
                </Button>
              </div>
            </div>
          )}

          {lines.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t.noItems}</p>
          ) : lines.map((line) => {
            const isEditing = editingId === line.id;

            if (isEditing) {
              return (
                <div key={line.id} className="my-3 p-4 bg-indigo-50/50 dark:bg-slate-700/70 rounded-2xl border border-indigo-200 dark:border-indigo-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                      {t.editItemTitle || (lang === 'en' ? 'Edit Entry' : 'Chỉnh sửa dòng')}
                    </span>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {lang === 'en' ? 'Category' : 'Phân loại'}
                    </label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as UserProfileLine["name"])}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white"
                    >
                      {lineTypeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t.itemContent}
                    </label>
                    <EntryIndentToolbar
                      textareaRef={editTextareaRef}
                      value={editValue}
                      onChange={setEditValue}
                      lang={lang}
                    />
                    <textarea
                      ref={editTextareaRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleTextareaTabKey(e, setEditValue)}
                      rows={4}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <EntryLivePreview value={editValue} lang={lang} />
                  </div>

                  <div className="flex gap-2 justify-end pt-1">
                    <Button size="xs" variant="ghost" onClick={cancelEdit}>
                      {t.cancel}
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => void handleUpdateLine()}
                      isLoading={savingEdit}
                      leftIcon={<Save size={14} />}
                    >
                      {t.saveChanges || (lang === 'en' ? 'Save Changes' : 'Lưu thay đổi')}
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div key={line.id} className="flex items-start justify-between gap-3 py-3.5 border-t border-slate-100 dark:border-slate-700 group hover:bg-slate-50/50 dark:hover:bg-slate-700/20 px-2 rounded-xl transition">
                <div className="min-w-0 flex-1 break-words">
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 mb-1.5">
                    {getLineTypeLabel(line.name, lang)}
                  </span>
                  <FormattedEntry value={line.value} />
                </div>
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => startEdit(line)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                    title={t.editItem || (lang === "en" ? "Edit entry" : "Sửa dòng")}
                  >
                    <Edit2 size={16} />
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => setDeleteId(line.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors cursor-pointer rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                    title={t.delete || (lang === "en" ? "Delete" : "Xóa")}
                  >
                    <Trash2 size={16} />
                  </motion.button>
                </div>
              </div>
            );
          })}
        </div>
        {isAdmin && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-7">
            <h2 className="font-semibold text-slate-900 dark:text-white mb-4">{t.userManagement}</h2>
            <div className="space-y-2">
              {adminUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-800 dark:text-slate-200">{u.full_name || u.email}</span>
                  <select value={u.role} onChange={(e) => void changeRole(u.id, e.target.value as Profile["role"])} className="px-2 py-1 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-lg text-xs text-slate-900 dark:text-white">
                    {Object.entries(enumLabels.profile_role).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        open={Boolean(deleteId)}
        title={t.deleteItemTitle}
        message={t.deleteItemMsg}
        danger
        onConfirm={() => void handleDeleteLine()}
        onCancel={() => setDeleteId(null)}
      />
    </AnimatedPage>
  );
}

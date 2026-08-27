import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, Star, Edit2, ExternalLink, Check, Copy, FileEdit, Globe, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiJson } from "../lib/api";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { buildResumeStoragePath, getResumeSignedUrl } from "../lib/storage";
import { INDEX_FAIL_COPY, ingestResume } from "../lib/ingest";
import { formatDate } from "../lib/format";
import type { Resume } from "../types";
import AnimatedPage from "../components/AnimatedPage";
import Button from "../components/ui/Button";
import ConfirmModal from "../components/ConfirmModal";
import PublicCVModal from "../components/candidate/PublicCVModal";
import { useToast } from "../context/ToastContext";
import { useLang } from "../context/LangContext";
import { motion } from "framer-motion";


export default function CVVaultPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { lang, t } = useLang();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [appCounts, setAppCounts] = useState<Record<string, number>>({});
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [publicModalTarget, setPublicModalTarget] = useState<Resume | null>(null);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Resume | null>(null);
  const [deleting, setDeleting] = useState(false);



  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const { data: resumesData, error } = await supabase.from("resumes").select("*").eq("user_id", user.id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at", { ascending: false });
    if (error) {
      setMessage(handleSupabaseError(error));
      return;
    }
    setResumes((resumesData || []) as Resume[]);
    const { data: appsData } = await supabase.from("job_submits").select("resume_id").eq("applicant_user_id", user.id);
    const counts: Record<string, number> = {};
    (appsData || []).forEach((app: { resume_id?: string }) => {
      if (app.resume_id) counts[app.resume_id] = (counts[app.resume_id] || 0) + 1;
    });
    setAppCounts(counts);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const handleUpload = async () => {
    if (!supabase || !user || !file) return;
    const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB max limit
    if (file.size > MAX_SIZE_BYTES) {
      const msg = lang === 'en'
        ? `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds 10MB limit.`
        : `Dung lượng file (${(file.size / 1024 / 1024).toFixed(1)}MB) vượt quá giới hạn tối đa 10MB.`;
      setMessage(msg);
      toastError(lang === 'en' ? "Upload failed" : "Tải CV thất bại", msg);
      return;
    }
    setUploading(true);
    setMessage(null);
    const resumeId = crypto.randomUUID();
    const storagePath = buildResumeStoragePath(user.id, resumeId, file.name);
    try {
      const { error: uploadErr } = await supabase.storage.from("resumes").upload(storagePath, file, { upsert: false });
      if (uploadErr) throw uploadErr;
      const { error: dbErr } = await supabase.from("resumes").insert({
        id: resumeId, user_id: user.id, bucket_id: "resumes", storage_path: storagePath,
        original_filename: file.name, title: title.trim() || file.name, mime_type: file.type,
        size_bytes: file.size, is_default: resumes.length === 0,
      });
      if (dbErr) {
        await supabase.storage.from("resumes").remove([storagePath]);
        throw dbErr;
      }
      if (session?.access_token) {
        try { await ingestResume(resumeId, session.access_token); } catch { setMessage(INDEX_FAIL_COPY); }
      }
      success(lang === 'en' ? "CV uploaded successfully!" : "Tải CV lên thành công!");
      setFile(null);
      setTitle("");
      setShowUpload(false);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : handleSupabaseError(err);
      setMessage(msg);
      toastError(lang === 'en' ? "Upload failed" : "Tải CV thất bại", msg);
    } finally {
      setUploading(false);
    }
  };

  const handleSetDefault = async (resumeId: string) => {
    if (!supabase || !user) return;
    try {
      const { error } = await supabase.from("profiles").update({ default_resume_id: resumeId }).eq("id", user.id);
      if (error) throw error;
      success(lang === 'en' ? "Set as default CV!" : "Đã đặt làm CV mặc định!");
      await load();
    } catch (err: unknown) {
      toastError(lang === 'en' ? "Cannot set default" : "Không thể đặt CV mặc định", handleSupabaseError(err));
    }
  };

  const handleRename = async (resumeId: string) => {
    if (!supabase || !user) return;
    if (!editName.trim()) {
      toastError(
        lang === 'en' ? "Missing CV title" : "Thiếu tên CV",
        lang === 'en' ? "Please enter a new title for the CV!" : "Vui lòng nhập tên mới cho CV!",
      );
      return;
    }
    try {
      const { error } = await supabase.from("resumes").update({ title: editName.trim() }).eq("id", resumeId).eq("user_id", user.id);
      if (error) throw error;
      success(lang === 'en' ? "CV renamed successfully!" : "Đã đổi tên CV thành công!");
      setEditingId(null);
      await load();
    } catch (err: unknown) {
      toastError(lang === 'en' ? "Rename failed" : "Không đổi tên được", handleSupabaseError(err));
    }
  };

  const handleTogglePublic = (resume: Resume, makePublic: boolean) => {
    if (makePublic) {
      setPublicModalTarget(resume);
    } else {
      void handleSetPublicStatus(resume.id, false);
    }
  };

  const handleSetPublicStatus = async (resumeId: string, isPublic: boolean) => {
    if (!user) return;
    setTogglingPublic(true);
    try {
      if (session?.access_token) {
        await apiJson<{ id: string; is_public: boolean; message: string }>(
          `/resumes/${resumeId}/public`,
          session.access_token,
          {
            method: "PATCH",
            body: JSON.stringify({ is_public: isPublic }),
          }
        );
      } else if (supabase) {
        if (isPublic) {
          await supabase.from("resumes").update({ is_public: false }).eq("user_id", user.id);
          const { error } = await supabase.from("resumes").update({ is_public: true }).eq("id", resumeId).eq("user_id", user.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("resumes").update({ is_public: false }).eq("id", resumeId).eq("user_id", user.id);
          if (error) throw error;
        }
      }

      setResumes((prev) =>
        prev.map((r) => {
          if (r.id === resumeId) return { ...r, is_public: isPublic };
          if (isPublic) return { ...r, is_public: false };
          return r;
        })
      );

      if (isPublic) {
        success(lang === 'en' ? "CV is now Public (Job Seeking)!" : "Đã đặt CV làm công khai (Đang tìm việc)!");
      } else {
        success(lang === 'en' ? "CV is no longer public." : "Đã tắt trạng thái công khai của CV.");
      }
      setPublicModalTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : handleSupabaseError(err);
      toastError(lang === 'en' ? "Update failed" : "Cập nhật thất bại", msg);
    } finally {
      setTogglingPublic(false);
    }
  };

  const handleDeleteResume = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      if (session?.access_token) {
        await apiJson<{ id: string; deleted: boolean; message: string }>(
          `/resumes/${deleteTarget.id}`,
          session.access_token,
          { method: "DELETE" }
        );
      } else if (supabase) {
        const { error } = await supabase
          .from("resumes")
          .update({
            deleted_at: new Date().toISOString(),
            is_public: false,
            is_default: false,
          })
          .eq("id", deleteTarget.id)
          .eq("user_id", user.id);
        if (error) throw error;
        await supabase
          .from("profiles")
          .update({ default_resume_id: null })
          .eq("id", user.id)
          .eq("default_resume_id", deleteTarget.id);
        await supabase
          .from("embedded_resumes")
          .delete()
          .eq("resume_id", deleteTarget.id);
      }

      setResumes((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      success(t.deleteCVSuccess);
      setDeleteTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : handleSupabaseError(err);
      toastError(t.deleteCVFailed, msg);
    } finally {
      setDeleting(false);
    }
  };


  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">{t.cvVaultTitle}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {lang === 'en' ? `${resumes.length} saved CVs` : `${resumes.length} CV đang lưu`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <Button variant="outline" size="sm" leftIcon={<FileText size={15} />} onClick={() => navigate("/cv-builder")}>
              {t.createCV}
            </Button>
            <Button size="sm" leftIcon={<Upload size={15} />} onClick={() => setShowUpload((v) => !v)}>
              {t.uploadCV}
            </Button>
          </div>
        </div>
        {showUpload && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-indigo-300 dark:border-slate-600 p-4 sm:p-6 mb-6 space-y-3">
            <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => {
              const selected = e.target.files?.[0];
              if (!selected) return;
              setFile(selected);
              if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
            }} className="text-sm text-slate-600 dark:text-slate-300 w-full overflow-hidden" />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={lang === 'en' ? "Name this CV..." : "Đặt tên cho CV..."} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white" />
            <Button onClick={() => void handleUpload()} disabled={!file} isLoading={uploading} loadingText={lang === 'en' ? "Uploading..." : "Đang tải lên..."}>
              {t.uploadCV}
            </Button>
            {message && <p className="text-xs text-amber-600 dark:text-amber-400">{message}</p>}
          </div>
        )}
        <div className="space-y-3">
          {resumes.map((r) => (
            <div key={r.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1 break-words">
                {editingId === r.id ? (
                  <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="px-2 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm flex-1 text-slate-900 dark:text-white" />
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => void handleRename(r.id)} className="p-1 text-indigo-600 dark:text-indigo-400 cursor-pointer"><Check size={16} /></motion.button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm text-slate-900 dark:text-white break-all">{r.title || r.original_filename}</p>
                    {r.is_public && (
                      <span className="text-xs px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Đang tìm việc
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {formatDate(r.created_at)} · {appCounts[r.id] || 0} {lang === 'en' ? 'applications' : 'đơn'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 flex-wrap">
                {r.is_default && (
                  <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300 rounded-full font-medium mr-1">
                    {lang === 'en' ? 'Default' : 'Mặc định'}
                  </span>
                )}
                {!r.is_default && (
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => void handleSetDefault(r.id)} className="p-2 text-slate-400 hover:text-amber-500 transition-colors cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" title={lang === 'en' ? "Set as default" : "Đặt mặc định"}><Star size={16} /></motion.button>
                )}

                {/* Public / Job-Seeking Toggle Button */}
                {r.is_public ? (
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleTogglePublic(r, false)}
                    className="px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-rose-50 hover:text-rose-600 dark:bg-emerald-950/40 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 border border-emerald-200 dark:border-emerald-800 hover:border-rose-200 dark:hover:border-rose-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-medium"
                    title="Bấm để tắt trạng thái công khai"
                  >
                    <Globe size={14} className="text-emerald-600 dark:text-emerald-400" />
                    <span>Đang tìm việc</span>
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleTogglePublic(r, true)}
                    className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-slate-200 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-medium"
                    title="Đặt làm CV công khai (Đang tìm việc)"
                  >
                    <Globe size={14} />
                    <span>Công khai</span>
                  </motion.button>
                )}

                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => navigate(`/cv-builder?id=${r.id}`)}
                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  title={t.editCVContent}
                >
                  <FileEdit size={14} />
                  <span>{t.editCVContent}</span>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => navigate(`/cv-builder?cloneId=${r.id}`)}
                  className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  title={t.duplicateCV}
                >
                  <Copy size={16} />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => { setEditingId(r.id); setEditName(r.title || ""); }}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  title={t.renameCV}
                >
                  <Edit2 size={16} />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => void getResumeSignedUrl(r.storage_path).then((url) => window.open(url, "_blank"))}
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  title={lang === 'en' ? "View PDF" : "Xem PDF"}
                >
                  <ExternalLink size={16} />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setDeleteTarget(r)}
                  className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  title={t.deleteCV}
                >
                  <Trash2 size={16} />
                </motion.button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5-second Confirmation Modal for Public CV */}
      <PublicCVModal
        isOpen={Boolean(publicModalTarget)}
        cvTitle={publicModalTarget ? (publicModalTarget.title || publicModalTarget.original_filename) : ""}
        onClose={() => setPublicModalTarget(null)}
        onConfirm={() => {
          if (publicModalTarget) {
            void handleSetPublicStatus(publicModalTarget.id, true);
          }
        }}
        isSubmitting={togglingPublic}
      />

      {/* Confirmation Modal for Delete CV */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={t.deleteCVConfirmTitle}
        message={t.deleteCVConfirmDesc}
        confirmLabel={deleting ? (lang === 'en' ? "Deleting..." : "Đang xóa...") : t.delete}
        cancelLabel={t.cancel}
        danger={true}
        onConfirm={() => void handleDeleteResume()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AnimatedPage>
  );
}




import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, Star, Edit2, ExternalLink, Check } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { buildResumeStoragePath, getResumeSignedUrl } from "../lib/storage";
import { INDEX_FAIL_COPY, ingestResume } from "../lib/ingest";
import { formatDate } from "../lib/format";
import type { Resume } from "../types";
import AnimatedPage from "../components/AnimatedPage";

import Button from "../components/ui/Button";
import { useToast } from "../context/ToastContext";
import { motion } from "framer-motion";

export default function CVVaultPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [appCounts, setAppCounts] = useState<Record<string, number>>({});
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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
      const msg = `Dung lượng file (${(file.size / 1024 / 1024).toFixed(1)}MB) vượt quá giới hạn tối đa 10MB.`;
      setMessage(msg);
      toastError("Tải CV thất bại", msg);
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
      success("Tải CV lên thành công!");
      setFile(null);
      setTitle("");
      setShowUpload(false);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : handleSupabaseError(err);
      setMessage(msg);
      toastError("Tải CV thất bại", msg);
    } finally {
      setUploading(false);
    }
  };

  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleSetDefault = async (resumeId: string) => {
    if (!supabase || !user) return;
    setProcessingId(resumeId);
    try {
      const { error } = await supabase.from("profiles").update({ default_resume_id: resumeId }).eq("id", user.id);
      if (error) throw error;
      success("Đã đặt làm CV mặc định!");
      await load();
    } catch (err: unknown) {
      toastError("Không thể đặt CV mặc định", handleSupabaseError(err));
    } finally {
      setProcessingId(null);
    }
  };

  const handleRename = async (resumeId: string) => {
    if (!supabase || !user) return;
    if (!editName.trim()) {
      toastError("Thiếu tên CV", "Vui lòng nhập tên mới cho CV!");
      return;
    }
    setProcessingId(resumeId);
    try {
      const { error } = await supabase.from("resumes").update({ title: editName.trim() }).eq("id", resumeId).eq("user_id", user.id);
      if (error) throw error;
      success("Đã đổi tên CV thành công!");
      setEditingId(null);
      await load();
    } catch (err: unknown) {
      toastError("Không đổi tên được", handleSupabaseError(err));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">Tủ hồ sơ/CV</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{resumes.length} CV đang lưu</p>
          </div>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <Button variant="outline" size="sm" leftIcon={<FileText size={15} />} onClick={() => navigate("/cv-builder")}>
              Tạo CV
            </Button>
            <Button size="sm" leftIcon={<Upload size={15} />} onClick={() => setShowUpload((v) => !v)}>
              Tải lên
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
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Đặt tên cho CV..." className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm" />
            <Button onClick={() => void handleUpload()} disabled={!file} isLoading={uploading} loadingText="Đang tải lên...">
              Tải lên
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
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="px-2 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm flex-1" />
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => void handleRename(r.id)} className="p-1 text-indigo-600"><Check size={16} /></motion.button>
                  </div>
                ) : (
                  <p className="font-medium text-sm text-slate-900 dark:text-white break-all">{r.title || r.original_filename}</p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(r.created_at)} · {appCounts[r.id] || 0} đơn</p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {r.is_default && <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full font-medium">Mặc định</span>}
                {!r.is_default && (
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => void handleSetDefault(r.id)} className="p-2 text-slate-400 hover:text-amber-500 transition-colors" title="Đặt mặc định"><Star size={16} /></motion.button>
                )}
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setEditingId(r.id); setEditName(r.title || ""); }} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><Edit2 size={16} /></motion.button>
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => void getResumeSignedUrl(r.storage_path).then((url) => window.open(url, "_blank"))} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><ExternalLink size={16} /></motion.button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedPage>
  );
}

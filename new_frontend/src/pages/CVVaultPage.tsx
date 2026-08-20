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

export default function CVVaultPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
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
    const { data: resumesData, error } = await supabase.from("resumes").select("*").is("deleted_at", null).order("is_default", { ascending: false }).order("created_at", { ascending: false });
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
      setFile(null);
      setTitle("");
      setShowUpload(false);
      await load();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : handleSupabaseError(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSetDefault = async (resumeId: string) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from("profiles").update({ default_resume_id: resumeId }).eq("id", user.id);
    if (error) alert(handleSupabaseError(error));
    else await load();
  };

  const handleRename = async (resumeId: string) => {
    if (!supabase || !editName.trim()) return;
    const { error } = await supabase.from("resumes").update({ title: editName.trim() }).eq("id", resumeId).eq("user_id", user!.id);
    if (error) alert(handleSupabaseError(error));
    setEditingId(null);
    await load();
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Tủ hồ sơ/CV</h1>
            <p className="text-sm text-slate-500 mt-1">{resumes.length} CV đang lưu</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate("/cv-builder")} className="flex items-center gap-2 px-4 py-2.5 bg-white border rounded-xl text-sm">
              <FileText size={15} /> Tạo CV
            </button>
            <button onClick={() => setShowUpload((v) => !v)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm">
              <Upload size={15} /> Tải lên
            </button>
          </div>
        </div>
        {showUpload && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-indigo-300 p-6 mb-6 space-y-3">
            <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => {
              const selected = e.target.files?.[0];
              if (!selected) return;
              setFile(selected);
              if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
            }} />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Đặt tên cho CV..." className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-sm" />
            <button onClick={() => void handleUpload()} disabled={!file || uploading} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl disabled:opacity-60">
              {uploading ? "Đang tải..." : "Tải lên"}
            </button>
            {message && <p className="text-xs text-amber-600">{message}</p>}
          </div>
        )}
        <div className="space-y-3">
          {resumes.map((r) => (
            <div key={r.id} className="bg-white dark:bg-slate-800 rounded-2xl border p-4 flex items-center justify-between gap-3">
              <div>
                {editingId === r.id ? (
                  <div className="flex gap-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="px-2 py-1 border rounded-lg text-sm" />
                    <button onClick={() => void handleRename(r.id)} className="text-indigo-600"><Check size={14} /></button>
                  </div>
                ) : (
                  <p className="font-medium text-sm">{r.title || r.original_filename}</p>
                )}
                <p className="text-xs text-slate-500">{formatDate(r.created_at)} · {appCounts[r.id] || 0} đơn</p>
              </div>
              <div className="flex items-center gap-2">
                {r.is_default && <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">Mặc định</span>}
                {!r.is_default && (
                  <button onClick={() => void handleSetDefault(r.id)} className="p-2 text-slate-400 hover:text-amber-500" title="Đặt mặc định"><Star size={14} /></button>
                )}
                <button onClick={() => { setEditingId(r.id); setEditName(r.title || ""); }} className="p-2 text-slate-400"><Edit2 size={14} /></button>
                <button onClick={() => void getResumeSignedUrl(r.storage_path).then((url) => window.open(url, "_blank"))} className="p-2 text-slate-400"><ExternalLink size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedPage>
  );
}

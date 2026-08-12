import React, { useEffect, useState, useCallback } from 'react';
import { 
  FileText, 
  Upload, 
  Check, 
  Star, 
  Eye, 
  Edit3, 
  AlertCircle, 
  Clock, 
  ArrowUpRight, 
  Info,
  Layers,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useCurrentProfile } from '../profile/ProfileProvider';
import { Resume, UserProfileLine } from '../types';
import { buildResumeStoragePath, getResumeSignedUrl } from '../lib/storage';
import { formatDate } from '../lib/format';
import { CvBuilderContainer } from '../components/cv/CvBuilderContainer';

export const ResumesPage: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useCurrentProfile();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [appCounts, setAppCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CV builder mode
  const [cvMode, setCvMode] = useState(false);
  const [sourceLines, setSourceLines] = useState<UserProfileLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  // Form states
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Edit states per item
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Load user CVs logic
  const loadResumesWorkspace = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch active resumes
      const { data: resumesData, error: rErr } = await supabase
        .from('resumes')
        .select('*')
        .is('deleted_at', null)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (rErr) throw rErr;

      // Query candidate applications to count usages per CV
      const { data: appsData, error: aErr } = await supabase
        .from('applications')
        .select('resume_id')
        .eq('applicant_user_id', user.id);

      if (aErr) throw aErr;

      // Create usage tally
      const counts: Record<string, number> = {};
      (appsData || []).forEach((app: any) => {
        if (app.resume_id) {
          counts[app.resume_id] = (counts[app.resume_id] || 0) + 1;
        }
      });

      setResumes(resumesData || []);
      setAppCounts(counts);
    } catch (err: any) {
      console.error('Error loading resumes:', err);
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadResumesWorkspace();
    }
  }, [user, loadResumesWorkspace]);

  // Open CV builder: fetch the user's profile lines as the source pool.
  const handleOpenCvBuilder = async () => {
    if (!supabase || !user) return;
    try {
      setLoadingLines(true);
      const { data, error: lErr } = await supabase
        .from('user_profile_lines')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (lErr) throw lErr;
      setSourceLines(data || []);
      setCvMode(true);
    } catch (err: any) {
      setError(handleSupabaseError(err));
    } finally {
      setLoadingLines(false);
    }
  };

  // File selection verification
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const allowedMime = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedMime.includes(selected.type)) {
      setUploadMessage({
        type: 'error',
        text: 'Định dạng tài liệu không phù hợp. Chỉ chấp nhận tệp có dạng PDF, DOC, DOCX.'
      });
      setFile(null);
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setUploadMessage({
        type: 'error',
        text: 'Dung lượng tập tin vượt quá mức cho phép. Giới hạn tối đa là 10 Megabytes.'
      });
      setFile(null);
      return;
    }

    setFile(selected);
    setUploadMessage(null);
    if (!title) {
      // Prefill title with initial name minus extension
      const nameOnly = selected.name.substring(0, selected.name.lastIndexOf('.'));
      setTitle(nameOnly);
    }
  };

  // Execution CV upload logic
  const handleUploadResume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user || !file) return;

    setUploading(true);
    setUploadMessage(null);

    // 1. Generate unique resume identifier
    const resumeId = crypto.randomUUID();

    // 2. Format safe filename and Storage destination route
    const storagePath = buildResumeStoragePath(user.id, resumeId, file.name);

    try {
      // 3. Upload raw file to target bucket
      const { error: uploadErr } = await supabase.storage
        .from('resumes')
        .upload(storagePath, file, { upsert: false });

      if (uploadErr) {
        throw new Error(`[Lỗi Storage]: ${uploadErr.message}`);
      }

      // Check if this is current candidate's first active resume
      const isFirst = resumes.length === 0;

      // 4. Attempt inserting database metadata record
      const newResume = {
        id: resumeId,
        user_id: user.id,
        bucket_id: 'resumes',
        storage_path: storagePath,
        original_filename: file.name,
        title: title.trim() || file.name,
        mime_type: file.type,
        size_bytes: file.size,
        is_default: isFirst,
      };

      const { error: dbErr } = await supabase
        .from('resumes')
        .insert(newResume);

      if (dbErr) {
        // Rollback: Database record creation failed, remove file from storage
        console.warn('DB record creation failed, executing storage rollback...');
        await supabase.storage.from('resumes').remove([storagePath]);
        throw dbErr;
      }

      setUploadMessage({ type: 'success', text: 'Tải lên tài liệu và khởi tạo hồ sơ thành công!' });
      setFile(null);
      setTitle('');
      await loadResumesWorkspace();
    } catch (err: any) {
      console.error('Upload CV flow crash:', err);
      setUploadMessage({ type: 'error', text: err.message || handleSupabaseError(err) });
    } finally {
      setUploading(false);
    }
  };

  // Change default resume
  const handleSetDefault = async (resumeId: string) => {
    if (!supabase || !user) return;
    try {
      setSavingId(resumeId);
      
      // Update all resumes of this user to is_default = false
      const { error: resetErr } = await supabase
        .from('resumes')
        .update({ is_default: false })
        .eq('user_id', user.id);

      if (resetErr) throw resetErr;

      // Set this particular resume as true
      const { error: confirmErr } = await supabase
        .from('resumes')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', resumeId)
        .eq('user_id', user.id);

      if (confirmErr) throw confirmErr;

      await loadResumesWorkspace();
    } catch (err: any) {
      console.error('Set default error:', err);
      alert(handleSupabaseError(err));
    } finally {
      setSavingId(null);
    }
  };

  // Save modified title
  const handleSaveTitleEdit = async (resumeId: string) => {
    if (!supabase || !user) return;
    if (!editTitle.trim()) return;

    try {
      setSavingId(resumeId);
      const { error } = await supabase
        .from('resumes')
        .update({ title: editTitle.trim(), updated_at: new Date().toISOString() })
        .eq('id', resumeId)
        .eq('user_id', user.id);

      if (error) throw error;

      setEditingId(null);
      await loadResumesWorkspace();
    } catch (err: any) {
      console.error('Title save error:', err);
      alert(handleSupabaseError(err));
    } finally {
      setSavingId(null);
    }
  };

  // Trigger secured view in new tab
  const handleOpenResume = async (storagePath: string) => {
    try {
      const signedUrl = await getResumeSignedUrl(storagePath);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      console.error('Failure getting signed URL:', err);
      alert(`Không thể sinh liên kết xem trực tuyến: ${err.message}`);
    }
  };

  return (
    <div className="space-y-10 py-2 animate-fade-in">
      
      {/* Title block */}
      <section className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
            <FileText className="h-7 w-7 text-emerald-400" />
            Tủ hồ sơ và CV cá nhân
          </h1>
          <p className="text-xs text-slate-400 mt-1">Cửa ngõ quản lý các văn bản ứng tuyển. Thông tin được mã hóa bảo mật tầng Storage.</p>
        </div>
        {!cvMode && (
          <button
            onClick={handleOpenCvBuilder}
            disabled={loadingLines}
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer shrink-0"
            id="open-cv-builder-resumes"
          >
            <Sparkles className="h-4 w-4" />
            {loadingLines ? 'Đang tải hồ sơ...' : 'Tạo CV tự động'}
          </button>
        )}
      </section>

      {cvMode && profile ? (
        <CvBuilderContainer
          profile={profile}
          email={user?.email || ''}
          sourceLines={sourceLines}
          onClose={() => setCvMode(false)}
          onCreated={loadResumesWorkspace}
        />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Form: CV File Uploader */}
        <section className="lg:col-span-1">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-3">
              <Upload className="h-4.5 w-4.5 text-emerald-400" />
              Tải hồ sơ lên hệ thống
            </h3>

            {uploadMessage && (
              <div className={`p-4 rounded-xl text-xs flex items-start gap-2 leading-relaxed ${
                uploadMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              }`}>
                <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <p>{uploadMessage.text}</p>
              </div>
            )}

            <form onSubmit={handleUploadResume} className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="resume-title-input">
                  Tiêu đề hiển thị (tùy chọn)
                </label>
                <input
                  type="text"
                  id="resume-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: CV - Kỹ sư ReactJS (Junior)"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* File Dropzone representation */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Chọn tập tin CV ứng tuyển <span className="text-emerald-500">*</span>
                </label>
                
                <div className="relative border-2 border-dashed border-slate-800 hover:border-emerald-500/30 rounded-2xl p-6 bg-slate-950/40 text-center transition duration-155 flex flex-col items-center justify-center gap-2 group">
                  <input
                    type="file"
                    id="file-upload-input"
                    required
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  
                  <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-slate-500 group-hover:text-emerald-400 transition-colors">
                    <Upload className="h-5 w-5" />
                  </div>

                  {file ? (
                    <div className="space-y-1 z-20">
                      <p className="text-xs font-bold text-emerald-400 line-clamp-1 px-4">{file.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{(file.size / 1024).toFixed(1)} KB | {file.type.split('/')[1]?.toUpperCase()}</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-300 font-semibold">Nhấn hoặc kéo thả tệp tại đây</p>
                      <p className="text-[10px] text-slate-500">Định dạng hỗ trợ: PDF, DOC, DOCX (Tối đa 10 MB)</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-850 flex items-start gap-1.5 text-[10px] text-slate-400 font-mono leading-relaxed">
                <Info className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <p>Tệp CV tải lên sẽ được mã hóa và lưu trữ tại folder riêng tư thuộc Storage Bucket. Chỉ có bạn và Recruiter nộp tin có quyền giải mã bằng Signed URL tạm thời.</p>
              </div>

              <button
                type="submit"
                disabled={uploading || !file}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed select-none text-slate-950 font-bold py-2.5 rounded-xl text-xs transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
                id="doc-upload-btn"
              >
                {uploading ? (
                  <>
                    <Clock className="h-4 w-4 animate-spin" />
                    Đang bảo mật tải lên...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Bắt đầu tải lên CV
                  </>
                )}
              </button>

            </form>
          </div>
        </section>

        {/* Right Section: Resume Table list */}
        <section className="lg:col-span-2">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 border-b border-slate-800 pb-3 mb-6">
              <Layers className="h-5 w-5 text-emerald-400" />
              Thư viện tài liệu hiện có
            </h3>

            {loading ? (
              <div className="space-y-4 py-6 animate-pulse">
                <div className="h-14 bg-slate-950 rounded-2xl w-full" />
                <div className="h-14 bg-slate-950 rounded-2xl w-full animate-delay-100" />
              </div>
            ) : resumes.length === 0 ? (
              <div className="text-center py-16 bg-slate-950/30 border border-slate-850 rounded-2xl">
                <FileText className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <h4 className="text-sm font-semibold text-slate-300">Tủ tài liệu đang rỗng</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">Bạn cần tải lên ít nhất một hồ sơ CV định dạng chuẩn để kích hoạt chức năng nộp đơn tại bảng việc làm.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {resumes.map((resume) => {
                  const appsUsed = appCounts[resume.id] || 0;
                  const isSavedItem = savingId === resume.id;
                  const isCurrentEditing = editingId === resume.id;

                  return (
                    <div 
                      key={resume.id}
                      className={`bg-slate-950/40 border border-slate-850 hover:border-slate-800 rounded-2xl p-5 duration-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative overflow-hidden group/item ${
                        resume.is_default ? 'ring-2 ring-emerald-500/10' : ''
                      }`}
                    >
                      {resume.is_default && (
                        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
                      )}

                      <div className="flex-1 space-y-2">
                        
                        <div className="flex items-center gap-2 flex-wrap">
                          {isCurrentEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="px-2 py-1 bg-slate-900 border border-slate-850 rounded-lg text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 font-bold focus:outline-none"
                              />
                              <button
                                onClick={() => handleSaveTitleEdit(resume.id)}
                                className="p-1 hover:bg-slate-800 text-emerald-400 rounded cursor-pointer"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group/title">
                              <h4 className="text-xs font-black text-slate-200">{resume.title}</h4>
                              <button
                                onClick={() => { setEditingId(resume.id); setEditTitle(resume.title || ''); }}
                                className="p-1 opacity-0 group-hover/title:opacity-100 text-slate-500 hover:text-emerald-400 rounded duration-100 cursor-pointer"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          {resume.is_default && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-extrabold uppercase tracking-wider border border-emerald-500/20 shadow-sm shadow-emerald-950/20 select-none">
                              <Star className="h-2 w-2 fill-emerald-400" />
                              Mặc định
                            </span>
                          )}
                        </div>

                        {/* File details layout indicators */}
                        <div className="space-y-1 font-mono text-[9px] text-slate-400 leading-normal">
                          <p>
                            <strong>Tên tệp gốc:</strong> <span className="text-slate-300 break-all">{resume.original_filename}</span>
                          </p>
                          <p>
                            <strong>Storage Path:</strong> <span className="text-slate-500 select-all break-all">{resume.storage_path}</span>
                          </p>
                          <div className="flex items-center gap-3 flex-wrap text-slate-500">
                            <span>MIME: <strong className="text-slate-400">{resume.mime_type}</strong></span>
                            <span>Dung lượng: <strong className="text-slate-400">{(resume.size_bytes / 1024).toFixed(1)} KB</strong></span>
                            <span>Tải ngày: <strong className="text-slate-400">{formatDate(resume.created_at)}</strong></span>
                          </div>
                        </div>

                        {/* Applications usage count meter */}
                        <div className="pt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-850 text-slate-400 font-mono text-[9px] select-none">
                            <Layers className="h-3 w-3 text-slate-500 shrink-0" />
                            Đã nộp vào các đơn: <strong className="text-emerald-400">{appsUsed}</strong>
                          </span>
                        </div>

                      </div>

                      {/* Right Hand: Action pane for resume card */}
                      <div className="flex items-center gap-2 justify-end sm:flex-col sm:items-end shrink-0 select-none border-t border-slate-900/40 sm:border-0 pt-3 sm:pt-0">
                        
                        <button
                          onClick={() => handleOpenResume(resume.storage_path)}
                          disabled={isSavedItem}
                          className="px-3 py-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                        >
                          <Eye className="h-3.5 w-3.5 text-slate-400" />
                          Xem CV
                          <ArrowUpRight className="h-3 w-3 text-slate-500" />
                        </button>

                        {!resume.is_default && (
                          <button
                            onClick={() => handleSetDefault(resume.id)}
                            disabled={isSavedItem}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 hover:border-slate-700 text-emerald-400 text-[10px] font-bold uppercase tracking-wider rounded-xl border border-slate-850 cursor-pointer transition flex items-center gap-1"
                          >
                            Tải làm mặc định
                          </button>
                        )}

                        {isSavedItem && (
                          <span className="text-[10px] text-slate-500 font-mono animate-pulse">Lưu dữ liệu...</span>
                        )}

                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </section>

      </div>
      )}

    </div>
  );
};

export default ResumesPage;

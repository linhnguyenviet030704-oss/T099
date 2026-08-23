import React, { useEffect, useState, useCallback, useDeferredValue } from 'react';
import { 
  Sliders, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  User, 
  Globe, 
  Mail, 
  AlertTriangle, 
  Info,
  CalendarCheck,
  ShieldCheck,
  Building2,
  Database
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { apiJson } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { RecruiterRegistrationForm, Profile } from '../types';
import { formatDate, ENUM_LABELS } from '../lib/format';

export const AdminRecruiterRequestsPage: React.FC = () => {
  const { session } = useAuth();

  const [forms, setForms] = useState<RecruiterRegistrationForm[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Search input and options
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);

  // Note states per card
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch admin filings and lookup tables
  const fetchAdminOnboardWorkspace = useCallback(async () => {
    if (!supabase) return;
    try {
      setLoading(true);
      setErrorCode(null);

      // 1. Fetch all registration forms
      const { data: formData, error: formErr } = await supabase
        .from('recruiter_registration_forms')
        .select('*')
        .order('created_at', { ascending: false });

      if (formErr) throw formErr;

      const items = (formData || []) as RecruiterRegistrationForm[];
      setForms(items);

      // Pre-fill notes dictionary
      const notes: Record<string, string> = {};
      items.forEach((f) => {
        notes[f.id] = f.admin_note || '';
      });
      setAdminNotes(notes);

      // 2. Query all profiles in system to map applicants and reviewers
      if (items.length > 0) {
        const uids = Array.from(new Set([
          ...items.map(i => i.user_id),
          ...items.map(i => i.reviewed_by_user_id).filter(Boolean) as string[]
        ]));

        const { data: profData, error: profErr } = await supabase
          .from('profiles')
          .select('*')
          .in('id', uids);

        if (profErr) throw profErr;

        const profsMap: Record<string, Profile> = {};
        (profData || []).forEach((p: any) => {
          profsMap[p.id] = p as Profile;
        });

        setProfilesMap(profsMap);
      }

    } catch (err: any) {
      console.error('Admin workspace loading error:', err);
      setErrorCode(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminOnboardWorkspace();
  }, [fetchAdminOnboardWorkspace]);

  // Approve / Reject registration form filings
  const handleReviewForm = async (formId: string, decision: 'approved' | 'rejected') => {
    if (!session?.access_token) return;
    setSuccessMsg(null);

    const note = adminNotes[formId] || '';
    if (decision === 'rejected' && !note.trim()) {
      alert('Vui lòng điền nguyên nhân từ chối vào ô Ghi chú nội bộ.');
      return;
    }

    try {
      setSavingId(formId);

      await apiJson(`/admin/recruiter-forms/${formId}/review`, session.access_token, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          admin_note: note.trim() || null,
        }),
      });

      setSuccessMsg(`Đã ${decision === 'approved' ? 'Phê duyệt' : 'Từ chối'} hồ sơ và cập nhật hệ quản trị thành công!`);
      await fetchAdminOnboardWorkspace();
    } catch (err: any) {
      console.error('Review application filing error:', err);
      if (err.message && err.message.includes('Failed to fetch')) {
        const targetForm = forms.find(f => f.id === formId);
        const { error: sbErr } = await supabase
          .from('recruiter_registration_forms')
          .update({
            status: decision,
            admin_note: note.trim() || null,
            reviewed_by_user_id: session.user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', formId);
        if (!sbErr) {
          if (decision === 'approved' && targetForm) {
            await supabase.from('profiles').update({ role: 'recruiter' }).eq('id', targetForm.user_id);
          }
          setSuccessMsg(`Đã ${decision === 'approved' ? 'Phê duyệt' : 'Từ chối'} đơn trên Supabase thành công!`);
          await fetchAdminOnboardWorkspace();
          return;
        }
      }
      alert(err.message || handleSupabaseError(err));
    } finally {
      setSavingId(null);
    }
  };

  // Tallies metrics
  const activePendingCount = forms.filter(f => f.status === 'pending').length;
  const approvedCount = forms.filter(f => f.status === 'approved').length;
  const rejectedCount = forms.filter(f => f.status === 'rejected').length;

  // Search filter
  const filteredForms = forms.filter((f) => {
    const query = deferredSearch.toLowerCase().trim();
    if (!query) return true;

    const applicant = profilesMap[f.user_id] || {} as Profile;
    return (
      f.company_name.toLowerCase().includes(query) ||
      (f.company_email || '').toLowerCase().includes(query) ||
      (f.company_website_url || '').toLowerCase().includes(query) ||
      (f.status || '').toLowerCase().includes(query) ||
      (applicant.full_name || '').toLowerCase().includes(query) ||
      (applicant.email || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-10 py-2 animate-fade-in">
      
      {/* Title block */}
      <section className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
          <Sliders className="h-7 w-7 text-emerald-400 animate-spin" style={{ animationDuration: '6s' }} />
          Phê duyệt Hồ sơ Đăng ký Tuyển dụng (Admin Panel)
        </h1>
        <p className="text-xs text-slate-400 mt-1">Xác thực pháp nhân, thẩm định hồ sơ giấy phép kinh doanh, duyệt phân quyền tài khoản Recruiter.</p>
      </section>

      {/* Metrics tracking counters grid */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow flex items-center gap-4 relative">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-mono font-bold shrink-0">
            <Clock className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Đang chờ xử lý</p>
            <h4 className="text-xl font-black text-amber-500 font-mono mt-0.5">{activePendingCount} hồ sơ</h4>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow flex items-center gap-4 relative">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold shrink-0">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Đã phê duyệt</p>
            <h4 className="text-xl font-black text-emerald-400 font-mono mt-0.5">{approvedCount} doanh nghiệp</h4>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow flex items-center gap-4 relative">
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center font-mono font-bold shrink-0">
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Từ chối cấp phép</p>
            <h4 className="text-xl font-black text-red-400 font-mono mt-0.5">{rejectedCount} hồ sơ từ chối</h4>
          </div>
        </div>

      </section>

      {/* Filter and search pane layout */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 shrink-0 select-none">
          <Database className="h-4.5 w-4.5 text-slate-500" />
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Danh bạ đăng ký doanh nghiệp ({forms.length})</h4>
        </div>

        <div className="relative w-full sm:w-80">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên ty, email, người gửi..."
            className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none placeholder:text-slate-600"
            id="admin-jobs-filter-search"
          />
        </div>
      </section>

      {/* Success Messages alert toast */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs flex items-center gap-1.5 select-none animate-bounce max-w-xl">
          <ShieldCheck className="h-4.5 w-4.5" />
          <p>{successMsg}</p>
        </div>
      )}

      {/* Main Filings list rendering */}
      {loading ? (
        <div className="space-y-6 py-6 animate-pulse">
          <div className="h-40 bg-slate-900 rounded-3xl w-full" />
          <div className="h-40 bg-slate-900 rounded-3xl w-full animate-delay-150" />
        </div>
      ) : errorCode ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-center text-sm max-w-xl mx-auto font-mono">
          {errorCode}
        </div>
      ) : filteredForms.length === 0 ? (
        <div className="text-center py-20 bg-slate-900 border border-slate-800 rounded-3xl max-w-xl mx-auto select-none">
          <AlertTriangle className="h-10 w-10 text-slate-600 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-slate-300">Không tìm thấy yêu cầu nào phù hợp</h4>
          <p className="text-xs text-slate-500 mt-1">Hệ thống chưa nhận được đơn đăng của Recruiter hoặc không tìm thấy khớp bộ lọc.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredForms.map((form) => {
            const requester = profilesMap[form.user_id] || { full_name: 'Người dùng cũ', email: 'Chưa xác định' } as Profile;
            const reviewer = form.reviewed_by_user_id ? (profilesMap[form.reviewed_by_user_id] || { full_name: 'Quản trị viên', email: '' } as Profile) : null;
            
            const isFilingPending = form.status === 'pending';
            const isSavingItem = savingId === form.id;

            return (
              <div 
                key={form.id} 
                className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

                {/* Card header meta */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-850">
                  <div className="space-y-1.5">
                    <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-1.5">
                      <Building2 className="h-4.5 w-4.5 text-emerald-400 shrink-0 select-none" />
                      {form.company_name}
                    </h3>
                    
                    {/* Requester user trace */}
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-mono select-none flex-wrap leading-none">
                      <span className="flex items-center gap-1 text-slate-300"><User className="h-3.5 w-3.5" /> Gửi bởi: <strong>{requester.full_name || 'Hợp lệ'}</strong></span>
                      <span>|</span>
                      <span>Email: {requester.email}</span>
                      <span>|</span>
                      <span>Gửi lúc: {formatDate(form.created_at, true)}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-mono mb-1 select-none">Trạng thái hồ sơ</p>
                    <span className={`inline-block px-2.5 py-0.5 rounded-xl text-[10px] font-black uppercase tracking-widest font-mono ${
                      form.status === 'rejected' 
                        ? 'bg-red-500/15 text-red-400 border border-red-500/25' 
                        : form.status === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 shadow shadow-emerald-950/25'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/25 animate-pulse'
                    }`}>
                      {ENUM_LABELS.recruiter_registration_status[form.status]}
                    </span>
                  </div>
                </div>

                {/* Sub-grid: Details specs vs Admin review block */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-5 text-sm leading-normal">
                  
                  {/* Left Column: Details parameters */}
                  <div className="md:col-span-6 space-y-3 font-mono text-[11px] text-slate-400 select-none">
                    <p className="font-bold text-[10px] uppercase tracking-wider text-slate-500">Thông tin liên kết pháp nhân</p>
                    <div className="bg-slate-950/40 border border-slate-850/60 p-4 rounded-2xl space-y-2">
                      <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-500 shrink-0" /> Email công ty: <strong className="text-slate-300 font-sans">{form.company_email || 'Bỏ trống'}</strong></p>
                      
                      <p className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-slate-500 shrink-0" />
                        Website URL:
                        {form.company_website_url ? (
                          <a 
                            href={form.company_website_url.startsWith('http') ? form.company_website_url : `https://${form.company_website_url}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-emerald-400 hover:underline font-sans"
                          >
                            {form.company_website_url}
                          </a>
                        ) : (
                          <span className="text-slate-500 font-sans">Bỏ trống</span>
                        )}
                      </p>

                      <p className="flex items-center gap-2"><Info className="h-4 w-4 text-slate-500 shrink-0" /> Hồ sơ GPKD: <span className="text-slate-400 select-all font-mono break-all leading-tight">{form.business_license_storage_path || 'Bỏ trống'}</span></p>
                    </div>
                  </div>

                  {/* Right Column: Decisions Pane and notes */}
                  <div className="md:col-span-6 space-y-3">
                    
                    {/* BRANCH A: Form is pending, Admin can make approval choice */}
                    {isFilingPending ? (
                      <div className="bg-slate-950/30 border border-slate-850 p-4 rounded-3xl space-y-4">
                        <div className="space-y-1.5">
                          <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-500" htmlFor={`note-admin-input-${form.id}`}>
                            Ghi chú phản hồi / Lý do (Bắt buộc nếu Từ chối)
                          </label>
                          <textarea
                            id={`note-admin-input-${form.id}`}
                            rows={2}
                            value={adminNotes[form.id] || ''}
                            onChange={(e) => setAdminNotes(p => ({ ...p, [form.id]: e.target.value }))}
                            placeholder="Ghi rõ lý do phê duyệt, hoặc lý do tại sao hồ sơ kinh doanh không hợp chuẩn..."
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none resize-none"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1 select-none">
                          <button
                            type="button"
                            onClick={() => handleReviewForm(form.id, 'rejected')}
                            disabled={isSavingItem}
                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl text-xs font-bold border border-red-500/10 cursor-pointer transition flex items-center gap-1"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Từ chối hồ sơ
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => handleReviewForm(form.id, 'approved')}
                            disabled={isSavingItem}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black cursor-pointer transition flex items-center gap-1 shadow-md shadow-emerald-500/10"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Phê duyệt cấp phép
                          </button>
                        </div>
                      </div>
                    ) : (
                      
                      /* BRANCH B: Form is already processed (review locked) */
                      <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-3xl space-y-3 text-xs leading-normal">
                        
                        <div className="flex items-center gap-1.5 text-amber-400 select-none font-bold uppercase tracking-widest text-[9px] font-mono">
                          <CalendarCheck className="h-4 w-4" />
                          Hồ sơ duyệt đã khóa (Review locked)
                        </div>

                        {reviewer && (
                          <div className="text-slate-400 font-mono text-[10px] select-none border-b border-slate-900 pb-2.5">
                            <p><strong>Người thẩm định:</strong> <span className="text-slate-300 font-sans font-bold">{reviewer.full_name}</span></p>
                            <p className="mt-0.5"><strong>Email quản lý:</strong> <span className="text-slate-300 font-sans">{reviewer.email}</span></p>
                            <p className="mt-0.5"><strong>Thời gian xử lý:</strong> <span className="text-slate-300">{formatDate(form.reviewed_at, true)}</span></p>
                          </div>
                        )}

                        {form.admin_note && (
                          <div className="space-y-1">
                            <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-500 select-none font-mono">Ý kiến phản hồi lưu trữ:</span>
                            <p className="text-slate-400 italic font-light font-sans bg-slate-900/40 p-2.5 rounded-lg border border-slate-850/30">"{form.admin_note}"</p>
                          </div>
                        )}

                      </div>
                    )}

                  </div>

                </div>

                {isSavingItem && (
                  <div className="absolute inset-0 bg-slate-950/50 rounded-3xl flex items-center justify-center animate-pulse z-20">
                    <Clock className="w-8 h-8 text-emerald-400 animate-spin" />
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default AdminRecruiterRequestsPage;

import React, { useEffect, useState, useCallback } from 'react';
import { 
  Building2, 
  Send, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle, 
  Sliders, 
  Globe, 
  Mail, 
  Info,
  Layers
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useCurrentProfile } from '../profile/ProfileProvider';
import { RecruiterRegistrationForm } from '../types';
import { formatDate, ENUM_LABELS } from '../lib/format';

export const RecruiterRequestPage: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useCurrentProfile();

  const [formsList, setFormsList] = useState<RecruiterRegistrationForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form input states
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [licensePath, setLicensePath] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Find if there is an active pending form to switch to Update mode
  const pendingForm = formsList.find((f) => f.status === 'pending');

  const fetchOnboardingWorkspace = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setLoading(true);
      setError(null);

      // Query database registration filings matching logged user
      const { data, error: qErr } = await supabase
        .from('recruiter_registration_forms')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (qErr) throw qErr;

      const items = (data || []) as RecruiterRegistrationForm[];
      setFormsList(items);

      // If active pending filing is present, prefill the inputs
      const activePending = items.find((f) => f.status === 'pending');
      if (activePending) {
        setCompanyName(activePending.company_name || '');
        setCompanyEmail(activePending.company_email || '');
        setCompanyWebsite(activePending.company_website_url || '');
        setLicensePath(activePending.business_license_storage_path || '');
      } else {
        // Clear forms
        setCompanyName('');
        setCompanyEmail('');
        setCompanyWebsite('');
        setLicensePath('');
      }

    } catch (err: any) {
      console.error('Error fetching registration forms:', err);
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchOnboardingWorkspace();
    }
  }, [user, fetchOnboardingWorkspace]);

  // Handle submit logic (idempotent redirect on pending or insert)
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user) return;

    setFormMsg(null);
    setSubmitting(true);

    if (!companyName.trim()) {
      setFormMsg({ type: 'error', text: 'Tên thương hiệu doanh nghiệp tuyển dụng bắt buộc phải nhập.' });
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        company_name: companyName.trim(),
        company_email: companyEmail.trim() || null,
        company_website_url: companyWebsite.trim() || null,
        business_license_storage_path: licensePath.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (pendingForm) {
        // Mode update: modify existing pending filing
        const { error: updErr } = await supabase
          .from('recruiter_registration_forms')
          .update(payload)
          .eq('id', pendingForm.id)
          .eq('user_id', user.id);

        if (updErr) throw updErr;
        setFormMsg({ type: 'success', text: 'Cập nhật nội dung hồ sơ đăng ký doanh nghiệp thành công!' });
      } else {
        // Mode creation: file new registration
        const newPayload = {
          ...payload,
          user_id: user.id,
          status: 'pending',
        };

        const { error: insErr } = await supabase
          .from('recruiter_registration_forms')
          .insert(newPayload);

        if (insErr) throw insErr;
        setFormMsg({ type: 'success', text: 'Đơn yêu cầu tuyển dụng đã được tiếp nhận và trình phê duyệt!' });
      }

      await fetchOnboardingWorkspace();
    } catch (err: any) {
      console.error('Error submitting onboarding filing:', err);
      setFormMsg({ type: 'error', text: handleSupabaseError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const isRoleElevated = profile && (profile.role === 'recruiter' || profile.role === 'admin');

  return (
    <div className="space-y-10 py-2 animate-fade-in">
      
      {/* Title block */}
      <section className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
          <Building2 className="h-7 w-7 text-emerald-400" />
          Đăng ký Doanh nghiệp &amp; Cấp quyền Recruiter
        </h1>
        <p className="text-xs text-slate-400 mt-1">Gửi thông tin doanh nghiệp. Nhân sự Ban quản trị sẽ nhanh chóng liên hệ, phê duyệt và cấp phát quyền đăng tin.</p>
      </section>

      {/* Warning banner for elevated accounts */}
      {isRoleElevated && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h5 className="font-bold">Tài khoản và vai trò đã được xác định</h5>
            <p className="text-slate-400 leading-normal">Bạn đang giữ vai trò là <strong>{ENUM_LABELS.profile_role[profile!.role]}</strong>. Toàn bộ tính năng nhà tuyển dụng đã được kích hoạt đầy đủ tại thanh menu. Bạn vẫn có thể xem lại lịch sử yêu cầu bên dưới.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Form Block — Onboarding Entry */}
        {!isRoleElevated && (
          <section className="lg:col-span-1">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
              
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5 select-none">
                  <Send className="h-4.5 w-4.5" />
                  {pendingForm ? 'Thay đổi đơn đăng ký' : 'Điền thông tin đơn xin phép'}
                </h3>
              </div>

              {formMsg && (
                <div className={`p-4 rounded-xl text-xs flex items-start gap-1.5 leading-relaxed select-none ${
                  formMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{formMsg.text}</p>
                </div>
              )}

              <form onSubmit={handleSubmitRequest} className="space-y-4">
                
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="company-name-input">
                    Tên doanh nghiệp / Công ty <span className="text-emerald-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="company-name-input"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Tập đoàn Công nghệ A..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="company-email-input">
                    Email hành chính doanh nghiệp
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                      <Mail className="h-3.5 w-3.5" />
                    </span>
                    <input
                      type="email"
                      id="company-email-input"
                      value={companyEmail}
                      onChange={(e) => setCompanyEmail(e.target.value)}
                      placeholder="hr@congty.com"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="company-website-input">
                    Trang chủ (Website URL)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                      <Globe className="h-3.5 w-3.5" />
                    </span>
                    <input
                      type="url"
                      id="company-website-input"
                      value={companyWebsite}
                      onChange={(e) => setCompanyWebsite(e.target.value)}
                      placeholder="https://congty.com"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="license-input">
                    Đường dẫn Lưu trữ giấy phép kinh doanh
                  </label>
                  <input
                    type="text"
                    id="license-input"
                    value={licensePath}
                    onChange={(e) => setLicensePath(e.target.value)}
                    placeholder="Mã số đăng ký, hoặc link GPKD để đối chiếu"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-[10px] text-slate-500 font-mono leading-relaxed select-none">
                  Lưu ý: Nếu một hồ sơ đang ở trạng thái <strong>Chờ duyệt</strong>, việc gửi đơn kế tiếp sẽ tự động chỉnh sửa trực tiếp thông tin hồ sơ cũ đó (Update Mode).
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 select-none text-slate-950 font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                >
                  {submitting ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin" />
                      Đang đồng bộ hồ sơ...
                    </>
                  ) : pendingForm ? (
                    <>
                      <Sliders className="h-4 w-4" />
                      Cập nhật nội dung đơn nộp
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Gửi trình tuyển dụng phê duyệt
                    </>
                  )}
                </button>

              </form>
            </div>
          </section>
        )}

        {/* Right Section — Filings list */}
        <section className={isRoleElevated ? 'lg:col-span-3' : 'lg:col-span-2'}>
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3 mb-6 flex items-center gap-2 select-none">
              <Layers className="h-5 w-5 text-emerald-400" />
              Lịch sử các yêu cầu nộp duyệt
            </h3>

            {loading ? (
              <div className="space-y-4 py-6 animate-pulse">
                <div className="h-14 bg-slate-950 rounded-2xl w-full" />
                <div className="h-14 bg-slate-950 rounded-2xl w-full animate-delay-100" />
              </div>
            ) : formsList.length === 0 ? (
              <div className="text-center py-16 bg-slate-955 border border-slate-850 rounded-2xl select-none">
                <HelpCircle className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                <h4 className="text-xs font-bold text-slate-400">Chưa có bản ghi đăng ký</h4>
                <p className="text-[10px] text-slate-500 max-w-sm mt-1 mx-auto leading-relaxed">Hãy điền mẫu biểu hồ sơ doanh nghiệp bên trái để Ban biên tập tiến hành thủ tục cấp quyền đăng tin tuyển dụng!</p>
              </div>
            ) : (
              <div className="space-y-5">
                {formsList.map((form) => {
                  return (
                    <div 
                      key={form.id}
                      className="bg-slate-950/40 border border-slate-850 hover:border-slate-800 duration-100 p-5 rounded-2xl relative"
                    >
                      {/* Top banner alignment */}
                      <div className="flex items-start justify-between gap-4 flex-wrap pb-3 border-b border-slate-900">
                        <div className="space-y-1">
                          <h4 className="text-xs font-black text-slate-200">{form.company_name}</h4>
                          <span className="text-[9px] text-slate-500 font-mono">ID yêu cầu: {form.id}</span>
                        </div>
                        
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest font-mono ${
                          form.status === 'rejected' 
                            ? 'bg-red-500/15 text-red-400 border border-red-500/25' 
                            : form.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/25'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/25 animate-pulse'
                        }`}>
                          {ENUM_LABELS.recruiter_registration_status[form.status]}
                        </span>
                      </div>

                      {/* Details specs */}
                      <div className="py-3 border-b border-slate-900 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-400 leading-normal font-mono select-none">
                        <p><strong>Doanh nghiệp Email:</strong> <span className="text-slate-300 font-sans">{form.company_email || 'Chưa cung cấp'}</span></p>
                        <p><strong>Website URL:</strong> <span className="text-emerald-400 font-sans break-all">{form.company_website_url || 'Chưa cung cấp'}</span></p>
                        <p><strong>Tài liệu kinh doanh:</strong> <span className="text-slate-500 break-all">{form.business_license_storage_path || 'Chưa cung cấp'}</span></p>
                        <p><strong>Ngày gửi đơn:</strong> <span className="text-slate-300">{formatDate(form.created_at, true)}</span></p>
                        {form.reviewed_at && (
                          <p><strong>Thời gian xử lý:</strong> <span className="text-slate-300">{formatDate(form.reviewed_at, true)}</span></p>
                        )}
                      </div>

                      {/* Admin note block */}
                      {form.admin_note && (
                        <div className="pt-3 rounded-b-xl flex items-start gap-1.5">
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="text-[11px] text-slate-400 leading-normal font-sans">
                            <span className="font-bold text-slate-300 select-none">Hồi đáp từ ban quản lý:</span>{' '}
                            <span className="font-light italic whitespace-pre-line">{form.admin_note}</span>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </section>

      </div>

    </div>
  );
};

export default RecruiterRequestPage;

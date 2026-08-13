import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  Plus, 
  Send, 
  Trash2, 
  History, 
  CheckCircle, 
  FileText, 
  ArrowUpRight, 
  AlertTriangle, 
  Clock, 
  User, 
  Phone, 
  Mail, 
  Compass,
  FileCheck2,
  ListFilter,
  Users2,
  Link as LinkIcon
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useCurrentProfile } from '../profile/ProfileProvider';
import { Company, CompanyMember, JobPost, Application, ApplicationStage, Profile } from '../types';
import { formatDate, formatCurrency, ENUM_LABELS } from '../lib/format';

export const RecruiterJobsPage: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useCurrentProfile();

  // Workspace loading states
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [errorWord, setErrorWord] = useState<string | null>(null);

  // Entities state
  const [memberships, setMemberships] = useState<CompanyMember[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [stagesMap, setStagesMap] = useState<Record<string, ApplicationStage[]>>({});

  // Active toggles
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [activeJobTabId, setActiveJobTabId] = useState<string | null>(null);
  const [addJobFormOpen, setAddJobFormOpen] = useState(false);
  const [companyFacebookUrl, setCompanyFacebookUrl] = useState('');
  const [companyLinkedinUrl, setCompanyLinkedinUrl] = useState('');
  const [companyTwitterUrl, setCompanyTwitterUrl] = useState('');
  const [companyLinksSaving, setCompanyLinksSaving] = useState(false);

  // Job creation form fields
  const [jobTitle, setJobTitle] = useState('');
  const [jobLocation, setJobLocation] = useState('');
  const [jobType, setJobType] = useState<any>('full_time');
  const [jobDeadline, setJobDeadline] = useState('');
  const [jobSalaryMin, setJobSalaryMin] = useState('');
  const [jobSalaryMax, setJobSalaryMax] = useState('');
  const [jobCurrency, setJobCurrency] = useState('VND');
  const [jobDesc, setJobDesc] = useState('');
  const [jobReq, setJobReq] = useState('');
  const [jobBenefits, setJobBenefits] = useState('');
  const [jobInitialStatus, setJobInitialStatus] = useState<any>('published');

  // Multi-state individual saving flags
  const [jobSaving, setJobSaving] = useState(false);
  const [jobStatusSavingId, setJobStatusSavingId] = useState<string | null>(null);
  const [stageSavingId, setStageSavingId] = useState<string | null>(null);
  const [resumeOpeningId, setResumeOpeningId] = useState<string | null>(null);

  // Stage composer form state per application
  const [composerStages, setComposerStages] = useState<Record<string, any>>({});
  const [composerNotes, setComposerNotes] = useState<Record<string, string>>({});

  const fetchRecruiterWorkspace = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setLoadingWorkspace(true);
      setErrorWord(null);

      const isAdmin = profile?.role === 'admin';
      let items: CompanyMember[] = [];

      if (isAdmin) {
        const { data: companiesData, error: cErr } = await supabase
          .from('companies')
          .select('*')
          .order('name', { ascending: true });
        if (cErr) throw cErr;

        items = (companiesData || []).map((c: any) => ({
          id: `admin-${c.id}`,
          company_id: c.id,
          user_id: user.id,
          role: 'owner',
          is_active: true,
          invited_by_user_id: null,
          created_at: c.created_at,
          updated_at: c.updated_at,
          company: c as Company,
        }));
      } else {
        const { data: memberData, error: mErr } = await supabase
          .from('company_members')
          .select('*, companies(*)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .in('role', ['owner', 'recruiter']);
        if (mErr) throw mErr;

        items = (memberData || []).map((m: any) => ({
          ...m,
          company: m.companies,
        })) as CompanyMember[];
      }

      setMemberships(items);

      if (items.length > 0) {
        let companyId = selectedCompanyId;
        if (!companyId || !items.some((m) => m.company_id === companyId)) {
          companyId = items[0].company_id;
          setSelectedCompanyId(companyId);
        }

        // Recruiters: only jobs they posted. Admin: all jobs of the company.
        let jobsQuery = supabase
          .from('job_posts')
          .select('*')
          .eq('company_id', companyId)
          .order('updated_at', { ascending: false });
        if (!isAdmin) {
          jobsQuery = jobsQuery.eq('created_by_user_id', user.id);
        }

        const { data: jobsData, error: jobsErr } = await jobsQuery;
        if (jobsErr) throw jobsErr;
        const loadedJobs = (jobsData || []) as JobPost[];
        setJobs(loadedJobs);

        if (loadedJobs.length > 0 && !activeJobTabId) {
          setActiveJobTabId(loadedJobs[0].id);
        }

        if (loadedJobs.length > 0) {
          const jobIds = loadedJobs.map(j => j.id);

          const { data: appsData, error: appsErr } = await supabase
            .from('applications')
            .select('*')
            .in('job_post_id', jobIds)
            .order('applied_at', { ascending: false });

          if (appsErr) throw appsErr;

          const loadedApps = (appsData || []) as Application[];
          setApplications(loadedApps);

          if (loadedApps.length > 0) {
            const applicantIds = Array.from(new Set(loadedApps.map(a => a.applicant_user_id)));
            const { data: profilesData, error: profsErr } = await supabase
              .from('profiles')
              .select('*')
              .in('id', applicantIds);

            if (profsErr) throw profsErr;

            const profsMap: Record<string, Profile> = {};
            (profilesData || []).forEach((p: any) => {
              profsMap[p.id] = p as Profile;
            });
            setProfilesMap(profsMap);

            const appIds = loadedApps.map(a => a.id);
            const { data: stagesData, error: stagesErr } = await supabase
              .from('application_stages')
              .select('*')
              .in('application_id', appIds)
              .order('created_at', { ascending: false });

            if (stagesErr) throw stagesErr;

            const stgMap: Record<string, ApplicationStage[]> = {};
            (stagesData || []).forEach((s: any) => {
              if (!stgMap[s.application_id]) {
                stgMap[s.application_id] = [];
              }
              stgMap[s.application_id].push(s as ApplicationStage);
            });
            setStagesMap(stgMap);
          } else {
            setProfilesMap({});
            setStagesMap({});
          }
        } else {
          setApplications([]);
          setProfilesMap({});
          setStagesMap({});
        }
      } else {
        setJobs([]);
        setApplications([]);
        setProfilesMap({});
        setStagesMap({});
      }

    } catch (err: any) {
      console.error('Recruiter workspace error:', err);
      setErrorWord(handleSupabaseError(err));
    } finally {
      setLoadingWorkspace(false);
    }
  }, [user, profile?.role, selectedCompanyId, activeJobTabId]);

  useEffect(() => {
    if (user) {
      fetchRecruiterWorkspace();
    }
  }, [user, fetchRecruiterWorkspace]);

  useEffect(() => {
    const company = memberships.find((m) => m.company_id === selectedCompanyId)?.company;
    setCompanyFacebookUrl(company?.facebook_url || '');
    setCompanyLinkedinUrl(company?.linkedin_url || '');
    setCompanyTwitterUrl(company?.twitter_url || '');
  }, [memberships, selectedCompanyId]);

  // Handle changing target company
  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setActiveJobTabId(null);
    setAddJobFormOpen(false);
  };

  const handleSaveCompanyLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !selectedCompanyId) return;

    setCompanyLinksSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          facebook_url: companyFacebookUrl.trim() || null,
          linkedin_url: companyLinkedinUrl.trim() || null,
          twitter_url: companyTwitterUrl.trim() || null,
        })
        .eq('id', selectedCompanyId);

      if (error) throw error;
      await fetchRecruiterWorkspace();
    } catch (err: any) {
      console.error('Company social links update error:', err);
      alert(handleSupabaseError(err));
    } finally {
      setCompanyLinksSaving(false);
    }
  };

  // Job post submission handle
  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user || !selectedCompanyId) return;

    if (!jobTitle.trim() || !jobDesc.trim()) {
      alert('Vui lòng hoàn thành các trường bắt buộc.');
      return;
    }

    setJobSaving(true);

    try {
      const payload = {
        company_id: selectedCompanyId,
        created_by_user_id: user.id,
        title: jobTitle.trim(),
        description: jobDesc.trim(),
        requirements: jobReq.trim() || null,
        benefits: jobBenefits.trim() || null,
        location: jobLocation.trim() || null,
        employment_type: jobType,
        salary_min: jobSalaryMin ? Number(jobSalaryMin) : null,
        salary_max: jobSalaryMax ? Number(jobSalaryMax) : null,
        currency: jobCurrency.toUpperCase(),
        status: jobInitialStatus,
        published_at: jobInitialStatus === 'published' ? new Date().toISOString() : null,
        deadline_at: jobDeadline ? new Date(jobDeadline).toISOString() : null,
      };

      const { data, error } = await supabase
        .from('job_posts')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      setAddJobFormOpen(false);
      resetJobForm();
      
      // Auto-focus the newly created job post
      if (data) {
        setActiveJobTabId(data.id);
      }
      
      await fetchRecruiterWorkspace();
    } catch (err: any) {
      console.error('Create job error:', err);
      alert(handleSupabaseError(err));
    } finally {
      setJobSaving(false);
    }
  };

  const resetJobForm = () => {
    setJobTitle('');
    setJobLocation('');
    setJobType('full_time');
    setJobDeadline('');
    setJobSalaryMin('');
    setJobSalaryMax('');
    setJobCurrency('VND');
    setJobDesc('');
    setJobReq('');
    setJobBenefits('');
    setJobInitialStatus('published');
  };

  // Update job posting status (Publish, Close, Archive)
  const handleUpdateJobStatus = async (jobId: string, newStatus: any) => {
    if (!supabase) return;
    try {
      setJobStatusSavingId(jobId);
      
      const updatePayload: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (newStatus === 'published') {
        updatePayload.published_at = new Date().toISOString();
      } else if (newStatus === 'closed') {
        updatePayload.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('job_posts')
        .update(updatePayload)
        .eq('id', jobId);

      if (error) throw error;

      await fetchRecruiterWorkspace();
    } catch (err: any) {
      console.error('Job status update error:', err);
      alert(handleSupabaseError(err));
    } finally {
      setJobStatusSavingId(null);
    }
  };

  // Stage compiler submission: screening, interview...
  const handleAddStage = async (e: React.FormEvent, appId: string) => {
    e.preventDefault();
    if (!supabase || !user) return;

    const chosenStage = composerStages[appId] || 'screening';
    const note = composerNotes[appId] || '';

    setStageSavingId(appId);

    try {
      const payload = {
        application_id: appId,
        changed_by_user_id: user.id,
        stage: chosenStage,
        note: note.trim() || null,
        is_system_generated: false,
      };

      const { error } = await supabase
        .from('application_stages')
        .insert(payload);

      if (error) throw error;

      // Clear layout fields
      setComposerNotes(prev => ({ ...prev, [appId]: '' }));
      
      await fetchRecruiterWorkspace();
    } catch (err: any) {
      console.error('Add stage error:', err);
      alert(handleSupabaseError(err));
    } finally {
      setStageSavingId(null);
    }
  };

  // Open candidate CV safely using temporary signed URL
  const handleOpenCandidateCV = async (appId: string, path: string | null) => {
    if (!path) {
      alert('Tập tin hồ sơ snapshot của ứng viên bị thiếu hoặc không tồn tại.');
      return;
    }
    try {
      setResumeOpeningId(appId);
      
      const { data, error } = await supabase!.storage
        .from('resumes')
        .createSignedUrl(path, 180);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Signed URL is blank');

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      console.error('Open candidate CV signed URL error:', err);
      alert(`Lỗi phân quyền hoặc tệp đã bị xóa: ${err.message}`);
    } finally {
      setResumeOpeningId(null);
    }
  };

  const activeJob = jobs.find(j => j.id === activeJobTabId);
  const activeJobApps = applications.filter(a => a.job_post_id === activeJobTabId);

  return (
    <div className="space-y-10 py-2 animate-fade-in">
      
      {/* Title block */}
      <section className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
            <Building2 className="h-7 w-7 text-emerald-400" />
            Bàn Điều khiển Tuyển dụng (Recruiter Cockpit)
          </h1>
          <p className="text-xs text-slate-400 mt-1">Đăng tin tuyển dụng, phân tích ứng viên và trực tiếp điều chuyển trạng thái xét duyệt CV.</p>
        </div>

        {/* Company profile switcher */}
        {memberships.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono select-none">Doanh nghiệp:</span>
            <select
              value={selectedCompanyId}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer font-bold"
            >
              {memberships.map((m) => (
                <option key={m.company_id} value={m.company_id}>
                  {m.company?.name} ({m.company?.verification_status === 'verified' ? 'verified' : 'pending'})
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Loading indicator */}
      {loadingWorkspace && memberships.length === 0 ? (
        <div className="text-center py-20 animate-pulse">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-slate-400 font-medium">Bản đồ dữ liệu đang được đồng bộ...</p>
        </div>
      ) : errorWord ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-center text-sm max-w-xl mx-auto">
          {errorWord}
        </div>
      ) : memberships.length === 0 ? (
        
        /* EMPTY STATE: Recruiters has no approved company membership */
        <section className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl max-w-lg mx-auto space-y-5 animate-fade-in">
          <Compass className="h-12 w-12 text-slate-600 mx-auto" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-300">Tính năng Tuyển dụng chưa sẵn sàng</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              {profile?.role === 'admin'
                ? 'Chưa có công ty nào trong hệ thống để quản trị. Hãy phê duyệt đơn đăng ký recruiter trước.'
                : 'Bạn không sở hữu thành viên quản trị công ty tuyển dụng hoặc đơn yêu cầu của bạn đang chờ phê duyệt.'}
            </p>
          </div>
          <Link
            to={profile?.role === 'admin' ? '/admin/recruiter-requests' : '/recruiter/request'}
            className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs"
            id="register-recruiter-cta"
          >
            {profile?.role === 'admin' ? 'Mở Menu Admin' : 'Đăng ký Công ty mới ngay'}
          </Link>
        </section>
      ) : (
        
        /* MAIN RECRUITER COCKPIT WORKSPACE */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Column Left: Job titles Tab switcher */}
          <div className="lg:col-span-1 space-y-4">
            <form onSubmit={handleSaveCompanyLinks} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-md space-y-3">
              <div className="flex items-center gap-1.5 border-b border-slate-850 pb-3 select-none">
                <LinkIcon className="h-4.5 w-4.5 text-emerald-400" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Liên kết công ty</h3>
              </div>
              <input
                type="text"
                value={companyFacebookUrl}
                onChange={(e) => setCompanyFacebookUrl(e.target.value)}
                placeholder="Facebook URL"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <input
                type="text"
                value={companyLinkedinUrl}
                onChange={(e) => setCompanyLinkedinUrl(e.target.value)}
                placeholder="LinkedIn URL"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <input
                type="text"
                value={companyTwitterUrl}
                onChange={(e) => setCompanyTwitterUrl(e.target.value)}
                placeholder="X/Twitter URL"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={companyLinksSaving}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-emerald-400 border border-slate-800 rounded-xl py-2 text-[10px] font-black uppercase tracking-wider cursor-pointer"
              >
                {companyLinksSaving ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />}
                {companyLinksSaving ? 'Đang lưu...' : 'Lưu mạng xã hội'}
              </button>
            </form>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-850 pb-3 mb-4 select-none">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <ListFilter className="h-4.5 w-4.5" />
                  Tin đang quản lý
                </h3>
                
                {!addJobFormOpen && (
                  <button
                    onClick={() => { resetJobForm(); setAddJobFormOpen(true); }}
                    className="p-1.5 hover:bg-slate-800 text-sm font-bold text-emerald-400 rounded-xl border border-slate-800 transition cursor-pointer"
                    id="recruiter-add-job-toggle-btn"
                  >
                    <Plus className="h-4.5 w-4.5" />
                  </button>
                )}
              </div>

              {loadingWorkspace ? (
                <div className="space-y-2 py-4 animate-pulse">
                  <div className="h-8 bg-slate-950 rounded w-full" />
                  <div className="h-8 bg-slate-950 rounded w-5/6" />
                </div>
              ) : jobs.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic py-4 font-mono select-none">Chưa đăng tin tuyển vị trí nào.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {jobs.map((job) => {
                    const isActiveClass = job.id === activeJobTabId;
                    return (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => { setActiveJobTabId(job.id); setAddJobFormOpen(false); }}
                        className={`w-full text-left p-3 rounded-xl transition cursor-pointer focus:outline-none ${
                          isActiveClass 
                            ? 'bg-slate-800 border-l-4 border-emerald-500 text-emerald-400 font-bold shadow-inner' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/35'
                        }`}
                        id={`job-tab-${job.id}`}
                      >
                        <p className="text-xs line-clamp-1">{job.title}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-[9px] font-mono select-none">
                          <span className={`inline-block px-1 rounded-sm uppercase tracking-wider ${
                            job.status === 'published' 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : job.status === 'draft'
                              ? 'bg-slate-950 text-slate-500 border border-slate-850'
                              : 'bg-red-500/10 text-red-400'
                          }`}>
                            {ENUM_LABELS.job_post_status[job.status]}
                          </span>
                          <span className="text-slate-500">|</span>
                          <span className="text-slate-500">{formatDate(job.deadline_at)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Column Right: Active Workspace detail view & Application panels */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* SUB-FLOW A: Creation of Job Post form */}
            {addJobFormOpen ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-slide-up">
                
                <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-200 flex items-center gap-1.5">
                    <Plus className="h-5 w-5 text-emerald-400" />
                    Đăng tin ứng tuyển mới
                  </h3>
                  <button
                    onClick={() => setAddJobFormOpen(false)}
                    className="text-xs text-slate-400 hover:text-slate-200 hover:underline cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                </div>

                <form onSubmit={handleCreateJob} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-title">
                      Vị trí tuyển dụng <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="newjob-title"
                      required
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="Kỹ sư phần mềm ReactJS..."
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none font-sans"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-location">
                      Địa điểm làm việc
                    </label>
                    <input
                      type="text"
                      id="newjob-location"
                      value={jobLocation}
                      onChange={(e) => setJobLocation(e.target.value)}
                      placeholder="Hà Nội, Hồ Chí Minh..."
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-type">
                      Loại hình công việc
                    </label>
                    <select
                      id="newjob-type"
                      value={jobType}
                      onChange={(e) => setJobType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-300 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                    >
                      {Object.entries(ENUM_LABELS.employment_type).map(([key, val]) => (
                        <option key={key} value={key}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-deadline">
                      Hạn chót tiếp nhận hồ sơ
                    </label>
                    <input
                      type="datetime-local"
                      id="newjob-deadline"
                      value={jobDeadline}
                      onChange={(e) => setJobDeadline(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-300 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-salary-min">
                      Lương tối thiểu
                    </label>
                    <input
                      type="number"
                      id="newjob-salary-min"
                      value={jobSalaryMin}
                      onChange={(e) => setJobSalaryMin(e.target.value)}
                      placeholder="Tối thiểu VND"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-salary-max">
                      Lương tối đa
                    </label>
                    <input
                      type="number"
                      id="newjob-salary-max"
                      value={jobSalaryMax}
                      onChange={(e) => setJobSalaryMax(e.target.value)}
                      placeholder="Tối đa VND"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-currency">
                      Loại tiền tệ
                    </label>
                    <input
                      type="text"
                      maxLength={3}
                      id="newjob-currency"
                      value={jobCurrency}
                      onChange={(e) => setJobCurrency(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-status">
                      Trạng thái phát hành lúc lưu
                    </label>
                    <select
                      id="newjob-status"
                      value={jobInitialStatus}
                      onChange={(e) => setJobInitialStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-300 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer font-bold"
                    >
                      <option value="draft">Lưu bản nháp (Draft)</option>
                      <option value="published">Đăng công khai luôn (Published)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-desc">
                      Mô tả chi tiết công việc <span className="text-emerald-500">*</span>
                    </label>
                    <textarea
                      id="newjob-desc"
                      required
                      rows={5}
                      value={jobDesc}
                      onChange={(e) => setJobDesc(e.target.value)}
                      placeholder="Nội dung, trách nhiệm, KPIs và kỹ năng yêu cầu..."
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none resize-none font-light leading-relaxed"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-req">
                      Yêu cầu năng lực ứng viên
                    </label>
                    <textarea
                      id="newjob-req"
                      rows={3}
                      value={jobReq}
                      onChange={(e) => setJobReq(e.target.value)}
                      placeholder="Chứng chỉ, số năm kinh nghiệm thực chiến..."
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none resize-none font-light leading-relaxed"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="newjob-benefits">
                      Chế độ phúc lợi sở hữu
                    </label>
                    <textarea
                      id="newjob-benefits"
                      rows={3}
                      value={jobBenefits}
                      onChange={(e) => setJobBenefits(e.target.value)}
                      placeholder="Bảo hiểm sức khỏe, máy tính xách tay xịn..."
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-850 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none resize-none font-light leading-relaxed"
                    />
                  </div>

                  <div className="sm:col-span-2 pt-4 flex items-center justify-end gap-2 border-t border-slate-850">
                    <button
                      type="button"
                      onClick={() => setAddJobFormOpen(false)}
                      className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Bỏ qua
                    </button>
                    <button
                      type="submit"
                      disabled={jobSaving}
                      className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {jobSaving ? 'Đang tạo tin...' : 'Phát hành ngay'}
                    </button>
                  </div>

                </form>

              </div>
            ) : activeJob ? (
              
              /* SUB-FLOW B: Application screening workspace */
              <div className="space-y-6">
                
                {/* Active Job detail and state management controls */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                  
                  <div className="flex items-start justify-between gap-4 flex-wrap pb-3 border-b border-slate-850">
                    <div className="space-y-1">
                      <h2 className="text-xl font-black text-slate-200">{activeJob.title}</h2>
                      <div className="flex items-center gap-2 text-[10px] font-mono select-none">
                        <span className="text-slate-500">Lương:</span>
                        <span className="text-emerald-400 font-bold">{formatCurrency(activeJob.salary_min, activeJob.currency)} - {formatCurrency(activeJob.salary_max, activeJob.currency)}</span>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-500">Hạn: {formatDate(activeJob.deadline_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link 
                        to={`/jobs/${activeJob.id}`} 
                        className="px-3 py-1.5 bg-slate-950 border border-slate-850 text-slate-300 hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1"
                        id="job-open-public-viewer"
                      >
                        Public view <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
                      </Link>

                      {/* Job Status modifier drop actions */}
                      {activeJob.status === 'draft' && (
                        <button
                          onClick={() => handleUpdateJobStatus(activeJob.id, 'published')}
                          disabled={jobStatusSavingId === activeJob.id}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition cursor-pointer"
                        >
                          Publish tin đăng
                        </button>
                      )}

                      {activeJob.status === 'published' && (
                        <button
                          onClick={() => handleUpdateJobStatus(activeJob.id, 'closed')}
                          disabled={jobStatusSavingId === activeJob.id}
                          className="px-3 py-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 text-[10px] font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
                        >
                          Đóng tuyển dụng
                        </button>
                      )}

                      {activeJob.status !== 'archived' && (
                        <button
                          onClick={() => handleUpdateJobStatus(activeJob.id, 'archived')}
                          disabled={jobStatusSavingId === activeJob.id}
                          className="px-3 py-1.5 bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-slate-800 text-[10px] font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
                        >
                          Lưu trữ (Archive)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Technical properties details */}
                  <div className="text-xs text-slate-400 font-mono flex items-center gap-4 flex-wrap select-none leading-none pt-1">
                    <p><strong>Status:</strong> <span className="text-slate-200 uppercase font-bold text-emerald-400">{ENUM_LABELS.job_post_status[activeJob.status]}</span></p>
                    <p><strong>Employment:</strong> <span className="text-slate-200 capitalize">{ENUM_LABELS.employment_type[activeJob.employment_type as keyof typeof ENUM_LABELS.employment_type]}</span></p>
                    <p><strong>Ngày tạo:</strong> <span className="text-slate-200">{formatDate(activeJob.created_at)}</span></p>
                  </div>

                </div>

                {/* Sub-panels: Candidate submissions list matches activeJobTabId */}
                <div className="space-y-6">
                  <div className="flex items-center gap-1.5 border-b border-slate-850 pb-2 select-none">
                    <Users2 className="h-5 w-5 text-emerald-400" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                      Hồ sơ ứng viên nộp cho tin tuyển này ({activeJobApps.length})
                    </h3>
                  </div>

                  {activeJobApps.length === 0 ? (
                    <div className="text-center py-12 bg-slate-905 border border-slate-850 rounded-3xl select-none">
                      <FileCheck2 className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                      <h4 className="text-xs font-bold text-slate-300">Chưa có ứng viên nộp đơn</h4>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-xs mx-auto">Vị trí chưa ghi nhận đơn nộp từ candidate. Chia sẻ tin tuyển lên mạng xã hội để tăng trưởng tương tác!</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {activeJobApps.map((app) => {
                        const prof = profilesMap[app.applicant_user_id] || { full_name: 'Ẩn danh', email: 'Chưa rõ', phone: '' } as Profile;
                        const stages = stagesMap[app.id] || [];

                        // Form state selectors per item
                        const curChosenStage = composerStages[app.id] || 'screening';
                        const curNote = composerNotes[app.id] || '';
                        
                        const isCVOpeningId = resumeOpeningId === app.id;
                        const isStageSavingId = stageSavingId === app.id;

                        return (
                          <div 
                            key={app.id} 
                            className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 relative"
                          >
                            
                            {/* Candidate header details */}
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-850">
                              
                              <div className="space-y-1.5">
                                <h4 className="text-sm font-extrabold text-slate-100 flex items-center gap-2">
                                  <User className="h-4 w-4 text-emerald-400 shrink-0" />
                                  {prof.full_name || 'Ứng viên chưa cấu hình hồ sơ'}
                                </h4>
                                
                                <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono select-none flex-wrap leading-tight">
                                  <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {prof.email}</span>
                                  {prof.phone && (
                                    <>
                                      <span>|</span>
                                      <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {prof.phone}</span>
                                    </>
                                  )}
                                  <span>|</span>
                                  <span>Applied: {formatDate(app.applied_at, true)}</span>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-mono mb-1 select-none">Độ trạng thái</p>
                                <span className={`inline-block px-2.5 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${
                                  app.current_status === 'rejected' 
                                    ? 'bg-red-500/15 text-red-400 border-red-500/30' 
                                    : app.current_status === 'accepted' || app.current_status === 'offer'
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                }`}>
                                  {ENUM_LABELS.application_status[app.current_status]}
                                </span>
                              </div>

                            </div>

                            {/* Double grid details contents: CV details & Stage Composer */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 leading-normal">
                              
                              {/* Left column: Resume Snapshot & Cover letter */}
                              <div className="md:col-span-7 space-y-4">
                                
                                <div className="space-y-1 select-none">
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">Snapshot CV và liên kết tệp</p>
                                  <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-850 flex items-center justify-between gap-4 font-mono text-[10px] text-slate-400">
                                    <div className="truncate">
                                      <p className="text-slate-200 font-sans font-bold leading-none truncate">{app.resume_title_snapshot || 'CV Ứng tuyển'}</p>
                                      <span className="text-[9px] text-slate-500 mt-1 inline-block">({(app.resume_size_bytes_snapshot ? app.resume_size_bytes_snapshot / 1024 : 0).toFixed(1)} KB)</span>
                                    </div>
                                    
                                    <button
                                      onClick={() => handleOpenCandidateCV(app.id, app.resume_storage_path_snapshot)}
                                      disabled={isCVOpeningId}
                                      className="px-3 py-1.5 hover:bg-slate-800 text-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0 bg-slate-900 border border-slate-800 cursor-pointer duration-100"
                                    >
                                      {isCVOpeningId ? <Clock className="h-3 w-3 animate-spin" /> : <ArrowUpRight className="h-3 w-3" />}
                                      Giải mật CV
                                    </button>
                                  </div>
                                </div>

                                {app.cover_letter && (
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono select-none">Thư giới thiệu từ ứng viên</p>
                                    <div className="bg-slate-950/30 border border-slate-850/40 rounded-xl p-3 text-xs text-slate-400 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-line font-light">
                                      {app.cover_letter}
                                    </div>
                                  </div>
                                )}

                              </div>

                              {/* Right column: Action composer to insert a stage */}
                              <div className="md:col-span-5 bg-slate-950/30 border border-slate-850 p-4 rounded-3xl space-y-4">
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 select-none font-mono">
                                  Stage Composer (Chuyển đổi trạng thái)
                                </h5>

                                <form onSubmit={(e) => handleAddStage(e, app.id)} className="space-y-3.5">
                                  <div className="space-y-1">
                                    <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-500" htmlFor={`composer-stage-${app.id}`}>Trạng thái mới</label>
                                    <select
                                      id={`composer-stage-${app.id}`}
                                      value={curChosenStage}
                                      onChange={(e) => setComposerStages(p => ({ ...p, [app.id]: e.target.value }))}
                                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                                    >
                                      <option value="screening">Duyệt hồ sơ (Screening)</option>
                                      <option value="interview">Lên lịch PV (Interview)</option>
                                      <option value="offer">Nhận thư mời (Offer)</option>
                                      <option value="accepted">Trúng tuyển (Accepted)</option>
                                      <option value="rejected">Hồ sơ không hợp (Rejected)</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-500" htmlFor={`composer-note-${app.id}`}>Ghi chú/Phản hồi lí do</label>
                                    <input
                                      type="text"
                                      id={`composer-note-${app.id}`}
                                      value={curNote}
                                      onChange={(e) => setComposerNotes(p => ({ ...p, [app.id]: e.target.value }))}
                                      placeholder="VD: Lên lịch phỏng vấn tối 20h"
                                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none placeholder:text-slate-600"
                                    />
                                  </div>

                                  <button
                                    type="submit"
                                    disabled={isStageSavingId}
                                    className="w-full inline-flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider duration-150 cursor-pointer"
                                  >
                                    {isStageSavingId ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                                    Lưu lại trạng thái mới
                                  </button>
                                </form>
                              </div>

                            </div>

                            {/* Bottom tracking timeline */}
                            <div className="pt-4 border-t border-slate-850 space-y-2">
                              <p className="text-[9px] font-bold text-slate-50 relative shrink-0 flex items-center gap-1 select-none font-mono uppercase tracking-widest">
                                <History className="h-3.5 w-3.5 text-slate-500" />
                                Timeline lịch trình hồ sơ
                              </p>
                              
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 pt-0.5">
                                {stages.map((stg, i) => {
                                  return (
                                    <div key={stg.id} className="inline-flex items-center gap-1.5 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-850/80">
                                      <span className={`font-bold uppercase tracking-wide text-[9px] ${
                                        stg.stage === 'rejected' ? 'text-red-400' : stg.stage === 'accepted' || stg.stage === 'offer' ? 'text-emerald-400' : 'text-slate-300'
                                      }`}>
                                        {ENUM_LABELS.application_status[stg.stage]}
                                      </span>
                                      <span className="text-slate-600 font-mono text-[9px]">({formatDate(stg.created_at)})</span>
                                      {stg.note && (
                                        <span className="text-slate-400 italic"> - "{stg.note}"</span>
                                      )}
                                      {i < stages.length - 1 && <span className="text-slate-700 ml-1">→</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="text-center py-20 bg-slate-900 border border-slate-800 rounded-3xl max-w-md mx-auto select-none space-y-3">
                <Compass className="h-12 w-12 text-slate-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-300">Không có vị trí làm việc đang chọn</h4>
                <p className="text-xs text-slate-500">Vui lòng cấu hình, thiết đặt hoặc bổ sung tin tuyển dụng để bắt đầu theo dõi tiến độ nộp của học viên.</p>
              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
};

export default RecruiterJobsPage;

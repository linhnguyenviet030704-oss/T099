import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Send, 
  MapPin, 
  Clock, 
  Trash2, 
  Compass, 
  CheckCircle, 
  FileCheck, 
  History, 
  AlertCircle,
  AlertTriangle,
  FileDown
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Application, ApplicationStage } from '../types';
import { formatDate, ENUM_LABELS } from '../lib/format';

export const MyApplicationsPage: React.FC = () => {
  const { user } = useAuth();
  
  const [applications, setApplications] = useState<Application[]>([]);
  const [stagesMap, setStagesMap] = useState<Record<string, ApplicationStage[]>>({});
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const fetchApplicationsWorkspace = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Query applications matching user ID
      const { data: appsData, error: appsErr } = await supabase
        .from('job_submits')
        .select('*, job_posts(*, companies(*))')
        .eq('applicant_user_id', user.id)
        .order('applied_at', { ascending: false });

      if (appsErr) throw appsErr;

      const items = (appsData || []).map((app: any) => ({
        ...app,
        job_post: {
          ...app.job_posts,
          company: app.job_posts?.companies,
        },
      })) as Application[];

      // 2. Query application stages timeline records matching application IDs
      if (items.length > 0) {
        const appIds = items.map(i => i.id);
        const { data: stagesData, error: stagesErr } = await supabase
          .from('application_stages')
          .select('*')
          .in('application_id', appIds)
          .order('created_at', { ascending: false });

        if (stagesErr) throw stagesErr;

        // Group stages by application ID
        const groups: Record<string, ApplicationStage[]> = {};
        (stagesData || []).forEach((stg: any) => {
          if (!groups[stg.application_id]) {
            groups[stg.application_id] = [];
          }
          groups[stg.application_id].push(stg as ApplicationStage);
        });

        setStagesMap(groups);
      }

      setApplications(items);
    } catch (err: any) {
      console.error('Error fetching applications workspace:', err);
      setError(handleSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchApplicationsWorkspace();
    }
  }, [user, fetchApplicationsWorkspace]);

  // Execute withdrawal (inserts stage withdrawn)
  const handleWithdraw = async (appId: string) => {
    if (!supabase || !user) return;
    if (!window.confirm('Bạn có thực sự chắc chắn muốn rút hồ sơ ứng tuyển này không? Hành động này sẽ thông báo tới nhà tuyển dụng và không thể hoàn tác.')) return;

    try {
      setWithdrawingId(appId);
      
      const payload = {
        application_id: appId,
        changed_by_user_id: user.id,
        stage: 'withdrawn',
        note: 'Học viên chủ động rút hồ sơ nộp (Withdrawn by candidate)',
        is_system_generated: false,
      };

      const { error: stageErr } = await supabase
        .from('application_stages')
        .insert(payload);

      if (stageErr) throw stageErr;

      // Re-fetch to synchronize state
      await fetchApplicationsWorkspace();
    } catch (err: any) {
      console.error('Withdraw application error:', err);
      alert(handleSupabaseError(err));
    } finally {
      setWithdrawingId(null);
    }
  };

  return (
    <div className="space-y-10 py-2 animate-fade-in">
      
      {/* Title block */}
      <section className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
          <Send className="h-7 w-7 text-emerald-400" />
          Quản lý đơn ứng tuyển cá nhân
        </h1>
        <p className="text-xs text-slate-400 mt-1">Theo dõi tiến trình xét duyệt CV trực tiếp, lịch trình phỏng vấn và phản hồi chi tiết.</p>
      </section>

      {loading ? (
        <div className="space-y-6 py-6 animate-pulse">
          <div className="h-32 bg-slate-900 rounded-3xl w-full" />
          <div className="h-32 bg-slate-900 rounded-3xl w-full animate-delay-150" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-center text-sm max-w-xl mx-auto">
          {error}
        </div>
      ) : applications.length === 0 ? (
        <section className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl max-w-lg mx-auto space-y-4">
          <Compass className="h-12 w-12 text-slate-600 mx-auto" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-300">Bạn chưa từng ứng tuyển tin nào</h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">Hãy bắt đầu khám phá hàng trăm cơ hội việc làm hấp dẫn đang mở tại sàn tuyển dụng của chúng tôi.</p>
          </div>
          <Link
            to="/jobs"
            className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition duration-150 shadow-md shadow-emerald-500/10"
            id="browse-jobs-cta"
          >
            Khám phá việc làm ngay
          </Link>
        </section>
      ) : (
        <section className="space-y-8">
          {applications.map((app) => {
            const job = app.job_post;
            const company = job?.company;
            const stages = stagesMap[app.id] || [];
            
            // Checks if withdrawal button is eligible
            // If current status is in {accepted, rejected, withdrawn}, hide withdraw button
            const isFinished = ['accepted', 'rejected', 'withdrawn'].includes(app.current_status);
            const isCurrentlyWithdrawing = withdrawingId === app.id;

            return (
              <div 
                key={app.id}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6 border-b border-slate-850">
                  
                  {/* Left block — Core details parameters */}
                  <div className="lg:col-span-8 space-y-4">
                    
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                        {company?.name || 'Công ty đăng tuyển'}
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-200 hover:text-emerald-400">
                        {job ? (
                          <Link to={`/jobs/${job.id}`}>{job.title}</Link>
                        ) : (
                          'Vị trí tuyển dụng đã đóng'
                        )}
                      </h3>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap text-slate-400 text-xs font-mono select-none">
                      <p><strong>Ngày nộp đơn:</strong> <span className="text-slate-300">{formatDate(app.applied_at, true)}</span></p>
                      {app.reviewed_at && (
                        <p><strong>Xử lý ngày:</strong> <span className="text-slate-300">{formatDate(app.reviewed_at, true)}</span></p>
                      )}
                    </div>

                    {/* Snapshot resume banner metadata display */}
                    {app.resume_title_snapshot && (
                      <div className="bg-slate-955 p-3 rounded-2xl border border-slate-850 inline-flex items-center gap-2 font-mono text-[10px] text-slate-400 select-none max-w-lg">
                        <FileDown className="h-4 w-4 text-slate-500 shrink-0" />
                        <div>
                          <strong>CV Snapshot tại lúc nộp:</strong>{' '}
                          <span className="text-slate-200 font-sans font-black">{app.resume_title_snapshot}</span>
                          <span className="text-slate-500 ml-1.5 font-mono">({(app.resume_size_bytes_snapshot ? app.resume_size_bytes_snapshot / 1024 : 0).toFixed(1)} KB)</span>
                        </div>
                      </div>
                    )}

                    {app.cover_letter && (
                      <div className="space-y-1 pt-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 select-none">Thư giới thiệu / Cover Letter</p>
                        <p className="text-xs text-slate-400 leading-relaxed font-light font-sans bg-slate-950/30 border border-slate-850/40 p-3 rounded-xl max-w-3xl whitespace-pre-line">{app.cover_letter}</p>
                      </div>
                    )}

                  </div>

                  {/* Right block — Status indicators & Withdraw trigger */}
                  <div className="lg:col-span-4 flex flex-col justify-between items-end gap-4 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-850">
                    
                    <div className="text-right space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono select-none">Trạng thái hồ sơ</p>
                      <span className={`inline-block px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider ${
                        app.current_status === 'rejected' 
                          ? 'bg-red-500/15 text-red-400 border border-red-500/25 animate-pulse' 
                          : app.current_status === 'accepted' || app.current_status === 'offer'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-sm shadow-emerald-900/10'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                      }`}>
                        {ENUM_LABELS.application_status[app.current_status]}
                      </span>
                    </div>

                    {/* Trigger withdraw button */}
                    {!isFinished && (
                      <button
                        onClick={() => handleWithdraw(app.id)}
                        disabled={isCurrentlyWithdrawing}
                        className="bg-slate-955 hover:bg-slate-800 hover:text-red-400 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs transition select-none flex items-center justify-center gap-1 cursor-pointer"
                        id={`withdraw-btn-${app.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isCurrentlyWithdrawing ? 'Đang gửi...' : 'Rút hồ sơ nộp'}
                      </button>
                    )}

                  </div>

                </div>

                {/* S8 Chronological timeline tracking stage */}
                <div className="pt-6 space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 select-none font-mono">
                    <History className="h-4 w-4 text-slate-500" />
                    Lịch sử xét duyệt chuyên sâu (Timeline)
                  </h4>

                  {stages.length === 0 ? (
                    <p className="text-[11px] text-slate-500 font-mono italic">Chưa có bản ghi hoạt động.</p>
                  ) : (
                    <div className="relative border-l border-slate-850 pl-5 ml-2.5 space-y-4 pt-1">
                      {stages.map((stage) => {
                        return (
                          <div key={stage.id} className="relative group/timeline text-xs">
                            <div className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-slate-900 border-2 border-slate-700 group-hover/timeline:border-emerald-500 transition duration-150 z-10 shrink-0" />
                            
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap text-[11px] select-none">
                                <span className={`font-bold ${
                                  stage.stage === 'rejected' ? 'text-red-400' : stage.stage === 'accepted' || stage.stage === 'offer' ? 'text-emerald-400' : 'text-slate-300'
                                }`}>
                                  {ENUM_LABELS.application_status[stage.stage]}
                                </span>
                                <span className="text-slate-500 font-mono">|</span>
                                <span className="text-slate-500 font-mono text-[10px]">{formatDate(stage.created_at, true)}</span>
                                {stage.is_system_generated && (
                                  <span className="text-[9px] font-mono text-slate-500 italic bg-slate-955 px-1 py-0.5 rounded border border-slate-850">system-generated</span>
                                )}
                              </div>
                              {stage.note && (
                                <p className="text-slate-400 leading-relaxed font-light mt-0.5">{stage.note}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </section>
      )}

    </div>
  );
};

export default MyApplicationsPage;

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ExternalLink } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase, handleSupabaseError } from "../lib/supabase";
import type { Application, ApplicationStage } from "../types";
import { ENUM_LABELS, formatDate } from "../lib/format";
import { APP_STATUS_COLORS, TERMINAL_APP_STATUSES } from "../lib/ui";
import AnimatedPage from "../components/AnimatedPage";
import ConfirmModal from "../components/ConfirmModal";

export default function ApplicationsPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [stagesMap, setStagesMap] = useState<Record<string, ApplicationStage[]>>({});
  const [withdrawId, setWithdrawId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const { data: appsData, error } = await supabase
      .from("job_submits")
      .select("*, job_posts(*, companies(*))")
      .eq("applicant_user_id", user.id)
      .order("applied_at", { ascending: false });
    if (error) {
      alert(handleSupabaseError(error));
      return;
    }
    const items = ((appsData || []) as any[]).map((app) => ({
      ...app,
      job_post: { ...app.job_posts, company: app.job_posts?.companies },
    })) as Application[];
    setApplications(items);
    if (items.length > 0) {
      const { data: stagesData } = await supabase.from("application_stages").select("*").in("application_id", items.map((i) => i.id)).order("created_at", { ascending: false });
      const groups: Record<string, ApplicationStage[]> = {};
      (stagesData || []).forEach((stg: ApplicationStage) => {
        groups[stg.application_id] = groups[stg.application_id] || [];
        groups[stg.application_id].push(stg);
      });
      setStagesMap(groups);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const handleWithdraw = async () => {
    if (!supabase || !user || !withdrawId) return;
    const { error } = await supabase.from("application_stages").insert({
      application_id: withdrawId,
      changed_by_user_id: user.id,
      stage: "withdrawn",
      note: "Ứng viên rút đơn",
      is_system_generated: false,
    });
    setWithdrawId(null);
    if (error) alert(handleSupabaseError(error));
    else await load();
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display text-3xl font-bold mb-8">Đơn ứng tuyển của tôi</h1>
        {applications.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border p-16 text-center">
            <p className="font-medium mb-2">Chưa có đơn ứng tuyển nào</p>
            <Link to="/jobs" className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm rounded-xl">
              <Search size={15} /> Tìm việc làm
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => {
              const job = app.job_post;
              const canWithdraw = !TERMINAL_APP_STATUSES.includes(app.current_status);
              return (
                <div key={app.id} className="bg-white dark:bg-slate-800 rounded-2xl border p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link to={`/jobs/${job?.id}`} className="font-semibold hover:text-indigo-600 inline-flex items-center gap-1">
                        {job?.title} <ExternalLink size={12} />
                      </Link>
                      <p className="text-xs text-slate-500">{job?.company?.name} · Nộp {formatDate(app.applied_at)}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full ${APP_STATUS_COLORS[app.current_status]}`}>
                      {ENUM_LABELS.application_status[app.current_status]}
                    </span>
                  </div>
                  {(stagesMap[app.id] || []).length > 0 && (
                    <ul className="mt-3 text-xs text-slate-500 space-y-1">
                      {stagesMap[app.id].map((s) => (
                        <li key={s.id}>{formatDate(s.created_at, true)} · {ENUM_LABELS.application_status[s.stage]} {s.note ? `— ${s.note}` : ""}</li>
                      ))}
                    </ul>
                  )}
                  {canWithdraw && (
                    <button onClick={() => setWithdrawId(app.id)} className="mt-3 text-xs text-red-500">Rút đơn</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ConfirmModal
        open={Boolean(withdrawId)}
        title="Rút đơn ứng tuyển"
        message="Bạn có chắc chắn muốn rút đơn này? Hành động không thể hoàn tác."
        confirmLabel="Rút đơn"
        danger
        onConfirm={() => void handleWithdraw()}
        onCancel={() => setWithdrawId(null)}
      />
    </AnimatedPage>
  );
}

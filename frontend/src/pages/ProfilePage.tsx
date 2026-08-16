import React, { useEffect, useState, useCallback } from 'react';
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  ShieldAlert, 
  Plus, 
  Briefcase, 
  GraduationCap, 
  FileEdit, 
  Trash2, 
  Save, 
  Search, 
  UserCog, 
  AlertCircle,
  HelpCircle,
  UserCheck,
  Sparkles,
  CheckSquare,
  Square,
  Layers
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { apiJson } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { useCurrentProfile } from '../profile/ProfileProvider';
import { Profile, UserProfileLine } from '../types';
import { ENUM_LABELS, formatDate } from '../lib/format';
import { BatchLineForm } from '../components/BatchLineForm';
import { CvBuilderContainer } from '../components/cv/CvBuilderContainer';
import { LineDraft, batchInsertLines, batchDeleteLines } from '../lib/profileLines';

export const ProfilePage: React.FC = () => {
  const { user, session } = useAuth();
  const { profile, isAdmin, refreshProfile, loading: profileLoading } = useCurrentProfile();
  
  // Section loading
  const [loadingLines, setLoadingLines] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Profile fields state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Profile Lines state
  const [lines, setLines] = useState<UserProfileLine[]>([]);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [batchFormOpen, setBatchFormOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineMessage, setLineMessage] = useState<string | null>(null);

  // Bulk select state for lines
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // CV builder mode
  const [cvMode, setCvMode] = useState(false);

  // Line single entry form state
  const [lineType, setLineType] = useState<UserProfileLine['name']>('summary');
  const [lineValue, setLineValue] = useState('');
  const [lineOrder, setLineOrder] = useState(0);

  // Admin users lists
  const [adminUsers, setAdminUsers] = useState<Profile[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  // Fetch user profile lines Helper
  const fetchProfileLines = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setLoadingLines(true);
      const { data, error } = await supabase
        .from('profile_lines')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLines(data || []);
    } catch (err) {
      console.error('Error fetching lines:', err);
    } finally {
      setLoadingLines(false);
    }
  }, [user]);

  // Fetch profiles dictionary for admin Helper
  const fetchAdminProfiles = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    try {
      setAdminLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAdminUsers(data || []);
    } catch (err) {
      console.error('Error fetching admin profiles:', err);
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin]);

  // Initialize form fields
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  useEffect(() => {
    if (user) {
      fetchProfileLines();
    }
  }, [user, fetchProfileLines]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminProfiles();
    }
  }, [isAdmin, fetchAdminProfiles]);

  // Handle saving primary profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user) return;

    setSavingProfile(true);
    setProfileMessage(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
      
      await refreshProfile();
      setProfileMessage({ type: 'success', text: 'Thông tin hồ sơ cá nhân đã được cập nhật thành công!' });
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setProfileMessage({ type: 'error', text: handleSupabaseError(err) });
    } finally {
      setSavingProfile(false);
    }
  };

  // Profile Lines submission handle
  const handleSaveLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user) return;
    setLineMessage(null);

    // Validations
    if (!lineValue.trim()) {
      setLineMessage('Nội dung không thể bỏ trống.');
      return;
    }

    try {
      const payload = {
        user_id: user.id,
        name: lineType,
        value: lineValue.trim(),
        display_order: Number(lineOrder) || 0,
        updated_at: new Date().toISOString(),
      };

      if (editingLineId) {
        const { error } = await supabase
          .from('profile_lines')
          .update(payload)
          .eq('id', editingLineId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('profile_lines')
          .insert(payload);
        if (error) throw error;
      }

      setLineFormOpen(false);
      resetLineForm();
      fetchProfileLines();
    } catch (err: any) {
      console.error('Error saving profile line:', err);
      setLineMessage(handleSupabaseError(err));
    }
  };

  const handleEditLineClick = (line: UserProfileLine) => {
    setEditingLineId(line.id);
    setLineType(line.name);
    setLineValue(line.value);
    setLineOrder(line.display_order);
    setLineFormOpen(true);
  };

  const handleDeleteLine = async (id: string) => {
    if (!supabase || !user) return;
    if (!window.confirm('Bạn có chắc chắn muốn xóa dòng thông tin hồ sơ này không?')) return;

    try {
      const { error } = await supabase
        .from('profile_lines')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
        
      if (error) throw error;
      fetchProfileLines();
    } catch (err) {
      console.error('Error deleting line:', err);
    }
  };

  const resetLineForm = () => {
    setEditingLineId(null);
    setLineType('summary');
    setLineValue('');
    setLineOrder(0);
    setLineMessage(null);
  };

  // Batch insert multiple new lines at once
  const handleBatchInsert = async (drafts: LineDraft[]) => {
    if (!user) return;
    await batchInsertLines(drafts, user.id);
    setBatchFormOpen(false);
    await fetchProfileLines();
  };

  // Bulk selection helpers
  const toggleLineSelected = (id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedLineIds((prev) =>
      prev.size === lines.length ? new Set() : new Set(lines.map((l) => l.id)),
    );
  };

  const handleBulkDelete = async () => {
    if (!user || selectedLineIds.size === 0) return;
    if (
      !window.confirm(
        `Xóa ${selectedLineIds.size} dòng hồ sơ đã chọn? Hành động này không thể hoàn tác.`,
      )
    )
      return;
    try {
      setBulkDeleting(true);
      await batchDeleteLines(Array.from(selectedLineIds), user.id);
      setSelectedLineIds(new Set());
      await fetchProfileLines();
    } catch (err: any) {
      setLineMessage(handleSupabaseError(err));
    } finally {
      setBulkDeleting(false);
    }
  };

  // Open CV builder from the profile page (switches the whole layout)
  const handleOpenCvBuilder = () => {
    setCvMode(true);
  };

  // Change user role (Admin action only — FastAPI + service_role)
  const handleUpdateUserRole = async (targetUserId: string, newRole: Profile['role']) => {
    if (!session?.access_token || !isAdmin) return;
    setAdminMessage(null);

    try {
      await apiJson(`/admin/profiles/${targetUserId}`, session.access_token, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      
      setAdminMessage(`Cập nhật vai trò người dùng thành [${ENUM_LABELS.profile_role[newRole]}] thành công!`);
      fetchAdminProfiles();
      
      // If updating ourself, reload profile too
      if (targetUserId === user?.id) {
        refreshProfile();
      }
    } catch (err: any) {
      console.error('Admin role update error:', err);
      setAdminMessage(err.message || handleSupabaseError(err));
    }
  };

  // Filter admin profiles client-side
  const filteredProfiles = adminUsers.filter(u => {
    const s = adminSearch.toLowerCase().trim();
    if (!s) return true;
    return (u.email || '').toLowerCase().includes(s) || 
           (u.full_name || '').toLowerCase().includes(s) || 
           (u.role || '').toLowerCase().includes(s);
  });

  return (
    <div className="space-y-10 py-2 animate-fade-in">
      
      {/* Loading main workspace spinner */}
      {profileLoading && !profile && (
        <div className="text-center py-20">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mr-auto"></div>
          <p className="mt-4 text-slate-400 font-medium">Đang đồng bộ hồ sơ lưu trữ...</p>
        </div>
      )}

      {profile && (
        <>
          {/* Header Card Profile Summary — hidden while in CV builder mode */}
          {!cvMode && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center gap-6">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            
            {/* Initial Profile Circle */}
            <div className="relative shrink-0 flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-slate-800 text-3xl font-bold uppercase tracking-wide border-2 border-slate-700 text-emerald-400 font-mono shadow-inner select-none">
              {fullName.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>

            <div className="flex-1 space-y-4 text-center md:text-left">
              <div>
                <div className="flex flex-col md:flex-row md:items-center gap-2 items-center justify-start">
                  <h1 className="text-2xl font-extrabold text-slate-100">{profile.full_name || 'Người dùng mới'}</h1>
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    profile.role === 'admin' 
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                      : profile.role === 'recruiter'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {ENUM_LABELS.profile_role[profile.role]}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">{user?.email}</p>
              </div>

              {/* Grid with technical metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono text-slate-400 pt-2 border-t border-slate-800/50">
                <p><strong>Mã phiên (ID):</strong> <span className="text-slate-200">{profile.id}</span></p>
                <p><strong>Ngày tạo:</strong> <span className="text-slate-200">{formatDate(profile.created_at, true)}</span></p>
                {session?.expires_at && (
                  <p><strong>Hạn phiên:</strong> <span className="text-slate-200">{new Date(session.expires_at * 1000).toLocaleString('vi-VN')}</span></p>
                )}
                <p><strong>Lần cập nhật cuối:</strong> <span className="text-slate-200">{formatDate(profile.updated_at, true)}</span></p>
              </div>

              {/* CV builder toggle */}
              <div className="pt-2">
                <button
                  onClick={handleOpenCvBuilder}
                  className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer"
                  id="open-cv-builder-profile"
                >
                  <Sparkles className="h-4 w-4" />
                  Tạo CV tự động từ hồ sơ
                </button>
              </div>
            </div>
          </section>
          )}

          {cvMode ? (
            <CvBuilderContainer
              profile={profile}
              email={user?.email || ''}
              sourceLines={lines}
              onClose={() => setCvMode(false)}
            />
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Block — Edit Primary Fields */}
            <section className="lg:col-span-1 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <User className="h-4.5 w-4.5 text-emerald-400" />
                    Chỉnh sửa thông tin
                  </h3>
                </div>

                {profileMessage && (
                  <div className={`p-4 rounded-xl text-xs flex items-start gap-2 ${
                    profileMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                    <p>{profileMessage.text}</p>
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="fullname-input">
                      Họ và tên <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="fullname-input"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="phone-input">
                      Số điện thoại liên hệ
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                        <Phone className="h-3.5 w-3.5" />
                      </span>
                      <input
                        type="text"
                        id="phone-input"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0987xxxxxx"
                        className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="avatar-input">
                      Đường dẫn hình đại diện
                    </label>
                    <input
                      type="url"
                      id="avatar-input"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/avatar.jpg"
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5 opacity-70">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Vai trò trên hệ thống
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={ENUM_LABELS.profile_role[profile.role]}
                      className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-800/60 rounded-xl text-slate-400 text-xs cursor-not-allowed uppercase font-mono tracking-widest font-semibold"
                    />
                    <p className="text-[9px] text-amber-500/80 font-mono mt-1">
                      Việc đổi vai trò đi qua API admin (service_role), không phải client RLS.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 select-none text-slate-950 font-bold py-2.5 rounded-xl text-xs transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    id="save-profile-btn"
                  >
                    <Save className="h-4 w-4" />
                    {savingProfile ? 'Đang lưu trữ...' : 'Lưu lại thông tin'}
                  </button>
                </form>
              </div>
            </section>

            {/* Right Block — CV Profile Lines Manager */}
            <section className="lg:col-span-2 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                
                {/* Header listing and expand trigger */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3 mb-6 gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-emerald-400" />
                    Dòng hồ sơ chuyên nghiệp (CV Lines)
                  </h3>
                  {!lineFormOpen && !batchFormOpen && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {lines.length > 0 && (
                        <>
                          <button
                            onClick={toggleSelectAll}
                            className="inline-flex items-center gap-1 bg-slate-950 hover:bg-slate-800 text-slate-400 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-slate-800 transition cursor-pointer"
                          >
                            {selectedLineIds.size === lines.length ? (
                              <CheckSquare className="h-3.5 w-3.5" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                            {selectedLineIds.size === lines.length ? 'Bỏ chọn' : 'Chọn tất cả'}
                          </button>
                          {selectedLineIds.size > 0 && (
                            <button
                              onClick={handleBulkDelete}
                              disabled={bulkDeleting}
                              className="inline-flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-red-500/20 transition cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {bulkDeleting ? 'Đang xóa...' : `Xóa (${selectedLineIds.size})`}
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => { resetLineForm(); setLineFormOpen(true); }}
                        className="inline-flex items-center gap-1 bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-800 transition cursor-pointer"
                        id="add-profile-line-btn"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Thêm 1 dòng
                      </button>
                      <button
                        onClick={() => setBatchFormOpen(true)}
                        className="inline-flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-500/20 transition cursor-pointer"
                        id="add-batch-lines-btn"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Thêm hàng loạt
                      </button>
                    </div>
                  )}
                </div>

                {/* Batch add form */}
                {batchFormOpen && (
                  <div className="mb-8">
                    <BatchLineForm
                      onSubmit={handleBatchInsert}
                      onCancel={() => setBatchFormOpen(false)}
                      startOrder={lines.length}
                    />
                  </div>
                )}

                {/* Sub-form to Add/Edit Profile Line */}
                {lineFormOpen && (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 mb-8 space-y-5 animate-slide-up relative">
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest">
                      {editingLineId ? 'Chỉnh sửa dòng hồ sơ' : 'Tạo dòng hồ sơ mới'}
                    </h4>

                    {lineMessage && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400 flex items-start gap-1.5">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>{lineMessage}</p>
                      </div>
                    )}

                    <form onSubmit={handleSaveLine} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="line-type-select">
                          Phân loại <span className="text-emerald-500">*</span>
                        </label>
                        <select
                          id="line-type-select"
                          value={lineType}
                          onChange={(e) => setLineType(e.target.value as UserProfileLine['name'])}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        >
                          {Object.entries(ENUM_LABELS.line_type).map(([key, val]) => (
                            <option key={key} value={key}>{val}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="line-order-input">
                          Thứ tự hiển thị
                        </label>
                        <input
                          type="number"
                          id="line-order-input"
                          value={lineOrder}
                          onChange={(e) => setLineOrder(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="line-value-textarea">
                          Nội dung <span className="text-emerald-500">*</span>
                        </label>
                        <textarea
                          id="line-value-textarea"
                          rows={4}
                          required
                          value={lineValue}
                          onChange={(e) => setLineValue(e.target.value)}
                          placeholder="Ví dụ: Tốt nghiệp đại học quốc gia HCM"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                        />
                      </div>

                      <div className="sm:col-span-2 pt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setLineFormOpen(false); resetLineForm(); }}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-xl text-xs font-semibold cursor-pointer"
                        >
                          Hủy bỏ
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Lưu lại dòng
                        </button>
                      </div>

                    </form>
                  </div>
                )}

                {/* Listing of Existing CV Profile Lines */}
                {loadingLines ? (
                  <div className="space-y-4 py-8 animate-pulse">
                    <div className="h-10 bg-slate-950 rounded-xl w-full" />
                    <div className="h-10 bg-slate-950 rounded-xl w-3/4" />
                  </div>
                ) : lines.length === 0 ? (
                  <div className="text-center py-10 bg-slate-950/40 border border-slate-800/50 rounded-2xl select-none">
                    <HelpCircle className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Chưa có dòng hồ sơ nào.</p>
                    <p className="text-[10px] text-slate-500 mt-1">Thêm kinh nghiệm, học vấn của bạn để nhà tuyển dụng dễ dàng đánh giá.</p>
                  </div>
                ) : (
                  <div className="relative border-l border-slate-850 ml-3 pl-6 space-y-6">
                    {lines.map((line) => {
                      return (
                        <div key={line.id} className="relative group/item">
                          
                          {/* Anchor circle icon layout */}
                          <div className="absolute -left-[31px] top-1 flex items-center justify-center w-4 h-4 rounded-full bg-slate-900 border-2 border-emerald-500 text-emerald-400 z-10 shrink-0 select-none group-hover/item:scale-110 duration-150"></div>

                          <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 hover:border-slate-800 duration-155 relative">
                            
                            {/* Actions float */}
                            <div className="absolute top-4 right-4 flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={selectedLineIds.has(line.id)}
                                onChange={() => toggleLineSelected(line.id)}
                                title="Chọn dòng này"
                                className="accent-emerald-500 w-3.5 h-3.5 cursor-pointer mr-1"
                              />
                              <button
                                onClick={() => handleEditLineClick(line)}
                                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg duration-100 cursor-pointer opacity-0 group-hover/item:opacity-100 transition-opacity"
                              >
                                <FileEdit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteLine(line.id)}
                                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg duration-100 cursor-pointer opacity-0 group-hover/item:opacity-100 transition-opacity"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-850 text-slate-300 mb-1 border border-slate-800">
                              {ENUM_LABELS.line_type[line.name] || line.name}
                            </span>

                            <p className="text-xs text-slate-200 pr-16 whitespace-pre-line">{line.value}</p>

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

          {/* S4 Admin Role controller tool block */}
          {isAdmin && (
            <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl mt-12 space-y-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <UserCog className="h-5 w-5 text-red-400" />
                    Quản lý vai trò (Admin Mode)
                  </h3>
                  <p className="text-xs text-slate-500">Cho phép cập nhật vai trò trực tiếp đối với người dùng đăng ký.</p>
                </div>

                {/* Client layout filters search input */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    placeholder="Tìm tên, email, role..."
                    className="pl-9 pr-3.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none w-full sm:w-60"
                  />
                </div>
              </div>

              {adminMessage && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs flex items-center gap-1.5 max-w-xl">
                  <UserCheck className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
                  <p>{adminMessage}</p>
                </div>
              )}

              {adminLoading ? (
                <div className="text-center py-6 animate-pulse">
                  <div className="h-6 bg-slate-950 rounded w-full mb-3" />
                  <div className="h-6 bg-slate-950 rounded w-5/6" />
                </div>
              ) : filteredProfiles.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Không tìm thấy bản ghi người dùng phù hợp tìm kiếm.</p>
              ) : (
                <div className="overflow-x-auto border border-slate-850 rounded-2xl bg-slate-950/20">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-[10px] font-bold uppercase tracking-widest border-b border-slate-850">
                      <tr>
                        <th className="px-4 py-3">Họ và tên / Email</th>
                        <th className="px-4 py-3">Mã định danh UserID</th>
                        <th className="px-4 py-3">Vai trò hiện tại</th>
                        <th className="px-4 py-3 text-right">Cập nhật quyền hạn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {filteredProfiles.map((p) => {
                        return (
                          <tr key={p.id} className="hover:bg-slate-900/60 duration-100">
                            
                            <td className="px-4 py-3">
                              <p className="font-bold text-slate-200">{p.full_name || 'Chưa đặt tên'}</p>
                              <span className="text-[10px] text-slate-400 font-mono mt-0.5">{p.email}</span>
                            </td>

                            <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{p.id}</td>

                            <td className="px-4 py-3">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold ${
                                p.role === 'admin' 
                                  ? 'bg-red-500/15 text-red-400 border border-red-500/25' 
                                  : p.role === 'recruiter'
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                              }`}>
                                {ENUM_LABELS.profile_role[p.role]}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-right">
                              <select
                                value={p.role}
                                onChange={(e) => handleUpdateUserRole(p.id, e.target.value)}
                                className="px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                              >
                                <option value="candidate">Tuyển dụng thành Candidate</option>
                                <option value="recruiter">Nâng quyền thành Recruiter</option>
                                <option value="admin">Ấn quyền thành Admin</option>
                              </select>
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            </section>
          )}

        </>
      )}

    </div>
  );
};

export default ProfilePage;

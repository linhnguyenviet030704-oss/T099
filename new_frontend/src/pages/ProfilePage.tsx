import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { User, Phone, Camera, Plus, Edit2, Trash2, Check, X, FileText, ChevronDown } from "lucide-react";
import { useApp } from "../context/AppContext";
import { type ProfileItemType, PROFILE_ITEM_TYPE_LABELS } from "../data/mockData";
import AnimatedPage, { staggerContainer, fadeUp } from "../components/AnimatedPage";
import Badge from "../components/Badge";
import ConfirmModal from "../components/ConfirmModal";

const ITEM_TYPE_ICONS: Record<ProfileItemType, string> = {
  summary: "👋", experience: "💼", education: "🎓", skill: "⚡",
  project: "🚀", certificate: "🏆", language: "🌐", link: "🔗", other: "📝",
};

export default function ProfilePage() {
  const { currentUser, profileItems, addProfileItem, updateProfileItem, deleteProfileItem, updateProfile, users, changeUserRole } = useApp();
  const navigate = useNavigate();

  const [profileForm, setProfileForm] = useState({ name: currentUser?.name || "", phone: currentUser?.phone || "", avatar: currentUser?.avatar || "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editData, setEditData] = useState({ title: "", content: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ type: "experience" as ProfileItemType, title: "", content: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (!currentUser) { navigate("/login"); return null; }

  const myItems = profileItems.filter((i) => i.userId === currentUser.id);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    updateProfile(profileForm);
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const startEdit = (id: string, title: string, content: string) => {
    setEditingItem(id);
    setEditData({ title, content });
  };

  const saveEdit = () => {
    if (editingItem) { updateProfileItem(editingItem, editData); setEditingItem(null); }
  };

  const handleAdd = () => {
    if (!newItem.title.trim()) return;
    addProfileItem(newItem);
    setNewItem({ type: "experience", title: "", content: "" });
    setShowAddForm(false);
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">Hồ sơ</h1>
          <Link to="/cv-vault" className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-colors">
            <FileText size={15} /> Tủ hồ sơ/CV
          </Link>
        </div>

        {/* Profile card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-7 mb-6">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-5">Thông tin cá nhân</h2>
          <div className="flex items-start gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                {profileForm.avatar ? (
                  <img src={profileForm.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-2xl">{profileForm.name[0] || "?"}</span>
                )}
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Họ và tên</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Điện thoại</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="0901 234 567"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">URL ảnh đại diện</label>
                <div className="relative">
                  <Camera size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="url"
                    value={profileForm.avatar}
                    onChange={(e) => setProfileForm((p) => ({ ...p, avatar: e.target.value }))}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-colors disabled:opacity-60"
            >
              {profileSaved ? <><Check size={15} /> Đã lưu!</> : profileSaving ? "Đang lưu..." : "Lưu thông tin"}
            </motion.button>
          </div>
        </div>

        {/* Profile items */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-7 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-800 dark:text-white">Dòng hồ sơ</h2>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 text-sm font-medium rounded-xl hover:bg-indigo-100 transition-colors"
            >
              <Plus size={15} /> Thêm dòng
            </button>
          </div>

          {/* Add form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-4"
              >
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-5 space-y-3 border border-indigo-100 dark:border-indigo-800">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Loại</label>
                      <select
                        value={newItem.type}
                        onChange={(e) => setNewItem((p) => ({ ...p, type: e.target.value as ProfileItemType }))}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {(Object.keys(PROFILE_ITEM_TYPE_LABELS) as ProfileItemType[]).map((t) => (
                          <option key={t} value={t}>{PROFILE_ITEM_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tiêu đề</label>
                      <input
                        type="text"
                        value={newItem.title}
                        onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
                        placeholder="VD: Senior Dev tại Công ty ABC"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nội dung</label>
                    <textarea
                      rows={3}
                      value={newItem.content}
                      onChange={(e) => setNewItem((p) => ({ ...p, content: e.target.value }))}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Hủy</button>
                    <button onClick={handleAdd} className="px-4 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors">Thêm</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {myItems.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Chưa có dòng hồ sơ nào. Thêm thông tin để tạo CV dễ dàng hơn!</p>
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
              {myItems.map((item) => (
                <motion.div
                  key={item.id}
                  variants={fadeUp}
                  className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700"
                >
                  {editingItem === item.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editData.title}
                        onChange={(e) => setEditData((p) => ({ ...p, title: e.target.value }))}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <textarea
                        rows={3}
                        value={editData.content}
                        onChange={(e) => setEditData((p) => ({ ...p, content: e.target.value }))}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingItem(null)} className="p-1.5 text-slate-400 hover:text-slate-600"><X size={15} /></button>
                        <button onClick={saveEdit} className="p-1.5 text-indigo-600 hover:text-indigo-800"><Check size={15} /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="text-lg">{ITEM_TYPE_ICONS[item.type]}</span>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">{PROFILE_ITEM_TYPE_LABELS[item.type]}</span>
                          </div>
                          <p className="font-medium text-slate-800 dark:text-white text-sm">{item.title}</p>
                          {item.content && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-line line-clamp-3">{item.content}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => startEdit(item.id, item.title, item.content)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteId(item.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Admin: user management */}
        {currentUser.role === "admin" && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-7">
            <h2 className="font-semibold text-slate-800 dark:text-white mb-5">Quản lý người dùng (Admin)</h2>
            <div className="space-y-3">
              {users.filter((u) => u.id !== currentUser.id).map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-white">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) => changeUserRole(u.id, e.target.value as any)}
                    className="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="candidate">Ứng viên</option>
                    <option value="recruiter">Nhà tuyển dụng</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteId}
        title="Xóa dòng hồ sơ"
        message="Bạn có chắc muốn xóa dòng hồ sơ này không?"
        confirmLabel="Xóa"
        danger
        onConfirm={() => { if (deleteId) { deleteProfileItem(deleteId); setDeleteId(null); } }}
        onCancel={() => setDeleteId(null)}
      />
    </AnimatedPage>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Star, StarOff, Edit2, Trash2, ExternalLink, Check, Plus } from "lucide-react";
import { useApp } from "../context/AppContext";
import AnimatedPage, { staggerContainer, fadeUp } from "../components/AnimatedPage";
import Badge from "../components/Badge";
import ConfirmModal from "../components/ConfirmModal";

export default function CVVaultPage() {
  const { currentUser, cvFiles, uploadCV, renameCV, deleteCV, setDefaultCV, applications } = useApp();
  const navigate = useNavigate();

  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (!currentUser) { navigate("/login"); return null; }

  const myCVs = cvFiles.filter((c) => c.userId === currentUser.id);

  const appCountForCV = (cvId: string) =>
    applications.filter((a) => a.cvId === cvId && a.status !== "withdrawn").length;

  const handleUpload = async () => {
    if (!uploadName.trim()) return;
    setUploading(true);
    await new Promise((r) => setTimeout(r, 800));
    uploadCV(uploadName.trim());
    setUploading(false);
    setUploadSuccess(true);
    setUploadName("");
    setTimeout(() => { setUploadSuccess(false); setShowUpload(false); }, 1500);
  };

  const handleRename = (id: string) => {
    if (editName.trim()) renameCV(id, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">Tủ hồ sơ/CV</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{myCVs.length} CV đang lưu</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/cv-builder")}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm rounded-xl hover:border-indigo-300 transition-colors"
            >
              <FileText size={15} /> Tạo CV
            </button>
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-colors"
            >
              <Upload size={15} /> Tải lên
            </button>
          </div>
        </div>

        {/* Upload form */}
        <AnimatePresence>
          {showUpload && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-indigo-300 dark:border-indigo-700 p-6">
                <div className="flex items-center justify-center mb-5">
                  <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center">
                    <Upload size={28} className="text-indigo-500" />
                  </div>
                </div>
                {uploadSuccess ? (
                  <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-center">
                    <Check size={32} className="text-emerald-500 mx-auto mb-2" />
                    <p className="font-medium text-emerald-700">Tải lên thành công!</p>
                  </motion.div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 text-center mb-4">Hỗ trợ PDF, DOC, DOCX — tối đa 10MB</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={uploadName}
                        onChange={(e) => setUploadName(e.target.value)}
                        placeholder="Đặt tên cho CV..."
                        className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onKeyDown={(e) => e.key === "Enter" && handleUpload()}
                      />
                      <button
                        onClick={handleUpload}
                        disabled={uploading || !uploadName.trim()}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium text-sm rounded-xl transition-colors"
                      >
                        {uploading ? "..." : "Tải lên"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CV list */}
        {myCVs.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <FileText size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="font-medium text-slate-600 dark:text-slate-400 mb-2">Chưa có CV nào</p>
            <p className="text-sm text-slate-500 mb-6">Tải lên hoặc tạo CV tự động từ hồ sơ</p>
            <button onClick={() => setShowUpload(true)} className="px-4 py-2.5 bg-indigo-600 text-white font-medium text-sm rounded-xl hover:bg-indigo-700 transition-colors">
              Tải CV lên
            </button>
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
            {myCVs.map((cv) => {
              const appCount = appCountForCV(cv.id);
              return (
                <motion.div
                  key={cv.id}
                  variants={fadeUp}
                  whileHover={{ y: -1 }}
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <FileText size={22} className="text-red-500" />
                      </div>
                      <div>
                        {editingId === cv.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="px-2 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              autoFocus
                              onKeyDown={(e) => e.key === "Enter" && handleRename(cv.id)}
                            />
                            <button onClick={() => handleRename(cv.id)} className="p-1 text-indigo-600"><Check size={15} /></button>
                          </div>
                        ) : (
                          <p className="font-medium text-slate-800 dark:text-white">{cv.name}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {cv.isDefault && <Badge variant="success">Mặc định</Badge>}
                          <span className="text-xs text-slate-500">{appCount > 0 ? `${appCount} đơn ứng tuyển` : "Chưa dùng"}</span>
                          <span className="text-xs text-slate-400">• {cv.uploadedAt}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={cv.fileUrl} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors" title="Mở file">
                        <ExternalLink size={15} />
                      </a>
                      {!cv.isDefault && (
                        <button onClick={() => setDefaultCV(cv.id)} className="p-2 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-amber-50 transition-colors" title="Đặt làm mặc định">
                          <StarOff size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingId(cv.id); setEditName(cv.name); }}
                        className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => setDeleteId(cv.id)} className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteId}
        title="Xóa CV"
        message="Bạn có chắc muốn xóa CV này? Hành động này không thể hoàn tác."
        confirmLabel="Xóa CV"
        danger
        onConfirm={() => { if (deleteId) { deleteCV(deleteId); setDeleteId(null); } }}
        onCancel={() => setDeleteId(null)}
      />
    </AnimatedPage>
  );
}

import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Plus, Minus, FileDown, Check, ArrowLeft } from "lucide-react";
import { useApp } from "../context/AppContext";
import { PROFILE_ITEM_TYPE_LABELS, type ProfileItemType } from "../data/mockData";
import AnimatedPage from "../components/AnimatedPage";
import Badge from "../components/Badge";

const CV_TEMPLATES = [
  { id: "modern", name: "Hiện đại", preview: "from-indigo-100 to-purple-100" },
  { id: "classic", name: "Cổ điển", preview: "from-slate-100 to-slate-200" },
  { id: "minimal", name: "Tối giản", preview: "from-white to-slate-50" },
];

export default function CVBuilderPage() {
  const { currentUser, profileItems, uploadCV } = useApp();
  const navigate = useNavigate();

  const [selectedTemplate, setSelectedTemplate] = useState("modern");
  const [includedItems, setIncludedItems] = useState<string[]>([]);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [cvName, setCvName] = useState(`CV - ${new Date().toLocaleDateString("vi-VN")}`);
  const [exported, setExported] = useState(false);

  if (!currentUser) { navigate("/login"); return null; }

  const myItems = profileItems.filter((i) => i.userId === currentUser.id);

  const toggleItem = (id: string) => {
    setIncludedItems((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const includedItemData = myItems.filter((i) => includedItems.includes(i.id));

  const handleExport = async () => {
    uploadCV(cvName || `CV - ${new Date().toLocaleDateString("vi-VN")}`);
    setExported(true);
    setTimeout(() => { navigate("/cv-vault"); }, 1500);
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Trình dựng CV</h1>
            <p className="text-sm text-slate-500 mt-0.5">Chọn các dòng hồ sơ và tạo CV của bạn</p>
          </div>
          <button
            onClick={() => setShowExportDialog(true)}
            disabled={includedItems.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-colors shadow-lg shadow-indigo-200"
          >
            <FileDown size={16} /> Xuất CV
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Profile items bank */}
          <div>
            <h2 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-3 flex items-center gap-2">
              Kho dòng hồ sơ
              <Badge variant="muted">{myItems.length} dòng</Badge>
            </h2>

            {myItems.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                <p className="text-sm text-slate-500 mb-3">Chưa có dòng hồ sơ nào</p>
                <button onClick={() => navigate("/profile")} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700">
                  Thêm từ Hồ sơ
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {myItems.map((item) => {
                  const included = includedItems.includes(item.id);
                  return (
                    <motion.div
                      key={item.id}
                      whileHover={{ x: 2 }}
                      onClick={() => toggleItem(item.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${included ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-200"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={included ? "primary" : "muted"}>{PROFILE_ITEM_TYPE_LABELS[item.type]}</Badge>
                          </div>
                          <p className="text-sm font-medium text-slate-800 dark:text-white">{item.title}</p>
                          {item.content && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.content}</p>}
                        </div>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${included ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-400"}`}>
                          {included ? <Minus size={13} /> : <Plus size={13} />}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Template selector */}
            <div className="mt-6">
              <h2 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-3">Chọn mẫu CV</h2>
              <div className="flex gap-3">
                {CV_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`flex-1 p-3 rounded-xl border text-center transition-all ${selectedTemplate === t.id ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"}`}
                  >
                    <div className={`h-10 rounded-lg bg-gradient-to-br ${t.preview} mb-2`} />
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{t.name}</p>
                    {selectedTemplate === t.id && <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mx-auto mt-1" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: CV Preview */}
          <div>
            <h2 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-3 flex items-center gap-2">
              Xem trước CV
              <Badge variant="muted">{includedItemData.length} dòng</Badge>
            </h2>
            <div className={`bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden`}>
              {/* CV Header */}
              <div className={`p-6 bg-gradient-to-br ${selectedTemplate === "modern" ? "from-indigo-600 to-purple-700" : selectedTemplate === "classic" ? "from-slate-700 to-slate-900" : "from-slate-100 to-slate-200"}`}>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 overflow-hidden">
                    {currentUser.avatar ? (
                      <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white">{currentUser.name[0]}</div>
                    )}
                  </div>
                  <div>
                    <h2 className={`font-display text-xl font-bold ${selectedTemplate === "minimal" ? "text-slate-900" : "text-white"}`}>{currentUser.name}</h2>
                    <p className={`text-sm ${selectedTemplate === "minimal" ? "text-slate-600" : "text-white/80"}`}>{currentUser.email}</p>
                    {currentUser.phone && <p className={`text-sm ${selectedTemplate === "minimal" ? "text-slate-600" : "text-white/80"}`}>{currentUser.phone}</p>}
                  </div>
                </div>
              </div>

              {/* CV Content */}
              <div className="p-6">
                {includedItemData.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Chọn các dòng hồ sơ từ kho để thêm vào CV</p>
                ) : (
                  <div className="space-y-4">
                    {includedItemData.map((item) => (
                      <div key={item.id}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-1.5 h-4 rounded-full bg-indigo-500" />
                          <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">{PROFILE_ITEM_TYPE_LABELS[item.type]}</span>
                        </div>
                        <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                        {item.content && <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-line">{item.content}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !exported && setShowExportDialog(false)}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {exported ? (
              <div className="text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
                  <Check size={40} className="text-emerald-500 mx-auto mb-3" />
                </motion.div>
                <p className="font-semibold text-slate-800 dark:text-white">Xuất CV thành công!</p>
                <p className="text-sm text-slate-500 mt-1">Đang chuyển đến Tủ hồ sơ...</p>
              </div>
            ) : (
              <>
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white mb-4">Xuất CV</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tên file</label>
                  <input
                    type="text"
                    value={cvName}
                    onChange={(e) => setCvName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-xs text-slate-500 mb-4">CV sẽ được lưu vào Tủ hồ sơ/CV của bạn.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowExportDialog(false)} className="flex-1 py-2.5 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    Hủy
                  </button>
                  <button onClick={handleExport} className="flex-1 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors">
                    Xuất PDF
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatedPage>
  );
}

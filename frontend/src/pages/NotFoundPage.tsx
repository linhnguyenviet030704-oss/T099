import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, ArrowLeft } from "lucide-react";
import AnimatedPage from "../components/AnimatedPage";
import { useLang } from "../context/LangContext";

export default function NotFoundPage() {
  const { t } = useLang();

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <motion.div
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="text-9xl font-display font-black text-slate-100 dark:text-slate-800 leading-none mb-0"
        >
          404
        </motion.div>
        <div className="-mt-4 relative z-10">
          <div className="text-5xl mb-6">🔍</div>
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-3">
            {t.notFoundTitle}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed whitespace-pre-line">
            {t.notFoundDesc}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-200"
              >
                <Home size={16} /> {t.toHome}
              </Link>
            </motion.div>
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center gap-2 px-6 py-3 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:border-indigo-300 transition-colors"
            >
              <ArrowLeft size={16} /> {t.goBack}
            </button>
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}


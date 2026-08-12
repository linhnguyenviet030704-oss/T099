import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, ChevronLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-12 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 max-w-md w-full shadow-2xl space-y-6 relative overflow-hidden">
        
        {/* Glowing aura background highlight */}
        <div className="absolute top-0 left-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="space-y-3">
          <div className="w-14 h-14 bg-red-500/10 text-red-400 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <HelpCircle className="h-7 w-7 animate-bounce" />
          </div>
          <h2 className="text-3xl font-black text-slate-100 tracking-tight font-sans mt-2">Lỗi 404</h2>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">Đường dẫn không hợp lệ</p>
        </div>

        <p className="text-sm text-slate-400 leading-relaxed font-light font-sans">
          Trang yêu cầu truy cập không tồn tại hoặc đã được chuyển dịch hoặc sáp nhập sang một danh mục khác trong hệ thống của chúng tôi.
        </p>

        <div className="pt-2 select-none">
          <Link
            to="/"
            className="w-full inline-flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl text-xs transition shadow-lg shadow-emerald-500/10"
            id="notfound-back-to-home-btn"
          >
            <ChevronLeft className="h-4 w-4" />
            Quay lại trang chính
          </Link>
        </div>

      </div>
    </div>
  );
};

export default NotFoundPage;

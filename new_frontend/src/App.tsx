import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AppProvider } from "./context/AppContext";
import { LangProvider } from "./context/LangContext";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import JobListPage from "./pages/JobListPage";
import JobDetailPage from "./pages/JobDetailPage";
import ProfilePage from "./pages/ProfilePage";
import CVVaultPage from "./pages/CVVaultPage";
import CVBuilderPage from "./pages/CVBuilderPage";
import ApplicationsPage from "./pages/ApplicationsPage";
import AISuggestionsPage from "./pages/AISuggestionsPage";
import RecruiterRegisterPage from "./pages/RecruiterRegisterPage";
import RecruitmentDashboardPage from "./pages/RecruitmentDashboardPage";
import AICandidatePage from "./pages/AICandidatePage";
import AdminRecruiterPage from "./pages/AdminRecruiterPage";
import NotFoundPage from "./pages/NotFoundPage";

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/jobs" element={<JobListPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/cv-vault" element={<CVVaultPage />} />
        <Route path="/cv-builder" element={<CVBuilderPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/ai-suggestions" element={<AISuggestionsPage />} />
        <Route path="/recruiter-register" element={<RecruiterRegisterPage />} />
        <Route path="/dashboard" element={<RecruitmentDashboardPage />} />
        <Route path="/ai-candidates" element={<AICandidatePage />} />
        <Route path="/admin" element={<AdminRecruiterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <LangProvider>
    <AppProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-white dark:bg-slate-900 transition-colors">
          <Navbar />
          <AnimatedRoutes />
        </div>
      </BrowserRouter>
    </AppProvider>
    </LangProvider>
  );
}

import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "./context/AppContext";
import { LangProvider } from "./context/LangContext";
import { AuthProvider } from "./auth/AuthProvider";
import { ProfileProvider } from "./profile/ProfileProvider";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
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

import { ToastProvider } from "./context/ToastContext";

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/sign-in" element={<Navigate to="/login" replace />} />
        <Route path="/auth/sign-up" element={<Navigate to="/register" replace />} />
        <Route path="/jobs" element={<JobListPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cv-vault"
          element={
            <RoleRoute allowedRoles={["candidate"]}>
              <CVVaultPage />
            </RoleRoute>
          }
        />
        <Route path="/profile/resumes" element={<Navigate to="/cv-vault" replace />} />
        <Route
          path="/cv-builder"
          element={
            <RoleRoute allowedRoles={["candidate"]}>
              <CVBuilderPage />
            </RoleRoute>
          }
        />
        <Route
          path="/applications"
          element={
            <RoleRoute allowedRoles={["candidate"]}>
              <ApplicationsPage />
            </RoleRoute>
          }
        />
        <Route path="/my-applications" element={<Navigate to="/applications" replace />} />
        <Route
          path="/ai-suggestions"
          element={
            <RoleRoute allowedRoles={["candidate"]}>
              <AISuggestionsPage />
            </RoleRoute>
          }
        />
        <Route path="/match" element={<Navigate to="/ai-suggestions" replace />} />
        <Route path="/match_job" element={<Navigate to="/ai-suggestions" replace />} />
        <Route
          path="/recruiter-register"
          element={
            <RoleRoute allowedRoles={["candidate"]}>
              <RecruiterRegisterPage />
            </RoleRoute>
          }
        />
        <Route path="/recruiter/request" element={<Navigate to="/recruiter-register" replace />} />
        <Route
          path="/dashboard"
          element={
            <RoleRoute allowedRoles={["recruiter"]}>
              <RecruitmentDashboardPage />
            </RoleRoute>
          }
        />
        <Route path="/recruiter/jobs" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/ai-candidates"
          element={
            <RoleRoute allowedRoles={["recruiter"]}>
              <AICandidatePage />
            </RoleRoute>
          }
        />
        <Route path="/match_candidates" element={<Navigate to="/ai-candidates" replace />} />
        <Route
          path="/admin"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <AdminRecruiterPage />
            </RoleRoute>
          }
        />
        <Route path="/admin/recruiter-requests" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <LangProvider>
        <ThemeProvider>
          <AuthProvider>
            <ProfileProvider>
              <BrowserRouter>
                <div className="min-h-screen bg-white dark:bg-slate-900 transition-colors">
                  <Navbar />
                  <AnimatedRoutes />
                </div>
              </BrowserRouter>
            </ProfileProvider>
          </AuthProvider>
        </ThemeProvider>
      </LangProvider>
      <Analytics />
    </ToastProvider>
  );
}

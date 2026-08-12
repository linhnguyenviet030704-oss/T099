import React from 'react';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { ProfileProvider } from './profile/ProfileProvider';
import { AppShell } from './components/AppShell';

// Component imports
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';
import ResumesPage from './pages/ResumesPage';
import JobsPage from './pages/JobsPage';
import JobDetailPage from './pages/JobDetailPage';
import MyApplicationsPage from './pages/MyApplicationsPage';
import RecruiterRequestPage from './pages/RecruiterRequestPage';
import RecruiterJobsPage from './pages/RecruiterJobsPage';
import AdminRecruiterRequestsPage from './pages/AdminRecruiterRequestsPage';
import NotFoundPage from './pages/NotFoundPage';

import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileProvider>
          <AppShell>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/auth/sign-in" element={<AuthPage mode="sign-in" />} />
              <Route path="/auth/sign-up" element={<AuthPage mode="sign-up" />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/jobs/:jobId" element={<JobDetailPage />} />

              {/* Protected Candidate Routes */}
              <Route 
                path="/profile" 
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/profile/resumes" 
                element={
                  <ProtectedRoute>
                    <ResumesPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/my-applications" 
                element={
                  <ProtectedRoute>
                    <MyApplicationsPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/recruiter/request" 
                element={
                  <ProtectedRoute>
                    <RecruiterRequestPage />
                  </ProtectedRoute>
                } 
              />

              {/* Recruiter Authorized Routes */}
              <Route 
                path="/recruiter/jobs" 
                element={
                  <ProtectedRoute>
                    <RoleRoute allowedRoles={['recruiter', 'admin']}>
                      <RecruiterJobsPage />
                    </RoleRoute>
                  </ProtectedRoute>
                } 
              />

              {/* Admin Highly Privileged Auth Route */}
              <Route 
                path="/admin/recruiter-requests" 
                element={
                  <ProtectedRoute>
                    <RoleRoute allowedRoles={['admin']}>
                      <AdminRecruiterRequestsPage />
                    </RoleRoute>
                  </ProtectedRoute>
                } 
              />

              {/* 404 Fallback Route */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppShell>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

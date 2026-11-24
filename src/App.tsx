/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PortalLanding } from './components/PortalLanding';
import { StudentAuthView } from './components/StudentAuthView';
import { AdminAuthView } from './components/AdminAuthView';
import { StudentFeature, StudentShell, StudentTab } from './components/student/StudentShell';
import { useStudentNotifications } from './hooks/useStudentNotifications';
import { StudentDashboard } from './components/student/StudentDashboard';
import { StudentCoursesView } from './components/student/StudentCoursesView';
import { StudentProfileView } from './components/student/StudentProfileView';
import { StudentLiveClassPage } from './components/student/StudentLiveClassPage';
import { StudentFeesPage } from './components/student/StudentFeesPage';
import { StudentMaterialsPage } from './components/student/StudentMaterialsPage';
import { StudentAssessmentsPage } from './components/student/StudentAssessmentsPage';
import { StudentChatPage } from './components/student/StudentChatPage';
import { StudentHelpPage } from './components/student/StudentHelpPage';
import { AdminSection, AdminShell } from './components/admin/AdminShell';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminStudentsPage } from './components/admin/AdminStudentsPage';
import { AdminTeachersPage } from './components/admin/AdminTeachersPage';
import { AdminClassesSubjectsPage } from './components/admin/AdminClassesSubjectsPage';
import { AdminExaminationsPage } from './components/admin/AdminExaminationsPage';
import { AdminFeesPage } from './components/admin/AdminFeesPage';
import { AdminReportsPage } from './components/admin/AdminReportsPage';
import { AdminSettingsPage } from './components/admin/AdminSettingsPage';

const PlatformRouter: React.FC = () => {
  const { authReady, loadingProfile, role, portalIntent, setPortalIntent } = useAuth();
  const [studentTab, setStudentTab] = useState<StudentTab>('home');
  const [studentFeature, setStudentFeature] = useState<StudentFeature>(null);
  const [adminSection, setAdminSection] = useState<AdminSection>('overview');
  const {
    notifications,
    unreadCount,
    unreadByFeature,
    seenIds,
    markAsRead,
    markFeatureRead,
    markAllRead,
    browserPermission,
    supportsBrowserNotifications,
    requestBrowserPermission,
  } = useStudentNotifications();

  if (!authReady || loadingProfile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-6">
        <Loader2 className="h-8 w-8 animate-spin text-accent-sky" />
        <p className="mt-3 text-sm font-medium text-muted">Loading BRIAN ACADEMY UG...</p>
      </div>
    );
  }

  // 1. Authenticated Student Portal
  if (role === 'student') {
    return (
      <StudentShell
        activeTab={studentTab}
        activeFeature={studentFeature}
        onSelectTab={setStudentTab}
        onSelectFeature={setStudentFeature}
        notifications={notifications}
        unreadCount={unreadCount}
        seenIds={seenIds}
        onMarkRead={markAsRead}
        onMarkFeatureRead={markFeatureRead}
        onMarkAllRead={markAllRead}
        browserPermission={browserPermission}
        supportsBrowserNotifications={supportsBrowserNotifications}
        onRequestBrowserPermission={requestBrowserPermission}
      >
        {studentFeature === 'live-class' ? (
          <StudentLiveClassPage
            onBack={() => setStudentFeature(null)}
            onOpenFees={() => setStudentFeature('fees')}
          />
        ) : studentFeature === 'fees' ? (
          <StudentFeesPage onBack={() => setStudentFeature(null)} />
        ) : studentFeature === 'study-material' ? (
          <StudentMaterialsPage onBack={() => setStudentFeature(null)} />
        ) : studentFeature === 'test' ? (
          <StudentAssessmentsPage kind="test" onBack={() => setStudentFeature(null)} />
        ) : studentFeature === 'homework' ? (
          <StudentAssessmentsPage kind="homework" onBack={() => setStudentFeature(null)} />
        ) : studentFeature === 'chat' ? (
          <StudentChatPage
            onBack={() => setStudentFeature(null)}
            onOpenFees={() => setStudentFeature('fees')}
          />
        ) : studentFeature === 'help' ? (
          <StudentHelpPage onBack={() => setStudentFeature(null)} />
        ) : studentTab === 'courses' ? (
          <StudentCoursesView onOpenFeature={(f) => setStudentFeature(f)} />
        ) : studentTab === 'profile' ? (
          <StudentProfileView />
        ) : (
          <StudentDashboard
            onOpenFeature={(f) => setStudentFeature(f)}
            unreadCounts={unreadByFeature}
          />
        )}
      </StudentShell>
    );
  }

  // 2. Authenticated Administrator / Teacher Portal
  if (role === 'admin' || role === 'teacher') {
    const isAdmin = role === 'admin';
    return (
      <AdminShell activeSection={adminSection} onSelectSection={setAdminSection}>
        {adminSection === 'students' && isAdmin ? (
          <AdminStudentsPage />
        ) : adminSection === 'teachers' && isAdmin ? (
          <AdminTeachersPage />
        ) : adminSection === 'classes' ? (
          <AdminClassesSubjectsPage />
        ) : adminSection === 'examinations' ? (
          <AdminExaminationsPage />
        ) : adminSection === 'fees' && isAdmin ? (
          <AdminFeesPage />
        ) : adminSection === 'reports' ? (
          <AdminReportsPage />
        ) : adminSection === 'settings' && isAdmin ? (
          <AdminSettingsPage />
        ) : (
          <AdminDashboard onSelectSection={setAdminSection} />
        )}
      </AdminShell>
    );
  }

  // 3. Unauthenticated Portal Entry Views
  if (portalIntent === 'student') {
    return <StudentAuthView />;
  }
  if (portalIntent === 'admin') {
    return <AdminAuthView />;
  }

  return <PortalLanding onSelectPortal={setPortalIntent} />;
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <PlatformRouter />
          <OfflineIndicator />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

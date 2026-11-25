/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SplashScreen } from './components/SplashScreen';
import { PortalLanding } from './components/PortalLanding';
import { StudentAuthView } from './components/StudentAuthView';
import { AdminAuthView } from './components/AdminAuthView';
import { StudentFeature, StudentShell, StudentTab } from './components/student/StudentShell';
import { useStudentNotifications } from './hooks/useStudentNotifications';
import { useStaffNotifications } from './hooks/useStaffNotifications';
import { usePublicNotifications } from './hooks/usePublicNotifications';
import { PublicNotificationPopout } from './components/PublicNotificationPopout';
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
import { AdminMonitoringPage } from './components/admin/AdminMonitoringPage';
import { AdminReportsPage } from './components/admin/AdminReportsPage';
import { AdminSettingsPage } from './components/admin/AdminSettingsPage';

const PlatformRouter: React.FC = () => {
  const { authReady, loadingProfile, role, portalIntent, setPortalIntent } = useAuth();
  const [studentTab, setStudentTab] = useState<StudentTab>('home');
  const [studentFeature, setStudentFeature] = useState<StudentFeature>(null);
  const [adminSection, setAdminSection] = useState<AdminSection>('overview');
  const [reportsTabOverride, setReportsTabOverride] = useState<'reports' | 'chat' | undefined>(
    undefined
  );
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const [splashDismissed, setSplashDismissed] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMinSplashElapsed(true), 850);
    return () => window.clearTimeout(t);
  }, []);

  const isLoading = !authReady || loadingProfile || !minSplashElapsed;

  useEffect(() => {
    if (!isLoading) {
      const fade = window.setTimeout(() => setSplashDismissed(true), 450);
      return () => window.clearTimeout(fade);
    }
  }, [isLoading]);

  const {
    notifications,
    unreadCount,
    unreadByFeature,
    seenIds,
    latestAlert,
    dismissLatestAlert,
    markAsRead,
    markFeatureRead,
    markAllRead,
    browserPermission,
    supportsBrowserNotifications,
    requestBrowserPermission,
  } = useStudentNotifications();

  const staffNotifications = useStaffNotifications();
  const isUnauthenticated = authReady && !loadingProfile && role === 'none';
  const publicNotifications = usePublicNotifications(isUnauthenticated);

  const handleSelectAdminSection = (section: AdminSection, openChatTab?: boolean) => {
    setAdminSection(section);
    if (section === 'reports') {
      setReportsTabOverride(openChatTab ? 'chat' : undefined);
    } else {
      setReportsTabOverride(undefined);
    }
  };

  const renderView = () => {
    if (!authReady || loadingProfile) {
      return null;
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
          latestAlert={latestAlert}
          onDismissLatestAlert={dismissLatestAlert}
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
        <AdminShell
          activeSection={adminSection}
          onSelectSection={handleSelectAdminSection}
          notifications={staffNotifications.notifications}
          unreadCount={staffNotifications.unreadCount}
          seenIds={staffNotifications.seenIds}
          latestAlert={staffNotifications.latestAlert}
          onDismissLatestAlert={staffNotifications.dismissLatestAlert}
          onMarkRead={staffNotifications.markAsRead}
          onMarkAllRead={staffNotifications.markAllRead}
          browserPermission={staffNotifications.browserPermission}
          supportsBrowserNotifications={staffNotifications.supportsBrowserNotifications}
          onRequestBrowserPermission={staffNotifications.requestBrowserPermission}
        >
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
          ) : adminSection === 'monitoring' && isAdmin ? (
            <AdminMonitoringPage />
          ) : adminSection === 'reports' ? (
            <AdminReportsPage initialTab={reportsTabOverride} />
          ) : adminSection === 'settings' && isAdmin ? (
            <AdminSettingsPage />
          ) : (
            <AdminDashboard onSelectSection={(s) => handleSelectAdminSection(s)} />
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

    return (
      <PortalLanding
        onSelectPortal={setPortalIntent}
        publicAlerts={{
          notifications: publicNotifications.notifications,
          unreadCount: publicNotifications.unreadCount,
          seenIds: publicNotifications.seenIds,
          onMarkRead: publicNotifications.markAsRead,
          onMarkAllRead: publicNotifications.markAllRead,
          browserPermission: publicNotifications.browserPermission,
          supportsBrowserNotifications: publicNotifications.supportsBrowserNotifications,
          onRequestBrowserPermission: publicNotifications.requestBrowserPermission,
        }}
      />
    );
  };

  return (
    <>
      {renderView()}
      {isUnauthenticated && (
        <PublicNotificationPopout
          alert={publicNotifications.latestPopout}
          onDismiss={publicNotifications.dismissLatestPopout}
          onSignInStudent={() => setPortalIntent('student')}
          browserPermission={publicNotifications.browserPermission}
          supportsBrowserNotifications={publicNotifications.supportsBrowserNotifications}
          onRequestBrowserPermission={publicNotifications.requestBrowserPermission}
        />
      )}
      {!splashDismissed && <SplashScreen fadingOut={!isLoading} />}
    </>
  );
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

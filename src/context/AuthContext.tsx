import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  OWNER_ADMIN_EMAIL,
} from '../lib/firebase';
import {
  AcademicSettings,
  AdminProfile,
  CLASS_LEVELS,
  ClassLevel,
  DEFAULT_FEE_STRUCTURE,
  DEFAULT_UNEB_O_LEVEL_BANDS,
  StudentProfile,
  SUBJECTS,
  SubjectCode,
  TeacherProfile,
} from '../types/academy';
import { sanitizeString } from '../lib/validation';
import { logPlatformActivity } from '../lib/activity';

export type PortalIntent = 'landing' | 'student' | 'admin';
export type UserRole = 'none' | 'student' | 'teacher' | 'admin';

interface StudentRegistrationPayload {
  fullName: string;
  email: string;
  password: string;
  classLevel: ClassLevel;
  studentNumber?: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  loadingProfile: boolean;
  portalIntent: PortalIntent;
  setPortalIntent: (intent: PortalIntent) => void;
  role: UserRole;
  studentProfile: StudentProfile | null;
  teacherProfile: TeacherProfile | null;
  adminProfile: AdminProfile | null;
  academicSettings: AcademicSettings;
  needsStudentOnboarding: boolean;
  authError: string | null;
  clearAuthError: () => void;
  registerStudentWithEmail: (payload: StudentRegistrationPayload) => Promise<void>;
  loginWithEmail: (email: string, password: string, portal: 'student' | 'admin') => Promise<void>;
  loginWithGoogle: (portal: 'student' | 'admin') => Promise<void>;
  completeStudentOnboarding: (payload: {
    fullName: string;
    classLevel: ClassLevel;
    studentNumber?: string;
  }) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshVerification: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const DEFAULT_SETTINGS: AcademicSettings = {
  termName: 'Term One',
  academicYear: '2026',
  passMark: 50,
  gradingSystem: 'UNEB_O_LEVEL',
  gradeBands: DEFAULT_UNEB_O_LEVEL_BANDS,
  schoolMotto: 'Excellence in Science, Mathematics & Character',
  supportPhone: '0753336009',
  supportEmail: 'admissions@brianacademyug.org',
  feeStructure: DEFAULT_FEE_STRUCTURE,
  muteUnpaid: false,
  updatedBy: 'system',
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const msg = (error as { message?: string })?.message || 'Authentication failed.';
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication -> Sign-in method -> Email/Password). Please enable it in Firebase Console or use Google Sign-In.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email address or password. Please check your credentials and try again.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters long.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Sign-in window was closed before completing authentication.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return msg;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [portalIntent, setPortalIntentState] = useState<PortalIntent>(() => {
    const saved = sessionStorage.getItem('baug_portal_intent');
    return saved === 'student' || saved === 'admin' ? saved : 'landing';
  });
  const [role, setRole] = useState<UserRole>('none');
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [academicSettings, setAcademicSettings] = useState<AcademicSettings>(DEFAULT_SETTINGS);
  const [needsStudentOnboarding, setNeedsStudentOnboarding] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const setPortalIntent = useCallback((intent: PortalIntent) => {
    setPortalIntentState(intent);
    sessionStorage.setItem('baug_portal_intent', intent);
    setAuthError(null);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const seedInitialPlatformData = useCallback(async (adminUid: string, adminName: string) => {
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'academic'));
      if (!settingsSnap.exists()) {
        await setDoc(doc(db, 'settings', 'academic'), {
          ...DEFAULT_SETTINGS,
          updatedBy: adminUid,
          updatedAt: serverTimestamp(),
        });
      }
      const coursesSnap = await getDocs(collection(db, 'courses'));
      if (coursesSnap.empty) {
        const defaultTopics: Record<SubjectCode, string[]> = {
          MTC: ['Algebra & Quadratic Equations', 'Coordinate Geometry', 'Trigonometry & Vectors', 'Calculus Foundations'],
          Physics: ['Mechanics & Motion', 'Waves & Geometric Optics', 'Current Electricity', 'Thermal Physics'],
          Chemistry: ['Atomic Structure & Bonding', 'Stoichiometry & Mole Concept', 'Acids, Bases & Salts', 'Organic Chemistry'],
          Biology: ['Cell Structure & Microscopy', 'Nutrition & Transport', 'Genetics & Inheritance', 'Ecology & Ecosystems'],
        };
        for (const cls of CLASS_LEVELS) {
          for (const subj of SUBJECTS) {
            const id = `course_${cls.code}_${subj.code}`;
            await setDoc(doc(db, 'courses', id), {
              id,
              classLevel: cls.code,
              subject: subj.code,
              title: `${cls.label} — ${subj.name}`,
              description: `${subj.shortDesc} tailored for the Ugandan ${cls.levelGroup} syllabus.`,
              teacherId: adminUid,
              teacherName: adminName,
              topics: defaultTopics[subj.code],
              active: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    } catch (err) {
      console.error('Initial platform seeding skipped or failed:', err);
    }
  }, []);

  const resolveUserProfile = useCallback(
    async (user: User, intentOverride?: PortalIntent) => {
      setLoadingProfile(true);
      setAuthError(null);
      const effectiveIntent = intentOverride || portalIntent;
      const emailLower = (user.email || '').toLowerCase();

      try {
        if (!user.emailVerified) {
          setRole('none');
          setStudentProfile(null);
          setTeacherProfile(null);
          setAdminProfile(null);
          setNeedsStudentOnboarding(false);
          setLoadingProfile(false);
          return;
        }

        // 1. Check Admin record
        const adminRef = doc(db, 'admins', user.uid);
        let adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists() && emailLower === OWNER_ADMIN_EMAIL.toLowerCase()) {
          const ownerDoc: AdminProfile = {
            uid: user.uid,
            email: emailLower,
            fullName: sanitizeString(user.displayName || 'Brian Wamusi', 120),
            role: 'owner',
            active: true,
          };
          await setDoc(adminRef, {
            ...ownerDoc,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await seedInitialPlatformData(user.uid, ownerDoc.fullName);
          adminSnap = await getDoc(adminRef);
        } else if (!adminSnap.exists() && effectiveIntent === 'admin' && emailLower) {
          const inviteSnap = await getDoc(doc(db, 'adminInvites', emailLower));
          if (inviteSnap.exists() && inviteSnap.data().active === true) {
            const inviteData = inviteSnap.data();
            await setDoc(adminRef, {
              uid: user.uid,
              email: emailLower,
              fullName: sanitizeString(inviteData.fullName || user.displayName || 'Administrator', 120),
              role: 'admin',
              active: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            adminSnap = await getDoc(adminRef);
          }
        }

        if (adminSnap.exists() && adminSnap.data().active === true) {
          const adm = adminSnap.data() as AdminProfile;
          if (effectiveIntent === 'student') {
            setAuthError(
              'This account holds Administrator privileges. Please sign in through the Administrator Login Portal.'
            );
            setRole('none');
            setAdminProfile(null);
            setLoadingProfile(false);
            return;
          }
          setAdminProfile(adm);
          setTeacherProfile(null);
          setStudentProfile(null);
          setRole('admin');
          setNeedsStudentOnboarding(false);
          if (effectiveIntent === 'landing') {
            setPortalIntent('admin');
          }
          setLoadingProfile(false);
          return;
        }

        // 2. Check Teacher record
        const teacherRef = doc(db, 'teachers', user.uid);
        let teacherSnap = await getDoc(teacherRef);

        if (!teacherSnap.exists() && effectiveIntent === 'admin' && emailLower) {
          const tInviteSnap = await getDoc(doc(db, 'teacherInvites', emailLower));
          if (tInviteSnap.exists() && tInviteSnap.data().active === true) {
            const inv = tInviteSnap.data();
            await setDoc(teacherRef, {
              uid: user.uid,
              email: emailLower,
              fullName: sanitizeString(inv.fullName || user.displayName || 'Teacher', 120),
              staffNumber: sanitizeString(inv.staffNumber || 'TCH-UG', 40),
              classes: inv.classes || [],
              subjects: inv.subjects || [],
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            teacherSnap = await getDoc(teacherRef);
          }
        }

        if (teacherSnap.exists()) {
          const tch = teacherSnap.data() as TeacherProfile;
          if (tch.status !== 'active') {
            setAuthError('Your teacher account has been suspended by the Administrator.');
            setRole('none');
            setLoadingProfile(false);
            return;
          }
          if (effectiveIntent === 'student') {
            setAuthError('This account is registered as a Teacher. Please use the Staff / Administrator Portal.');
            setRole('none');
            setLoadingProfile(false);
            return;
          }
          setTeacherProfile(tch);
          setAdminProfile(null);
          setStudentProfile(null);
          setRole('teacher');
          setNeedsStudentOnboarding(false);
          if (effectiveIntent === 'landing') {
            setPortalIntent('admin');
          }
          setLoadingProfile(false);
          return;
        }

        // 3. Check Student record
        const studentRef = doc(db, 'students', user.uid);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
          const stu = studentSnap.data() as StudentProfile;
          if (effectiveIntent === 'admin') {
            setAuthError(
              'Access denied: Student accounts cannot access the Administrator Portal. Please use the Student Login Portal.'
            );
            setRole('none');
            setStudentProfile(null);
            setLoadingProfile(false);
            return;
          }
          setStudentProfile(stu);
          setAdminProfile(null);
          setTeacherProfile(null);
          setRole('student');
          setNeedsStudentOnboarding(false);
          if (effectiveIntent === 'landing') {
            setPortalIntent('student');
          }
          setLoadingProfile(false);
          return;
        }

        // 4. Authenticated user with no profile yet
        if (effectiveIntent === 'admin') {
          setAuthError(
            'This account is not authorized as an Administrator or Teacher. Contact the platform owner to authorize your email.'
          );
          setRole('none');
          setNeedsStudentOnboarding(false);
        } else {
          setRole('none');
          setNeedsStudentOnboarding(true);
        }
      } catch (err) {
        console.error('Error resolving user profile:', err);
        setAuthError('Unable to verify account profile. Please try again.');
      } finally {
        setLoadingProfile(false);
      }
    },
    [portalIntent, seedInitialPlatformData, setPortalIntent]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        void resolveUserProfile(user);
      } else {
        setRole('none');
        setStudentProfile(null);
        setTeacherProfile(null);
        setAdminProfile(null);
        setNeedsStudentOnboarding(false);
      }
    });
    return () => unsub();
  }, [resolveUserProfile]);

  // Listen to academic settings and live student profile updates when signed in
  useEffect(() => {
    if (!firebaseUser) return;
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'academic'),
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as Partial<AcademicSettings>;
          setAcademicSettings({
            ...DEFAULT_SETTINGS,
            ...raw,
            supportPhone:
              !raw.supportPhone || raw.supportPhone === '+256 700 000 100'
                ? '0753336009'
                : raw.supportPhone,
          });
        }
      },
      (err) => {
        console.warn('Settings listener warning:', err.message);
      }
    );

    let unsubStudent: (() => void) | undefined;
    if (role === 'student') {
      unsubStudent = onSnapshot(
        doc(db, 'students', firebaseUser.uid),
        (snap) => {
          if (snap.exists()) {
            setStudentProfile(snap.data() as StudentProfile);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `students/${firebaseUser.uid}`)
      );
    }

    return () => {
      unsubSettings();
      if (unsubStudent) unsubStudent();
    };
  }, [firebaseUser, role]);

  const registerStudentWithEmail = useCallback(
    async ({ fullName, email, password, classLevel, studentNumber }: StudentRegistrationPayload) => {
      setAuthError(null);
      setPortalIntent('student');
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: sanitizeString(fullName, 120) });
        // Store pending registration profile details temporarily in sessionStorage until email verified
        sessionStorage.setItem(
          'baug_pending_student_reg',
          JSON.stringify({
            fullName: sanitizeString(fullName, 120),
            classLevel,
            studentNumber: sanitizeString(studentNumber || '', 40),
          })
        );
        try {
          await sendEmailVerification(cred.user);
        } catch (verErr) {
          console.warn('Verification email send warning:', verErr);
        }
        await resolveUserProfile(cred.user, 'student');
      } catch (err) {
        const message = mapFirebaseAuthError(err);
        setAuthError(message);
        throw new Error(message);
      }
    },
    [resolveUserProfile, setPortalIntent]
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string, portal: 'student' | 'admin') => {
      setAuthError(null);
      setPortalIntent(portal);
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        await resolveUserProfile(cred.user, portal);
      } catch (err) {
        const message = mapFirebaseAuthError(err);
        setAuthError(message);
        throw new Error(message);
      }
    },
    [resolveUserProfile, setPortalIntent]
  );

  const loginWithGoogle = useCallback(
    async (portal: 'student' | 'admin') => {
      setAuthError(null);
      setPortalIntent(portal);
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        await resolveUserProfile(cred.user, portal);
      } catch (err) {
        const message = mapFirebaseAuthError(err);
        setAuthError(message);
        throw new Error(message);
      }
    },
    [resolveUserProfile, setPortalIntent]
  );

  const completeStudentOnboarding = useCallback(
    async ({
      fullName,
      classLevel,
      studentNumber,
    }: {
      fullName: string;
      classLevel: ClassLevel;
      studentNumber?: string;
    }) => {
      if (!firebaseUser) return;
      setAuthError(null);
      const cleanName = sanitizeString(fullName, 120);
      const cleanNumber = sanitizeString(studentNumber || '', 40);
      const email = sanitizeString(firebaseUser.email || '', 200).toLowerCase();
      const payload = {
        uid: firebaseUser.uid,
        fullName: cleanName,
        email,
        classLevel,
        studentNumber: cleanNumber,
        subjects: ['MTC', 'Physics', 'Chemistry', 'Biology'] as SubjectCode[],
        status: 'pending' as const,
        role: 'student' as const,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(doc(db, 'students', firebaseUser.uid), payload);
        sessionStorage.removeItem('baug_pending_student_reg');
        await logPlatformActivity({
          actorId: firebaseUser.uid,
          actorName: cleanName,
          actorRole: 'student',
          action: 'Student Registered',
          details: `${cleanName} registered in ${classLevel}`,
        });
        await resolveUserProfile(firebaseUser, 'student');
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `students/${firebaseUser.uid}`);
      }
    },
    [firebaseUser, resolveUserProfile]
  );

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    }
  }, []);

  const refreshVerification = useCallback(async () => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    const updated = auth.currentUser;
    setFirebaseUser(updated);
    if (updated.emailVerified) {
      // Auto-complete registration if saved in sessionStorage
      const pendingRaw = sessionStorage.getItem('baug_pending_student_reg');
      if (pendingRaw && portalIntent === 'student') {
        try {
          const parsed = JSON.parse(pendingRaw) as {
            fullName: string;
            classLevel: ClassLevel;
            studentNumber: string;
          };
          const existingSnap = await getDoc(doc(db, 'students', updated.uid));
          if (!existingSnap.exists()) {
            await setDoc(doc(db, 'students', updated.uid), {
              uid: updated.uid,
              fullName: sanitizeString(parsed.fullName, 120),
              email: sanitizeString(updated.email || '', 200).toLowerCase(),
              classLevel: parsed.classLevel,
              studentNumber: sanitizeString(parsed.studentNumber, 40),
              subjects: ['MTC', 'Physics', 'Chemistry', 'Biology'],
              status: 'pending',
              role: 'student',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            sessionStorage.removeItem('baug_pending_student_reg');
          }
        } catch (err) {
          console.error('Auto-complete pending registration failed:', err);
        }
      }
      await resolveUserProfile(updated);
      return true;
    }
    return false;
  }, [portalIntent, resolveUserProfile]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setRole('none');
    setStudentProfile(null);
    setTeacherProfile(null);
    setAdminProfile(null);
    setNeedsStudentOnboarding(false);
    setAuthError(null);
    setPortalIntent('landing');
  }, [setPortalIntent]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        loadingProfile,
        portalIntent,
        setPortalIntent,
        role,
        studentProfile,
        teacherProfile,
        adminProfile,
        academicSettings,
        needsStudentOnboarding,
        authError,
        clearAuthError,
        registerStudentWithEmail,
        loginWithEmail,
        loginWithGoogle,
        completeStudentOnboarding,
        resendVerification,
        refreshVerification,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

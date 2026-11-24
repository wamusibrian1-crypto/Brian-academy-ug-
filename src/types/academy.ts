export type ClassLevel = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
export type SubjectCode = 'MTC' | 'Physics' | 'Chemistry' | 'Biology';
export type MaterialType = 'pdf' | 'document' | 'image' | 'presentation' | 'revision' | 'video';
export type AssessmentKind = 'test' | 'homework';
export type GradingSystemType = 'UNEB_O_LEVEL' | 'UNEB_A_LEVEL' | 'CUSTOM';

export const CLASS_LEVELS: { code: ClassLevel; label: string; levelGroup: 'O-Level' | 'A-Level' }[] = [
  { code: 'S1', label: 'Senior One (S1)', levelGroup: 'O-Level' },
  { code: 'S2', label: 'Senior Two (S2)', levelGroup: 'O-Level' },
  { code: 'S3', label: 'Senior Three (S3)', levelGroup: 'O-Level' },
  { code: 'S4', label: 'Senior Four (S4)', levelGroup: 'O-Level' },
  { code: 'S5', label: 'Senior Five (S5)', levelGroup: 'A-Level' },
  { code: 'S6', label: 'Senior Six (S6)', levelGroup: 'A-Level' },
];

export const SUBJECTS: { code: SubjectCode; name: string; shortDesc: string }[] = [
  { code: 'MTC', name: 'Mathematics (MTC)', shortDesc: 'Algebra, Geometry, Calculus & Applied Mechanics' },
  { code: 'Physics', name: 'Physics', shortDesc: 'Mechanics, Waves, Optics, Electricity & Modern Physics' },
  { code: 'Chemistry', name: 'Chemistry', shortDesc: 'Physical, Inorganic & Organic Chemistry' },
  { code: 'Biology', name: 'Biology', shortDesc: 'Cell Biology, Physiology, Genetics & Ecology' },
];

export const MATERIAL_TYPES: { value: MaterialType; label: string }[] = [
  { value: 'pdf', label: 'PDF Notes' },
  { value: 'document', label: 'Document' },
  { value: 'image', label: 'Image / Diagram' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'revision', label: 'Revision Material' },
  { value: 'video', label: 'Video Lesson' },
];

export interface GradeBand {
  grade: string;
  minScore: number;
  maxScore: number;
  points: number;
  label: string;
}

export const DEFAULT_UNEB_O_LEVEL_BANDS: GradeBand[] = [
  { grade: 'D1', minScore: 80, maxScore: 100, points: 1, label: 'Distinction 1' },
  { grade: 'D2', minScore: 70, maxScore: 79, points: 2, label: 'Distinction 2' },
  { grade: 'C3', minScore: 65, maxScore: 69, points: 3, label: 'Credit 3' },
  { grade: 'C4', minScore: 60, maxScore: 64, points: 4, label: 'Credit 4' },
  { grade: 'C5', minScore: 55, maxScore: 59, points: 5, label: 'Credit 5' },
  { grade: 'C6', minScore: 50, maxScore: 54, points: 6, label: 'Credit 6' },
  { grade: 'P7', minScore: 45, maxScore: 49, points: 7, label: 'Pass 7' },
  { grade: 'P8', minScore: 40, maxScore: 44, points: 8, label: 'Pass 8' },
  { grade: 'F9', minScore: 0, maxScore: 39, points: 9, label: 'Fail 9' },
];

export const DEFAULT_UNEB_A_LEVEL_BANDS: GradeBand[] = [
  { grade: 'A', minScore: 80, maxScore: 100, points: 6, label: 'Principal Pass A' },
  { grade: 'B', minScore: 70, maxScore: 79, points: 5, label: 'Principal Pass B' },
  { grade: 'C', minScore: 60, maxScore: 69, points: 4, label: 'Principal Pass C' },
  { grade: 'D', minScore: 50, maxScore: 59, points: 3, label: 'Principal Pass D' },
  { grade: 'E', minScore: 40, maxScore: 49, points: 2, label: 'Principal Pass E' },
  { grade: 'O', minScore: 35, maxScore: 39, points: 1, label: 'Subsidiary Pass O' },
  { grade: 'F', minScore: 0, maxScore: 34, points: 0, label: 'Fail F' },
];

export const DEFAULT_FEE_STRUCTURE: Record<ClassLevel, number> = {
  S1: 450000,
  S2: 450000,
  S3: 520000,
  S4: 580000,
  S5: 620000,
  S6: 680000,
};

export interface AdminProfile {
  uid: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin';
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminInvite {
  email: string;
  fullName: string;
  active: boolean;
  createdBy: string;
  createdAt?: unknown;
}

export interface TeacherInvite {
  email: string;
  fullName: string;
  staffNumber: string;
  classes: ClassLevel[];
  subjects: SubjectCode[];
  active: boolean;
  createdBy: string;
  createdAt?: unknown;
}

export interface TeacherProfile {
  uid: string;
  email: string;
  fullName: string;
  staffNumber: string;
  classes: ClassLevel[];
  subjects: SubjectCode[];
  status: 'active' | 'suspended';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentProfile {
  uid: string;
  fullName: string;
  email: string;
  classLevel: ClassLevel;
  studentNumber: string;
  subjects: SubjectCode[];
  status: 'pending' | 'approved' | 'suspended';
  role: 'student';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AcademicSettings {
  termName: string;
  academicYear: string;
  passMark: number;
  gradingSystem: GradingSystemType;
  gradeBands: GradeBand[];
  schoolMotto: string;
  supportPhone: string;
  supportEmail: string;
  feeStructure: Record<ClassLevel, number>;
  muteUnpaid?: boolean;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface Course {
  id: string;
  classLevel: ClassLevel;
  subject: SubjectCode;
  title: string;
  description: string;
  teacherId: string;
  teacherName: string;
  topics: string[];
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LiveClass {
  id: string;
  title: string;
  classLevel: ClassLevel;
  subject: SubjectCode;
  teacherId: string;
  teacherName: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string;
  sharedNotes: string;
  attachedMaterialTitle: string;
  attachedMaterialUrl: string;
  status: 'scheduled' | 'live' | 'ended';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LiveAttendance {
  studentUid: string;
  studentName: string;
  studentNumber: string;
  classLevel: ClassLevel;
  joinedAt?: unknown;
}

export interface StudyMaterial {
  id: string;
  title: string;
  description: string;
  classLevel: ClassLevel;
  subject: SubjectCode;
  materialType: MaterialType;
  fileUrl: string;
  inlineContent: string;
  fileName: string;
  uploadedBy: string;
  uploaderName: string;
  published: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AssessmentQuestion {
  id: string;
  type: 'mcq' | 'structured';
  prompt: string;
  marks: number;
  options: string[];
}

export interface Assessment {
  id: string;
  kind: AssessmentKind;
  title: string;
  instructions: string;
  classLevel: ClassLevel;
  subject: SubjectCode;
  durationMinutes: number;
  totalMarks: number;
  dueDate: string;
  questions: AssessmentQuestion[];
  attachmentUrl: string;
  attachmentName: string;
  attachmentType: '' | 'pdf' | 'photo';
  published: boolean;
  resultsPublished: boolean;
  createdBy: string;
  creatorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AnswerKeyEntry {
  correctOptionIndex?: number;
  markingGuide?: string;
}

export interface AssessmentAnswerKey {
  answers: Record<string, AnswerKeyEntry>;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface StudentAnswer {
  questionId: string;
  selectedOptionIndex: number | null;
  textAnswer: string;
}

export interface QuestionScore {
  questionId: string;
  score: number;
  comment: string;
}

export interface AssessmentSubmission {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  kind: AssessmentKind;
  classLevel: ClassLevel;
  subject: SubjectCode;
  studentId: string;
  studentName: string;
  studentNumber: string;
  answers: StudentAnswer[];
  questionScores: QuestionScore[];
  totalScore: number;
  maxMarks: number;
  grade: string;
  teacherRemarks: string;
  attachmentUrl: string;
  attachmentName: string;
  attachmentType: '' | 'pdf' | 'photo';
  status: 'submitted' | 'graded' | 'published';
  submittedAt?: unknown;
  updatedAt?: unknown;
}

export interface FeeRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  classLevel: ClassLevel;
  term: string;
  amountPaidUGX: number;
  totalTermFeeUGX: number;
  paymentMethod: 'MTN MoMo' | 'Airtel Money' | 'Bank Deposit' | 'Cash Receipt' | 'Term Invoice';
  referenceCode: string;
  recordedBy: string;
  paidAt: string;
  createdAt?: unknown;
}

export interface FeePaymentRequest {
  id: string;
  studentId: string;
  studentName: string;
  classLevel: ClassLevel;
  term: string;
  amountUGX: number;
  paymentMethod: 'MTN MoMo' | 'Airtel Money' | 'Bank Deposit' | 'Cash Receipt';
  referenceCode: string;
  payerPhone: string;
  receiptUrl: string;
  adminNote: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  classLevel: ClassLevel;
  subject: string;
  senderId: string;
  senderName: string;
  senderRole: 'student' | 'teacher' | 'admin';
  recipientStudentId: string;
  text: string;
  createdAt?: unknown;
}

export interface SupportTicket {
  id: string;
  studentId: string;
  studentName: string;
  classLevel: ClassLevel;
  category: 'Technical' | 'Fees' | 'Exams' | 'Account' | 'Other';
  subject: string;
  message: string;
  adminReply: string;
  status: 'open' | 'resolved';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ActivityLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: 'student' | 'teacher' | 'admin';
  action: string;
  details: string;
  createdAt?: unknown;
}

export interface AdvertPhoto {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  active: boolean;
  createdBy: string;
  createdAt?: unknown;
}

export interface ReportCardEntry {
  subject: SubjectCode;
  assessmentTitle: string;
  score: number;
  maxMarks: number;
  grade: string;
  remark: string;
}

export interface ReportCard {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  classLevel: ClassLevel;
  term: string;
  academicYear: string;
  entries: ReportCardEntry[];
  overallAverage: number;
  conduct: string;
  teacherRemark: string;
  headTeacherRemark: string;
  published: boolean;
  preparedBy: string;
  preparedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function formatUGX(amount: number): string {
  return `UGX ${Math.round(amount || 0).toLocaleString('en-UG')}`;
}

export function computeUgandanGrade(
  score: number,
  maxMarks: number,
  gradeBands: GradeBand[]
): { percentage: number; grade: string; label: string; points: number } {
  const safeMax = maxMarks > 0 ? maxMarks : 100;
  const pct = Math.round((score / safeMax) * 100);
  const sorted = [...gradeBands].sort((a, b) => b.minScore - a.minScore);
  const match = sorted.find((b) => pct >= b.minScore && pct <= b.maxScore) || sorted[sorted.length - 1];
  return {
    percentage: pct,
    grade: match?.grade || 'F9',
    label: match?.label || 'Unclassified',
    points: match?.points ?? 9,
  };
}

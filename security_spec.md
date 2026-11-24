# Security Specification — BRIAN ACADEMY UG

## 1. Data Invariants
1. **Strict Role Separation**: A student account in `/students/{uid}` must always have `role == 'student'` and can never create or update `/admins/{uid}`, `/adminInvites/{email}`, `/teachers/{uid}`, or `/teacherInvites/{email}`.
2. **Owner-Controlled Admin Bootstrap**: Only the verified owner (`wamusibrian1@gmail.com` with `email_verified == true`) or an invite explicitly created by the owner in `/adminInvites/{email}` may hold administrator privileges.
3. **Verified Email Enforcement**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.
4. **Student Isolation**: Students may only read/list their own `/students/{uid}`, `/submissions` (`studentId == uid`), `/feeRecords` (`studentId == uid`), and `/supportTickets` (`studentId == uid`). Suspended students (`status == 'suspended'`) are denied academic participation writes (attendance, submissions, chat, tickets).
5. **Assessment Key Protection**: `/assessments/{assessmentId}/private/answerKey` is strictly readable/writable only by administrators and active teachers; students cannot read answer keys before or during assessments.
6. **Submission Immutability for Students**: Students can submit an assessment only once per `submissionId` with `status == 'submitted'`, `totalScore == 0`, and `grade == ''`. Only administrators and teachers can grade or publish results.
7. **Temporal Integrity**: All `createdAt`, `updatedAt`, `submittedAt`, and `joinedAt` timestamps must equal `request.time`.
8. **Volumetric & Type Bounds**: Every document ID matches strict character and length constraints, every string enforces `.size()`, and every array enforces `.size() <= MAX`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Promotion to Admin**: Student attempts `setDoc('/admins/studentUid', { role: 'admin', active: true })` -> DENIED (`!isOwnerAdmin()` and no `/adminInvites`).
2. **Student Role Spoofing in Profile**: Student creates `/students/studentUid` with `role: 'admin'` -> DENIED (`incoming().role == 'student'`).
3. **Student Self-Approval**: Pending student updates `/students/studentUid` setting `status: 'approved'` -> DENIED (`incoming().status == existing().status` for non-admin).
4. **Unverified Email Spoofing**: Attacker signs in with unverified email `wamusibrian1@gmail.com` (`email_verified: false`) -> DENIED (`email_verified == true` check).
5. **Reading Another Student's PII**: Student A attempts `getDoc('/students/studentB')` -> DENIED (`uid == request.auth.uid || isAdmin() || isActiveTeacher()`).
6. **Reading Another Student's Fees**: Student A queries `/feeRecords` where `studentId == 'studentB'` -> DENIED (`resource.data.studentId == request.auth.uid || isAdmin()`).
7. **Reading Protected Answer Key**: Student attempts `getDoc('/assessments/test1/private/answerKey')` -> DENIED (`isAdmin() || isActiveTeacher()`).
8. **Score Tampering on Submission**: Student submits `/submissions/sub1` with `totalScore: 100, status: 'published', grade: 'D1'` -> DENIED (`status == 'submitted' && totalScore == 0 && grade == ''`).
9. **Post-Submission Modification by Student**: Student updates `/submissions/sub1` after submission -> DENIED (student update blocked).
10. **Ghost Field Injection (Shadow Update)**: Student creates `/supportTickets/t1` with extra field `priorityOverride: true` -> DENIED (`keys().hasOnly(...)`).
11. **ID Poisoning / Resource Exhaustion**: Client attempts `setDoc('/materials/' + 'a'.repeat(500), ...)` -> DENIED (`isValidId` max 128 chars).
12. **Client Timestamp Forgery**: Student creates `/chatMessages/m1` with `createdAt: Timestamp(2020-01-01)` -> DENIED (`createdAt == request.time`).

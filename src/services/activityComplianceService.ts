import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ActivityAssignmentMode,
  ActivityCompliance,
  BasicaScope,
  DistrictActivity,
  EducationLevel,
  ParcialNumber,
  School,
  UserProfile,
} from '../types/sace';
import { getTodayIsoDate, normalizeDueTime } from '../utils/saceCalculations';

export function buildComplianceDocId(activityId: string, schoolId: string): string {
  return `${activityId}_${schoolId}`;
}

export function resolveSchoolDirectorUid(
  school: School,
  users: UserProfile[] = []
): string {
  if (school.directorUid && school.directorUid.trim()) {
    return school.directorUid.trim();
  }
  const matchedUser = users.find(
    (u) => u.role === 'director' && u.schoolId === school.id && u.uid
  );
  return matchedUser?.uid || '';
}

export function resolveAssignedDirectorUids(
  targetSchoolIds: string[],
  schools: School[],
  users: UserProfile[] = []
): string[] {
  const idSet = new Set(targetSchoolIds);
  const uids = new Set<string>();

  for (const s of schools) {
    if (!idSet.has(s.id)) continue;
    const uid = resolveSchoolDirectorUid(s, users);
    if (uid) uids.add(uid);
  }

  // Also include any director user linked directly to a target schoolId
  for (const u of users) {
    if (u.role === 'director' && u.schoolId && idSet.has(u.schoolId) && u.uid) {
      uids.add(u.uid);
    }
  }

  return Array.from(uids).slice(0, 200);
}

export interface SaveDistrictActivityInput {
  editingActivity: DistrictActivity | null;
  year: number;
  parcial: ParcialNumber;
  title: string;
  description: string;
  dueDate: string;
  dueTime?: string;
  assignmentMode: ActivityAssignmentMode;
  targetLevels: EducationLevel[];
  targetBasicaScopes: BasicaScope[];
  targetSchoolIds: string[];
  schools: School[];
  users: UserProfile[];
  adminUid: string;
}

export async function saveDistrictActivity(input: SaveDistrictActivityInput): Promise<void> {
  const assignedDirectorUids = resolveAssignedDirectorUids(
    input.targetSchoolIds,
    input.schools,
    input.users
  );

  const sanitizedTitle = input.title.trim().slice(0, 160);
  const sanitizedDescription = input.description.trim().slice(0, 600);
  const sanitizedDueTime = normalizeDueTime(input.dueTime);
  const sanitizedSchoolIds = input.targetSchoolIds.slice(0, 200);

  if (input.editingActivity) {
    const path = `activities/${input.editingActivity.id}`;
    try {
      await updateDoc(doc(db, 'activities', input.editingActivity.id), {
        year: input.year,
        parcial: input.parcial,
        title: sanitizedTitle,
        description: sanitizedDescription,
        dueDate: input.dueDate,
        dueTime: sanitizedDueTime,
        assignmentMode: input.assignmentMode,
        targetLevels: input.targetLevels,
        targetBasicaScopes: input.targetBasicaScopes,
        targetSchoolIds: sanitizedSchoolIds,
        assignedDirectorUids,
        active: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
    return;
  }

  try {
    await addDoc(collection(db, 'activities'), {
      year: input.year,
      parcial: input.parcial,
      title: sanitizedTitle,
      description: sanitizedDescription,
      dueDate: input.dueDate,
      dueTime: sanitizedDueTime,
      assignmentMode: input.assignmentMode,
      targetLevels: input.targetLevels,
      targetBasicaScopes: input.targetBasicaScopes,
      targetSchoolIds: sanitizedSchoolIds,
      assignedDirectorUids,
      active: true,
      createdByUid: input.adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'activities');
  }
}

export async function deleteDistrictActivity(activityId: string): Promise<void> {
  const path = `activities/${activityId}`;
  try {
    // Clean up compliance records associated with this activity
    const q = query(
      collection(db, 'activityCompliances'),
      where('activityId', '==', activityId)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'activities', activityId));
    await batch.commit();
  } catch (err) {
    // Fallback to deleting just the activity if batch query fails
    try {
      await deleteDoc(doc(db, 'activities', activityId));
    } catch (innerErr) {
      handleFirestoreError(innerErr ?? err, OperationType.DELETE, path);
    }
  }
}

export interface MarkComplianceInput {
  activity: DistrictActivity;
  school: School;
  users?: UserProfile[];
  adminUid: string;
  completed: boolean;
  completedDate?: string;
  note?: string;
  existingCompliance?: ActivityCompliance | null;
}

/**
 * Persists compliance state ('Cumplido' / 'Pendiente') for a specific activity and school
 * in Firestore, guaranteeing real-time reflection for the assigned school's director.
 */
export async function markSchoolActivityCompliance(
  input: MarkComplianceInput
): Promise<{ completed: boolean; completedDate: string }> {
  const { activity, school, users = [], adminUid, completed } = input;
  const docId = buildComplianceDocId(activity.id, school.id);
  const path = `activityCompliances/${docId}`;
  const compRef = doc(db, 'activityCompliances', docId);
  const directorUid = resolveSchoolDirectorUid(school, users);

  let existingData: Omit<ActivityCompliance, 'id'> | null = null;
  if (input.existingCompliance !== undefined) {
    existingData = input.existingCompliance;
  } else {
    try {
      const existingSnap = await getDoc(compRef);
      existingData = existingSnap.exists()
        ? (existingSnap.data() as Omit<ActivityCompliance, 'id'>)
        : null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  const finalCompletedDate = completed
    ? input.completedDate || existingData?.completedDate || getTodayIsoDate()
    : '';
  const finalNote = (
    input.note !== undefined ? input.note : existingData?.note || ''
  )
    .trim()
    .slice(0, 400);

  const sanitizedSace = school.saceCode.trim().slice(0, 40) || 'S/N';
  const sanitizedSchoolName = school.name.trim().slice(0, 200) || 'Centro Educativo';

  const batch = writeBatch(db);

  if (existingData) {
    batch.update(compRef, {
      year: activity.year,
      parcial: activity.parcial,
      saceCode: sanitizedSace,
      schoolName: sanitizedSchoolName,
      directorUid,
      completed,
      completedDate: finalCompletedDate,
      note: finalNote,
      updatedByUid: adminUid,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(compRef, {
      activityId: activity.id,
      year: activity.year,
      parcial: activity.parcial,
      schoolId: school.id,
      saceCode: sanitizedSace,
      schoolName: sanitizedSchoolName,
      directorUid,
      completed,
      completedDate: finalCompletedDate,
      note: finalNote,
      updatedByUid: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Ensure the school's director UID is present in activity.assignedDirectorUids
  // so real-time director queries stay synchronized.
  if (directorUid && !activity.assignedDirectorUids.includes(directorUid)) {
    const nextDirectors = Array.from(
      new Set([...activity.assignedDirectorUids, directorUid])
    ).slice(0, 200);
    batch.update(doc(db, 'activities', activity.id), {
      assignedDirectorUids: nextDirectors,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      existingData ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }

  return { completed, completedDate: finalCompletedDate };
}

/**
 * Keeps activities.assignedDirectorUids and activityCompliances.directorUid
 * aligned with current school director assignments so directors always see updates in real time.
 */
export async function syncDirectorLinksForActivities(
  activities: DistrictActivity[],
  compliances: ActivityCompliance[],
  schools: School[],
  users: UserProfile[],
  adminUid: string
): Promise<number> {
  const schoolById = new Map<string, School>(schools.map((s) => [s.id, s]));
  const batch = writeBatch(db);
  let pendingWrites = 0;

  for (const act of activities) {
    const expectedUids = resolveAssignedDirectorUids(act.targetSchoolIds, schools, users);
    const currentSet = new Set(act.assignedDirectorUids);
    const missing = expectedUids.some((uid) => !currentSet.has(uid));
    if (missing && expectedUids.length <= 200) {
      batch.update(doc(db, 'activities', act.id), {
        assignedDirectorUids: expectedUids,
        updatedAt: serverTimestamp(),
      });
      pendingWrites++;
    }
  }

  for (const comp of compliances) {
    const school = schoolById.get(comp.schoolId);
    if (!school) continue;
    const expectedUid = resolveSchoolDirectorUid(school, users);
    if (expectedUid && comp.directorUid !== expectedUid) {
      batch.update(doc(db, 'activityCompliances', comp.id), {
        directorUid: expectedUid,
        updatedByUid: adminUid,
        updatedAt: serverTimestamp(),
      });
      pendingWrites++;
    }
  }

  if (pendingWrites === 0) return 0;

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'activities/syncDirectorLinks');
  }
  return pendingWrites;
}

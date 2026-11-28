import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type {
  ActivityCompliance,
  AnnualReport,
  BasicaAnnualData,
  BasicaScope,
  CanonicalBasicaCenterType,
  CanonicalPrebasicaCenterType,
  CenterTypeFilter,
  DirectorRequest,
  DistrictActivity,
  DistrictCode,
  DistrictDeadlines,
  EducationLevel,
  MediaAnnualData,
  ModalityType,
  MonthlyReport,
  ParteMensualReport,
  PrebasicaAnnualData,
  ReportStatus,
  School,
  SchoolContact,
  SectorType,
  UserProfile,
} from '../types/sace';
import {
  BASICA_ALL_GRADES,
  BASICA_CENTER_TYPES,
  BASICA_CENTER_TYPE_LABELS,
  BASICA_CYCLE_1_2,
  BASICA_CYCLE_3,
  BASICA_SCOPE_LABELS,
  CENTER_TYPE_FILTER_OPTIONS,
  DEFAULT_YEAR,
  DISTRICT_OPTIONS,
  LEVEL_LABELS,
  MEDIA_GRADES,
  MONTHS,
  PREBASICA_CENTER_TYPES,
  PREBASICA_GRADES,
  aggregateBasicaReports,
  aggregateMediaReports,
  aggregateParteMensualReports,
  aggregatePrebasicaReports,
  formatAccountIdentifier,
  getBasicaScope,
  getCenterTypeFilterLabel,
  getDefaultMonthDeadlineStr,
  getDistrictLabel,
  getSchoolCenterTypesSummary,
  getSchoolLevelLabel,
  normalizeBasicaCenterType,
  normalizePrebasicaCenterType,
  schoolMatchesBasicaScope,
  schoolMatchesCenterTypeFilter,
  sumEstadisticoRows,
  totalNV,
} from '../utils/saceCalculations';
import {
  exportBasicaExcel,
  exportMediaExcel,
  exportMonthlyReportExcel,
} from '../utils/exportExcel';
import {
  exportBasicaPdf,
  exportMediaPdf,
  exportMonthlyReportPdf,
} from '../utils/exportPdf';
import { ActivityComplianceAdmin } from './ActivityComplianceAdmin';
import { ActivityComplianceChart } from './ActivityComplianceChart';
import { AdminSchoolReportUpload } from './AdminSchoolReportUpload';
import { AdminUsersSection } from './AdminUsersSection';
import { BasicaAnnualEditor } from './BasicaAnnualEditor';
import { DistrictEnrollmentChart } from './DistrictEnrollmentChart';
import { MediaAnnualEditor } from './MediaAnnualEditor';
import { MonthlyComplianceWidget } from './MonthlyComplianceWidget';
import { MovimientosSaceEditor } from './MovimientosSaceEditor';
import { ParteMensualEditor } from './ParteMensualEditor';
import { PrebasicaAnnualEditor } from './PrebasicaAnnualEditor';
import { ReportComplianceByLevelChart } from './ReportComplianceByLevelChart';
import { StatisticalReportsExplorer } from './StatisticalReportsExplorer';
import { StatusText } from './StatusText';

export type AdminSection =
  | 'overview'
  | 'statisticalReports'
  | 'schools'
  | 'users'
  | 'reviews'
  | 'upload'
  | 'activities'
  | 'consolidated';

const SCHOOL_MONTHS = MONTHS.filter((m) => m.value >= 2 && m.value <= 11);

function clampSchoolMonth(month: number): number {
  if (month < 2) return 2;
  if (month > 11) return 11;
  return month;
}

interface AdminDashboardProps {
  profile: UserProfile;
  activeSection: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
}

export function AdminDashboard({ profile, activeSection, onSectionChange }: AdminDashboardProps) {
  const { schools } = useAuth();
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [requests, setRequests] = useState<DirectorRequest[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [parteMensualReports, setParteMensualReports] = useState<ParteMensualReport[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([]);
  const [annualReports, setAnnualReports] = useState<AnnualReport[]>([]);
  const [activities, setActivities] = useState<DistrictActivity[]>([]);
  const [activityCompliances, setActivityCompliances] = useState<ActivityCompliance[]>([]);
  const [schoolContacts, setSchoolContacts] = useState<Record<string, SchoolContact>>({});
  const [districtDeadlines, setDistrictDeadlines] = useState<DistrictDeadlines | null>(null);
  const [yearReportsLoaded, setYearReportsLoaded] = useState({
    parte: false,
    monthly: false,
    annual: false,
  });
  const [usersSubscribed, setUsersSubscribed] = useState(
    activeSection === 'users' || activeSection === 'activities'
  );
  const [schoolContactsSubscribed, setSchoolContactsSubscribed] = useState(
    activeSection === 'schools'
  );

  // Deadlines config modal state
  const [showDeadlinesModal, setShowDeadlinesModal] = useState(false);
  const [dlParteMonth, setDlParteMonth] = useState<number>(new Date().getMonth() + 1);
  const [dlParteDeadline, setDlParteDeadline] = useState<string>('');
  const [dlMovMonth, setDlMovMonth] = useState<number>(new Date().getMonth() + 1);
  const [dlMovDeadline, setDlMovDeadline] = useState<string>('');
  const [dlAnnualDeadline, setDlAnnualDeadline] = useState<string>('');
  const [dlSavedBanner, setDlSavedBanner] = useState(false);

  // Schools creation & editing state
  const [showNewSchool, setShowNewSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSaceCode, setNewSaceCode] = useState('');
  const [newCommunity, setNewCommunity] = useState('Omoa');
  const [newDistrict, setNewDistrict] = useState<DistrictCode>('18-B');
  const [newDirectorPhone, setNewDirectorPhone] = useState('');
  const [newLevels, setNewLevels] = useState<EducationLevel[]>(['basica']);
  const [newBasicaScope, setNewBasicaScope] = useState<BasicaScope>('c1_2_3');
  const [newPrebasicaType, setNewPrebasicaType] = useState<CanonicalPrebasicaCenterType>('Normal');
  const [newBasicaType, setNewBasicaType] = useState<CanonicalBasicaCenterType>('normal');
  const [newSector, setNewSector] = useState<SectorType>('gubernamental');
  const [newModality, setNewModality] = useState<ModalityType>('presencial');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolDistrictFilter, setSchoolDistrictFilter] = useState<'all' | DistrictCode | 'unassigned'>('all');
  const [schoolCenterTypeFilter, setSchoolCenterTypeFilter] = useState<CenterTypeFilter>('all');

  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [editSchoolName, setEditSchoolName] = useState('');
  const [editSaceCode, setEditSaceCode] = useState('');
  const [editCommunity, setEditCommunity] = useState('Omoa');
  const [editDistrict, setEditDistrict] = useState<DistrictCode | ''>('');
  const [editDirectorPhone, setEditDirectorPhone] = useState('');
  const [editLevels, setEditLevels] = useState<EducationLevel[]>(['basica']);
  const [editBasicaScope, setEditBasicaScope] = useState<BasicaScope>('c1_2_3');
  const [editPrebasicaType, setEditPrebasicaType] = useState<CanonicalPrebasicaCenterType>('Normal');
  const [editBasicaType, setEditBasicaType] = useState<CanonicalBasicaCenterType>('normal');
  const [editSector, setEditSector] = useState<SectorType>('gubernamental');
  const [editModality, setEditModality] = useState<ModalityType>('presencial');
  const [deletingSchool, setDeletingSchool] = useState<School | null>(null);
  const [deleteSchoolReportsToo, setDeleteSchoolReportsToo] = useState(false);
  const [schoolCatalogBanner, setSchoolCatalogBanner] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Review filters & modal
  const [rejectingUid, setRejectingUid] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewKind, setReviewKind] = useState<'annual' | 'parteMensual' | 'monthly'>('parteMensual');
  const [reviewDistrict, setReviewDistrict] = useState<'all' | DistrictCode | 'unassigned'>('all');
  const [reviewLevel, setReviewLevel] = useState<'all' | EducationLevel>('all');
  const [reviewBasicaScope, setReviewBasicaScope] = useState<'all' | BasicaScope>('all');
  const [reviewCenterType, setReviewCenterType] = useState<CenterTypeFilter>('all');
  const [reviewStatus, setReviewStatus] = useState<'all' | ReportStatus>('all');
  const [reviewMonth, setReviewMonth] = useState<number>(new Date().getMonth() + 1);
  const [inspectingAnnual, setInspectingAnnual] = useState<AnnualReport | null>(null);
  const [inspectingParteMensual, setInspectingParteMensual] = useState<ParteMensualReport | null>(null);
  const [inspectingMonthly, setInspectingMonthly] = useState<MonthlyReport | null>(null);
  const [editingInspectedReport, setEditingInspectedReport] = useState(false);
  const [returnComment, setReturnComment] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  // Consolidated export filters
  const [consKind, setConsKind] = useState<'annual' | 'parteMensual' | 'monthly'>('parteMensual');
  const [consDistrict, setConsDistrict] = useState<'all' | DistrictCode | 'unassigned'>('all');
  const [consLevel, setConsLevel] = useState<EducationLevel>('basica');
  const [consBasicaScope, setConsBasicaScope] = useState<BasicaScope>('c1_2_3');
  const [consCenterType, setConsCenterType] = useState<CenterTypeFilter>('all');
  const [consMonth, setConsMonth] = useState<number>(() =>
    clampSchoolMonth(new Date().getMonth() + 1)
  );
  const [consScope, setConsScope] = useState<'approved_only' | 'submitted_and_approved'>(
    'submitted_and_approved'
  );
  const [consSector, setConsSector] = useState<'all' | SectorType>('all');
  const [consSchoolId, setConsSchoolId] = useState<string>('all');

  useEffect(() => {
    if ((activeSection === 'users' || activeSection === 'activities') && !usersSubscribed) {
      setUsersSubscribed(true);
    }
    if (activeSection === 'schools' && !schoolContactsSubscribed) {
      setSchoolContactsSubscribed(true);
    }
  }, [activeSection, usersSubscribed, schoolContactsSubscribed]);

  useEffect(() => {
    const reqQuery = query(
      collection(db, 'directorRequests'),
      where('status', '==', 'pending')
    );
    const u1 = onSnapshot(
      reqQuery,
      (snap) => {
        setRequests(
          snap.docs.map((d) => d.data() as DirectorRequest)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'directorRequests')
    );

    return () => u1();
  }, []);

  useEffect(() => {
    if (!usersSubscribed) return;
    const u2 = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setUsers(snap.docs.map((d) => d.data() as UserProfile));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    return () => u2();
  }, [usersSubscribed]);

  useEffect(() => {
    if (!schoolContactsSubscribed) return;
    const u8 = onSnapshot(
      collection(db, 'schoolContacts'),
      (snap) => {
        const next: Record<string, SchoolContact> = {};
        for (const d of snap.docs) {
          next[d.id] = d.data() as SchoolContact;
        }
        setSchoolContacts(next);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'schoolContacts')
    );

    return () => u8();
  }, [schoolContactsSubscribed]);

  useEffect(() => {
    setYearReportsLoaded({ parte: false, monthly: false, annual: false });

    const u3 = onSnapshot(
      query(collection(db, 'monthlyReports'), where('year', '==', year)),
      (snap) => {
        setMonthlyReports(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MonthlyReport, 'id'>) }))
        );
        setYearReportsLoaded((prev) => (prev.monthly ? prev : { ...prev, monthly: true }));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'monthlyReports')
    );

    const u4 = onSnapshot(
      query(collection(db, 'annualReports'), where('year', '==', year)),
      (snap) => {
        setAnnualReports(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AnnualReport, 'id'>) }))
        );
        setYearReportsLoaded((prev) => (prev.annual ? prev : { ...prev, annual: true }));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'annualReports')
    );

    const u5 = onSnapshot(
      query(collection(db, 'parteMensualReports'), where('year', '==', year)),
      (snap) => {
        setParteMensualReports(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ParteMensualReport, 'id'>) }))
        );
        setYearReportsLoaded((prev) => (prev.parte ? prev : { ...prev, parte: true }));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'parteMensualReports')
    );

    const u6 = onSnapshot(
      query(collection(db, 'activities'), where('year', '==', year)),
      (snap) => {
        setActivities(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DistrictActivity, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'activities')
    );

    const u7 = onSnapshot(
      query(collection(db, 'activityCompliances'), where('year', '==', year)),
      (snap) => {
        setActivityCompliances(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityCompliance, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'activityCompliances')
    );

    return () => {
      u3();
      u4();
      u5();
      u6();
      u7();
    };
  }, [year]);

  useEffect(() => {
    setInspectingAnnual((prev) =>
      prev ? annualReports.find((r) => r.id === prev.id) || prev : null
    );
  }, [annualReports]);

  useEffect(() => {
    setInspectingParteMensual((prev) =>
      prev ? parteMensualReports.find((r) => r.id === prev.id) || prev : null
    );
  }, [parteMensualReports]);

  useEffect(() => {
    setInspectingMonthly((prev) =>
      prev ? monthlyReports.find((r) => r.id === prev.id) || prev : null
    );
  }, [monthlyReports]);

  useEffect(() => {
    const deadlinesDocId = `deadlines_${year}`;
    const unsubDeadlines = onSnapshot(
      doc(db, 'districtConfig', deadlinesDocId),
      (snap) => {
        if (snap.exists()) {
          setDistrictDeadlines({
            id: snap.id,
            ...(snap.data() as Omit<DistrictDeadlines, 'id'>),
          });
        } else {
          setDistrictDeadlines(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `districtConfig/${deadlinesDocId}`)
    );

    return () => unsubDeadlines();
  }, [year]);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === 'pending'),
    [requests]
  );

  const yearAnnuals = useMemo(
    () => annualReports.filter((r) => r.year === year),
    [annualReports, year]
  );

  const yearMonthlies = useMemo(
    () => monthlyReports.filter((r) => r.year === year),
    [monthlyReports, year]
  );

  const yearPartesMensuales = useMemo(
    () => parteMensualReports.filter((r) => r.year === year),
    [parteMensualReports, year]
  );

  // Consolidated district totals for overview KPIs
  const districtTotals = useMemo(() => {
    const preAgg = aggregatePrebasicaReports(yearAnnuals.filter((r) => r.level === 'prebasica'));
    const preTot = sumEstadisticoRows(PREBASICA_GRADES.map((g) => preAgg.estadisticoFinal[g.key]));

    const basicaAgg = aggregateBasicaReports(yearAnnuals.filter((r) => r.level === 'basica'));
    const basicaAllTot = sumEstadisticoRows(
      BASICA_ALL_GRADES.map((g) => basicaAgg.estadisticoFinal[g.key])
    );
    const basicaC12Tot = sumEstadisticoRows(
      BASICA_CYCLE_1_2.map((g) => basicaAgg.estadisticoFinal[g.key])
    );
    const basicaC3Tot = sumEstadisticoRows(
      BASICA_CYCLE_3.map((g) => basicaAgg.estadisticoFinal[g.key])
    );

    const mediaAgg = aggregateMediaReports(yearAnnuals.filter((r) => r.level === 'media'));
    const mediaTot = sumEstadisticoRows(MEDIA_GRADES.map((g) => mediaAgg.estadisticoFinal[g.key]));

    return {
      prebasica: totalNV(preTot.matFinal),
      basica: totalNV(basicaAllTot.matFinal),
      basicaC12: totalNV(basicaC12Tot.matFinal),
      basicaC3: totalNV(basicaC3Tot.matFinal),
      media: totalNV(mediaTot.matFinal),
    };
  }, [yearAnnuals]);

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim() || !newSaceCode.trim()) return;
    setActionBusy(true);
    try {
      const batch = writeBatch(db);
      const schoolRef = doc(collection(db, 'schools'));
      batch.set(schoolRef, {
        saceCode: newSaceCode.trim(),
        name: newSchoolName.trim(),
        community: newCommunity.trim() || 'Omoa',
        district: newDistrict,
        levels: newLevels,
        ...(newLevels.includes('prebasica') ? { prebasicaType: newPrebasicaType } : {}),
        ...(newLevels.includes('basica')
          ? {
              basicaScope: newBasicaScope,
              ...(newBasicaScope === 'c1_2' ? { basicaType: newBasicaType } : {}),
            }
          : {}),
        sector: newSector,
        modality: newModality,
        directorUid: '',
        directorDisplayName: '',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const phone = newDirectorPhone.trim().slice(0, 30);
      if (phone) {
        batch.set(doc(db, 'schoolContacts', schoolRef.id), {
          schoolId: schoolRef.id,
          directorPhone: phone,
          updatedByUid: profile.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setNewSchoolName('');
      setNewSaceCode('');
      setNewDirectorPhone('');
      setNewDistrict('18-B');
      setNewBasicaScope('c1_2_3');
      setNewPrebasicaType('Normal');
      setNewBasicaType('normal');
      setShowNewSchool(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'schools');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStartEditSchool = (s: School) => {
    setEditingSchoolId(s.id);
    setEditSchoolName(s.name);
    setEditSaceCode(s.saceCode);
    setEditCommunity(s.community);
    setEditDistrict(s.district || '');
    setEditDirectorPhone(schoolContacts[s.id]?.directorPhone || '');
    setEditLevels(s.levels.length > 0 ? s.levels : ['basica']);
    setEditBasicaScope(s.basicaScope || 'c1_2_3');
    setEditPrebasicaType(normalizePrebasicaCenterType(s.prebasicaType) || 'Normal');
    setEditBasicaType(normalizeBasicaCenterType(s.basicaType) || 'normal');
    setEditSector(s.sector);
    setEditModality(s.modality);
    setShowNewSchool(false);
  };

  const handleUpdateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchoolId || !editSchoolName.trim() || !editSaceCode.trim()) return;
    setActionBusy(true);
    try {
      await updateDoc(doc(db, 'schools', editingSchoolId), {
        saceCode: editSaceCode.trim(),
        name: editSchoolName.trim(),
        community: editCommunity.trim() || 'Omoa',
        district: editDistrict ? editDistrict : deleteField(),
        levels: editLevels,
        prebasicaType: editLevels.includes('prebasica') ? editPrebasicaType : deleteField(),
        basicaScope: editLevels.includes('basica') ? editBasicaScope : deleteField(),
        basicaType:
          editLevels.includes('basica') && editBasicaScope === 'c1_2'
            ? editBasicaType
            : deleteField(),
        sector: editSector,
        modality: editModality,
        updatedAt: serverTimestamp(),
      });

      const phone = editDirectorPhone.trim().slice(0, 30);
      const contactRef = doc(db, 'schoolContacts', editingSchoolId);
      const hasExistingContact = schoolContactsSubscribed
        ? Boolean(schoolContacts[editingSchoolId])
        : (await getDoc(contactRef)).exists();
      if (hasExistingContact) {
        await updateDoc(contactRef, {
          directorPhone: phone,
          updatedByUid: profile.uid,
          updatedAt: serverTimestamp(),
        });
      } else if (phone) {
        await setDoc(contactRef, {
          schoolId: editingSchoolId,
          directorPhone: phone,
          updatedByUid: profile.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setEditingSchoolId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `schools/${editingSchoolId}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmDeleteSchool = async () => {
    if (!deletingSchool) return;
    const target = deletingSchool;
    setActionBusy(true);
    setSchoolCatalogBanner(null);
    try {
      type BatchOp = (batch: ReturnType<typeof writeBatch>) => void;
      const ops: BatchOp[] = [];

      ops.push((b) => b.delete(doc(db, 'schools', target.id)));
      ops.push((b) => b.delete(doc(db, 'schoolContacts', target.id)));

      const linkedUsers: Array<Pick<UserProfile, 'uid' | 'role' | 'saceCode'>> = usersSubscribed
        ? users.filter((u) => u.schoolId === target.id)
        : (
            await getDocs(query(collection(db, 'users'), where('schoolId', '==', target.id)))
          ).docs.map((d) => d.data() as UserProfile);

      for (const u of linkedUsers) {
        ops.push((b) =>
          b.update(doc(db, 'users', u.uid), {
            schoolId: '',
            schoolName: '',
            ...(u.role === 'director'
              ? {
                  role: 'pending',
                  needsOnboarding: Boolean(u.saceCode),
                }
              : {}),
            updatedAt: serverTimestamp(),
          })
        );
      }

      if (deleteSchoolReportsToo) {
        const [annSnap, parteSnap, movSnap, compSnap] = await Promise.all([
          getDocs(query(collection(db, 'annualReports'), where('schoolId', '==', target.id))),
          getDocs(query(collection(db, 'parteMensualReports'), where('schoolId', '==', target.id))),
          getDocs(query(collection(db, 'monthlyReports'), where('schoolId', '==', target.id))),
          getDocs(query(collection(db, 'activityCompliances'), where('schoolId', '==', target.id))),
        ]);
        for (const d of annSnap.docs) {
          ops.push((b) => b.delete(doc(db, 'annualReports', d.id)));
        }
        for (const d of parteSnap.docs) {
          ops.push((b) => b.delete(doc(db, 'parteMensualReports', d.id)));
        }
        for (const d of movSnap.docs) {
          ops.push((b) => b.delete(doc(db, 'monthlyReports', d.id)));
        }
        for (const d of compSnap.docs) {
          ops.push((b) => b.delete(doc(db, 'activityCompliances', d.id)));
        }
      }

      const CHUNK_SIZE = 400;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + CHUNK_SIZE)) {
          op(batch);
        }
        await batch.commit();
      }

      if (editingSchoolId === target.id) {
        setEditingSchoolId(null);
      }
      if (consSchoolId === target.id) {
        setConsSchoolId('all');
      }
      setDeletingSchool(null);
      setDeleteSchoolReportsToo(false);
      setSchoolCatalogBanner({
        type: 'ok',
        text: `Centro "${target.name}" (${target.saceCode}) eliminado del catálogo oficial.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `schools/${target.id}`);
      setSchoolCatalogBanner({
        type: 'err',
        text: 'No se pudo eliminar el centro educativo. Verifica tu conexión o permisos.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleApproveRequest = async (req: DirectorRequest) => {
    setActionBusy(true);
    try {
      let targetSchoolId = req.schoolId;
      let targetSchoolName = req.proposedSchoolName;
      let targetSaceCode = req.proposedSaceCode;

      if (req.requestType === 'new_school' || !targetSchoolId) {
        const docRef = await addDoc(collection(db, 'schools'), {
          saceCode: req.proposedSaceCode,
          name: req.proposedSchoolName,
          community: req.proposedCommunity || 'Omoa',
          ...(req.proposedDistrict ? { district: req.proposedDistrict } : {}),
          levels: req.proposedLevels,
          ...(req.proposedLevels.includes('prebasica') && req.proposedPrebasicaType
            ? { prebasicaType: req.proposedPrebasicaType }
            : {}),
          ...(req.proposedLevels.includes('basica')
            ? {
                basicaScope: req.proposedBasicaScope || 'c1_2_3',
                ...(req.proposedBasicaScope === 'c1_2' && req.proposedBasicaType
                  ? { basicaType: req.proposedBasicaType }
                  : {}),
              }
            : {}),
          sector: req.proposedSector,
          modality: req.proposedModality,
          directorUid: req.uid,
          directorDisplayName: req.displayName,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        targetSchoolId = docRef.id;
      } else {
        const existingSchool = schools.find((s) => s.id === targetSchoolId);
        if (existingSchool) {
          targetSchoolName = existingSchool.name;
          targetSaceCode = existingSchool.saceCode;
        }
        await updateDoc(doc(db, 'schools', targetSchoolId), {
          directorUid: req.uid,
          directorDisplayName: req.displayName,
          updatedAt: serverTimestamp(),
        });
      }

      const isNewSchool = req.requestType === 'new_school' || !req.schoolId;
      const reqPhone = (req.directorPhone || '').trim().slice(0, 30);
      if (reqPhone && targetSchoolId) {
        const contactRef = doc(db, 'schoolContacts', targetSchoolId);
        const hasExistingContact = isNewSchool
          ? false
          : schoolContactsSubscribed
          ? Boolean(schoolContacts[targetSchoolId])
          : (await getDoc(contactRef)).exists();
        if (hasExistingContact) {
          await updateDoc(contactRef, {
            directorPhone: reqPhone,
            updatedByUid: profile.uid,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(contactRef, {
            schoolId: targetSchoolId,
            directorPhone: reqPhone,
            updatedByUid: profile.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await updateDoc(doc(db, 'users', req.uid), {
        role: 'director',
        displayName: req.displayName,
        dni: req.dni,
        schoolId: targetSchoolId,
        schoolName: targetSchoolName,
        saceCode: targetSaceCode,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'directorRequests', req.uid), {
        status: 'approved',
        schoolId: targetSchoolId,
        reviewComment: 'Aprobado por Dirección Distrital N° 18-B.',
        updatedAt: serverTimestamp(),
      });

      // Keep activity assignments and compliance records synced with newly linked director
      const affectedActivities = activities.filter((a) =>
        a.targetSchoolIds.includes(targetSchoolId)
      );
      await Promise.all(
        affectedActivities
          .filter((a) => !a.assignedDirectorUids.includes(req.uid))
          .map((a) =>
            updateDoc(doc(db, 'activities', a.id), {
              assignedDirectorUids: [...a.assignedDirectorUids, req.uid],
              updatedAt: serverTimestamp(),
            })
          )
      );
      const affectedCompliances = activityCompliances.filter(
        (c) => c.schoolId === targetSchoolId && c.directorUid !== req.uid
      );
      await Promise.all(
        affectedCompliances.map((c) =>
          updateDoc(doc(db, 'activityCompliances', c.id), {
            directorUid: req.uid,
            updatedByUid: profile.uid,
            updatedAt: serverTimestamp(),
          })
        )
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `directorRequests/${req.uid}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleRejectRequest = async (req: DirectorRequest) => {
    if (!rejectReason.trim()) return;
    setActionBusy(true);
    try {
      await updateDoc(doc(db, 'directorRequests', req.uid), {
        status: 'rejected',
        reviewComment: rejectReason.trim(),
        updatedAt: serverTimestamp(),
      });
      setRejectingUid(null);
      setRejectReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `directorRequests/${req.uid}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleReviewDecision = async (
    kind: 'annual' | 'parteMensual' | 'monthly',
    reportId: string,
    nextStatus: ReportStatus
  ) => {
    if (nextStatus === 'returned' && !returnComment.trim()) {
      return;
    }
    setActionBusy(true);
    const colName =
      kind === 'annual'
        ? 'annualReports'
        : kind === 'parteMensual'
        ? 'parteMensualReports'
        : 'monthlyReports';
    try {
      await updateDoc(doc(db, colName, reportId), {
        status: nextStatus,
        reviewComment: nextStatus === 'returned' ? returnComment.trim() : '',
        reviewedByUid: profile.uid,
        updatedAt: serverTimestamp(),
      });
      setInspectingAnnual(null);
      setInspectingParteMensual(null);
      setInspectingMonthly(null);
      setEditingInspectedReport(false);
      setReturnComment('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${colName}/${reportId}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleOpenDeadlinesModal = () => {
    const currentMonth = new Date().getMonth() + 1;
    const pMonth = districtDeadlines?.parteMensualMonth ?? currentMonth;
    const mMonth = districtDeadlines?.movimientosMonth ?? currentMonth;
    setDlParteMonth(pMonth);
    setDlParteDeadline(
      districtDeadlines?.parteMensualDeadline ?? getDefaultMonthDeadlineStr(year, pMonth)
    );
    setDlMovMonth(mMonth);
    setDlMovDeadline(
      districtDeadlines?.movimientosDeadline ?? getDefaultMonthDeadlineStr(year, mMonth)
    );
    setDlAnnualDeadline(districtDeadlines?.annualDeadline ?? `${year}-11-30T23:59`);
    setDlSavedBanner(false);
    setShowDeadlinesModal(true);
  };

  const handleSaveDeadlines = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    const configId = `deadlines_${year}`;
    const ref = doc(db, 'districtConfig', configId);
    const payload = {
      parteMensualMonth: Number(dlParteMonth),
      parteMensualDeadline: dlParteDeadline ? dlParteDeadline.slice(0, 16) : '',
      movimientosMonth: Number(dlMovMonth),
      movimientosDeadline: dlMovDeadline ? dlMovDeadline.slice(0, 16) : '',
      annualDeadline: dlAnnualDeadline ? dlAnnualDeadline.slice(0, 16) : '',
      parteMensualByMonth: {
        ...(districtDeadlines?.parteMensualByMonth || {}),
        ...(dlParteDeadline ? { [String(dlParteMonth)]: dlParteDeadline.slice(0, 16) } : {}),
      },
      movimientosByMonth: {
        ...(districtDeadlines?.movimientosByMonth || {}),
        ...(dlMovDeadline ? { [String(dlMovMonth)]: dlMovDeadline.slice(0, 16) } : {}),
      },
      updatedByUid: profile.uid,
      updatedAt: serverTimestamp(),
    };

    try {
      if (districtDeadlines) {
        await updateDoc(ref, payload);
      } else {
        await setDoc(ref, {
          year,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setDlSavedBanner(true);
      setShowDeadlinesModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `districtConfig/${configId}`);
    } finally {
      setActionBusy(false);
    }
  };

  const filteredSchools = useMemo(() => {
    const byFilters = schools.filter((s) => {
      if (schoolDistrictFilter === 'unassigned') {
        if (s.district) return false;
      } else if (schoolDistrictFilter !== 'all' && s.district !== schoolDistrictFilter) {
        return false;
      }
      if (!schoolMatchesCenterTypeFilter(s, schoolCenterTypeFilter)) {
        return false;
      }
      return true;
    });
    const q = schoolSearch.trim().toLowerCase();
    if (!q) return byFilters;
    return byFilters.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.saceCode.toLowerCase().includes(q) ||
        s.community.toLowerCase().includes(q) ||
        (schoolContacts[s.id]?.directorPhone || '').toLowerCase().includes(q)
    );
  }, [schools, schoolDistrictFilter, schoolCenterTypeFilter, schoolSearch, schoolContacts]);

  const schoolMatchesDistrict = (
    sch: Pick<School, 'district'> | undefined,
    filter: 'all' | DistrictCode | 'unassigned'
  ): boolean => {
    if (filter === 'all') return true;
    if (filter === 'unassigned') return !sch?.district;
    return sch?.district === filter;
  };

  const filteredReviewAnnuals = useMemo(() => {
    return yearAnnuals.filter((r) => {
      if (reviewLevel !== 'all' && r.level !== reviewLevel) return false;
      const sch = schools.find((s) => s.id === r.schoolId);
      if (!schoolMatchesDistrict(sch, reviewDistrict)) return false;
      if (reviewLevel === 'basica' && reviewBasicaScope !== 'all') {
        if (getBasicaScope(sch) !== reviewBasicaScope) return false;
      }
      if (reviewCenterType !== 'all' && !schoolMatchesCenterTypeFilter(sch, reviewCenterType)) {
        return false;
      }
      if (reviewStatus !== 'all' && r.status !== reviewStatus) return false;
      return true;
    });
  }, [yearAnnuals, reviewDistrict, reviewLevel, reviewBasicaScope, reviewCenterType, reviewStatus, schools]);

  const filteredReviewPartes = useMemo(() => {
    return yearPartesMensuales.filter((r) => {
      if (r.month !== reviewMonth) return false;
      if (reviewLevel !== 'all' && r.level !== reviewLevel) return false;
      const sch = schools.find((s) => s.id === r.schoolId);
      if (!schoolMatchesDistrict(sch, reviewDistrict)) return false;
      if (reviewLevel === 'basica' && reviewBasicaScope !== 'all') {
        if (getBasicaScope(sch) !== reviewBasicaScope) return false;
      }
      if (reviewCenterType !== 'all' && !schoolMatchesCenterTypeFilter(sch, reviewCenterType)) {
        return false;
      }
      if (reviewStatus !== 'all' && r.status !== reviewStatus) return false;
      return true;
    });
  }, [yearPartesMensuales, reviewMonth, reviewDistrict, reviewLevel, reviewBasicaScope, reviewCenterType, reviewStatus, schools]);

  const filteredReviewMonthlies = useMemo(() => {
    return yearMonthlies.filter((r) => {
      if (r.month !== reviewMonth) return false;
      if (reviewLevel !== 'all' && r.level !== reviewLevel) return false;
      const sch = schools.find((s) => s.id === r.schoolId);
      if (!schoolMatchesDistrict(sch, reviewDistrict)) return false;
      if (reviewLevel === 'basica' && reviewBasicaScope !== 'all') {
        if (getBasicaScope(sch) !== reviewBasicaScope) return false;
      }
      if (reviewCenterType !== 'all' && !schoolMatchesCenterTypeFilter(sch, reviewCenterType)) {
        return false;
      }
      if (reviewStatus !== 'all' && r.status !== reviewStatus) return false;
      return true;
    });
  }, [yearMonthlies, reviewMonth, reviewDistrict, reviewLevel, reviewBasicaScope, reviewCenterType, reviewStatus, schools]);

  // Consolidated computation
  const availableConsSchools = useMemo(() => {
    return schools.filter((s) => {
      if (!schoolMatchesDistrict(s, consDistrict)) return false;
      if (!s.levels.includes(consLevel)) return false;
      if (consLevel === 'basica' && consBasicaScope !== 'c1_2_3') {
        if (!schoolMatchesBasicaScope(s, consBasicaScope)) return false;
      }
      if (consCenterType !== 'all' && !schoolMatchesCenterTypeFilter(s, consCenterType)) {
        return false;
      }
      return true;
    });
  }, [schools, consDistrict, consLevel, consBasicaScope, consCenterType]);

  const effectiveConsBasicaScope: BasicaScope | undefined = useMemo(() => {
    if (consLevel !== 'basica') return undefined;
    if (consBasicaScope !== 'c1_2_3') return consBasicaScope;
    if (consSchoolId !== 'all') {
      const found = schools.find((s) => s.id === consSchoolId);
      if (found) return getBasicaScope(found);
    }
    return 'c1_2_3';
  }, [consLevel, consBasicaScope, consSchoolId, schools]);

  const consolidatedAnnualSubset = useMemo(() => {
    return yearAnnuals.filter((r) => {
      if (r.level !== consLevel) return false;
      if (consScope === 'approved_only' && r.status !== 'approved') return false;
      if (consScope === 'submitted_and_approved' && r.status !== 'approved' && r.status !== 'submitted')
        return false;
      if (consSector !== 'all' && r.sector !== consSector) return false;
      const sch = schools.find((s) => s.id === r.schoolId);
      if (!schoolMatchesDistrict(sch, consDistrict)) return false;
      if (consCenterType !== 'all' && !schoolMatchesCenterTypeFilter(sch, consCenterType)) {
        return false;
      }
      if (consSchoolId !== 'all') {
        if (r.schoolId !== consSchoolId) return false;
      } else if (consLevel === 'basica' && consBasicaScope !== 'c1_2_3') {
        if (sch && !schoolMatchesBasicaScope(sch, consBasicaScope)) return false;
      }
      return true;
    });
  }, [yearAnnuals, consDistrict, consLevel, consBasicaScope, consCenterType, consScope, consSector, consSchoolId, schools]);

  const consolidatedParteMensualSubset = useMemo(() => {
    return yearPartesMensuales.filter((r) => {
      if (r.month !== consMonth || r.level !== consLevel) return false;
      if (consScope === 'approved_only' && r.status !== 'approved') return false;
      if (consScope === 'submitted_and_approved' && r.status !== 'approved' && r.status !== 'submitted')
        return false;
      const sch = schools.find((s) => s.id === r.schoolId);
      if (!schoolMatchesDistrict(sch, consDistrict)) return false;
      if (consCenterType !== 'all' && !schoolMatchesCenterTypeFilter(sch, consCenterType)) {
        return false;
      }
      if (consSchoolId !== 'all') {
        if (r.schoolId !== consSchoolId) return false;
      } else if (consLevel === 'basica' && consBasicaScope !== 'c1_2_3') {
        if (sch && !schoolMatchesBasicaScope(sch, consBasicaScope)) return false;
      }
      return true;
    });
  }, [yearPartesMensuales, consMonth, consDistrict, consLevel, consBasicaScope, consCenterType, consScope, consSchoolId, schools]);

  const consolidatedMonthlySubset = useMemo(() => {
    return yearMonthlies.filter((r) => {
      if (r.month !== consMonth || r.level !== consLevel) return false;
      if (consScope === 'approved_only' && r.status !== 'approved') return false;
      if (consScope === 'submitted_and_approved' && r.status !== 'approved' && r.status !== 'submitted')
        return false;
      const sch = schools.find((s) => s.id === r.schoolId);
      if (!schoolMatchesDistrict(sch, consDistrict)) return false;
      if (consCenterType !== 'all' && !schoolMatchesCenterTypeFilter(sch, consCenterType)) {
        return false;
      }
      if (consSchoolId !== 'all') {
        if (r.schoolId !== consSchoolId) return false;
      } else if (consLevel === 'basica' && consBasicaScope !== 'c1_2_3') {
        if (sch && !schoolMatchesBasicaScope(sch, consBasicaScope)) return false;
      }
      return true;
    });
  }, [yearMonthlies, consMonth, consDistrict, consLevel, consBasicaScope, consCenterType, consScope, consSchoolId, schools]);

  const consSchoolCount =
    consKind === 'annual'
      ? consolidatedAnnualSubset.length
      : consKind === 'parteMensual'
      ? consolidatedParteMensualSubset.length
      : consolidatedMonthlySubset.length;

  const consSchoolObj: School = useMemo(() => {
    if (consSchoolId !== 'all') {
      const found = schools.find((s) => s.id === consSchoolId);
      if (found) {
        return {
          ...found,
          ...(effectiveConsBasicaScope ? { basicaScope: effectiveConsBasicaScope } : {}),
        };
      }
    }
    const districtLabel =
      consDistrict === 'all'
        ? 'DISTRITAL'
        : consDistrict === 'unassigned'
        ? 'SIN DISTRITO'
        : getDistrictLabel(consDistrict).toUpperCase();
    const districtCodeLabel =
      consDistrict === 'all'
        ? 'CONSOLIDADO'
        : consDistrict === 'unassigned'
        ? 'SIN DISTRITO'
        : `DISTRITO ${consDistrict}`;
    const centerTypeSuffix =
      consCenterType !== 'all' ? ` · ${getCenterTypeFilterLabel(consCenterType)}` : '';
    return {
      id: 'distrito_18b',
      saceCode: districtCodeLabel,
      name: `CONSOLIDADO ${districtLabel}, OMOA${centerTypeSuffix} (${consSchoolCount} centros)`,
      community: 'Omoa, Cortés',
      levels: [consLevel],
      ...(effectiveConsBasicaScope ? { basicaScope: effectiveConsBasicaScope } : {}),
      sector: consSector === 'no_gubernamental' ? 'no_gubernamental' : 'gubernamental',
      modality: 'presencial',
      directorUid: profile.uid,
      directorDisplayName:
        consDistrict === '18'
          ? 'Dirección Distrital N° 18'
          : consDistrict === '18-B'
          ? 'Dirección Distrital N° 18-B'
          : 'Dirección Distrital',
      active: true,
    };
  }, [consSchoolId, schools, consSchoolCount, consDistrict, consLevel, effectiveConsBasicaScope, consCenterType, consSector, profile.uid]);

  const consolidatedBasicaData: BasicaAnnualData = useMemo(
    () => aggregateBasicaReports(consolidatedAnnualSubset),
    [consolidatedAnnualSubset]
  );
  const consolidatedMediaData: MediaAnnualData = useMemo(
    () => aggregateMediaReports(consolidatedAnnualSubset),
    [consolidatedAnnualSubset]
  );
  const consolidatedPrebasicaData: PrebasicaAnnualData = useMemo(
    () => aggregatePrebasicaReports(consolidatedAnnualSubset),
    [consolidatedAnnualSubset]
  );
  const consolidatedParteMensualData = useMemo(
    () =>
      aggregateParteMensualReports(
        consolidatedParteMensualSubset,
        consLevel,
        effectiveConsBasicaScope
      ),
    [consolidatedParteMensualSubset, consLevel, effectiveConsBasicaScope]
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">Dirección Distrital N° 18-B, Omoa</span>
          <span aria-hidden="true">·</span>
          <span>{schools.length} centros registrados</span>
          <span aria-hidden="true">·</span>
          <span>{pendingRequests.length} solicitudes pendientes</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {dlSavedBanner && (
            <span className="text-xs font-medium text-emerald-700">
              Fechas límite {year} guardadas
            </span>
          )}
          <button
            type="button"
            onClick={handleOpenDeadlinesModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap"
          >
            <CalendarClock className="w-3.5 h-3.5 text-blue-700" />
            Fechas límite de cuadros
          </button>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">Año Lectivo:</label>
            <select
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setDlSavedBanner(false);
              }}
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 bg-white"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {showDeadlinesModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deadlines-modal-title"
        >
          <div className="bg-white border border-slate-300 w-full max-w-lg shadow-lg">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-blue-700" />
                <h2
                  id="deadlines-modal-title"
                  className="font-display text-sm font-bold text-slate-900"
                >
                  Fechas Límite de Cuadros Estadísticos ({year})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowDeadlinesModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDeadlines} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Define la fecha y hora máxima de entrega distrital. Cuando falten menos de{' '}
                <strong>48 horas</strong>, el sistema alertará automáticamente a los directores que
                aún tengan cuadros pendientes o devueltos.
              </p>

              {/* Parte Mensual */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">1. Parte Mensual</span>
                  <button
                    type="button"
                    onClick={() => setDlParteDeadline(getDefaultMonthDeadlineStr(year, dlParteMonth))}
                    className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Usar fin de mes
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Mes evaluado
                    </label>
                    <select
                      value={dlParteMonth}
                      onChange={(e) => {
                        const nextMonth = Number(e.target.value);
                        if (dlParteDeadline === getDefaultMonthDeadlineStr(year, dlParteMonth)) {
                          setDlParteDeadline(getDefaultMonthDeadlineStr(year, nextMonth));
                        }
                        setDlParteMonth(nextMonth);
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-300 bg-white"
                    >
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Fecha y hora límite
                    </label>
                    <input
                      type="datetime-local"
                      value={dlParteDeadline}
                      onChange={(e) => setDlParteDeadline(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono border border-slate-300 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Movimientos-SACE */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">2. Movimientos-SACE Mensuales</span>
                  <button
                    type="button"
                    onClick={() => setDlMovDeadline(getDefaultMonthDeadlineStr(year, dlMovMonth))}
                    className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Usar fin de mes
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Mes evaluado
                    </label>
                    <select
                      value={dlMovMonth}
                      onChange={(e) => {
                        const nextMonth = Number(e.target.value);
                        if (dlMovDeadline === getDefaultMonthDeadlineStr(year, dlMovMonth)) {
                          setDlMovDeadline(getDefaultMonthDeadlineStr(year, nextMonth));
                        }
                        setDlMovMonth(nextMonth);
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-300 bg-white"
                    >
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Fecha y hora límite
                    </label>
                    <input
                      type="datetime-local"
                      value={dlMovDeadline}
                      onChange={(e) => setDlMovDeadline(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono border border-slate-300 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Cuadros Anuales */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">
                    3. Cuadros Estadísticos Anuales ({year})
                  </span>
                  <button
                    type="button"
                    onClick={() => setDlAnnualDeadline(`${year}-11-30T23:59`)}
                    className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Usar 30 nov
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Fecha y hora límite anual
                  </label>
                  <input
                    type="datetime-local"
                    value={dlAnnualDeadline}
                    onChange={(e) => setDlAnnualDeadline(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 bg-white"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Nota: Si dejas una fecha vacía, no se emitirá alerta automática de 48 horas para ese
                cuadro.
              </p>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeadlinesModal(false)}
                  className="px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-medium disabled:opacity-50 cursor-pointer"
                >
                  Guardar fechas límite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 1: OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          <ReportComplianceByLevelChart
            year={year}
            schools={schools}
            parteMensualReports={parteMensualReports}
            monthlyReports={monthlyReports}
            annualReports={annualReports}
            onOpenReviews={() => onSectionChange?.('reviews')}
          />

          <ActivityComplianceChart
            year={year}
            schools={schools}
            activities={activities}
            compliances={activityCompliances}
            deadlines={districtDeadlines}
            parteMensualReports={parteMensualReports}
            monthlyReports={monthlyReports}
            annualReports={annualReports}
            onOpenCompliance={() => onSectionChange?.('activities')}
          />

          <DistrictEnrollmentChart
            year={year}
            parteMensualReports={parteMensualReports}
          />

          <MonthlyComplianceWidget
            year={year}
            schools={schools}
            parteMensualReports={parteMensualReports}
            monthlyReports={monthlyReports}
            onInspectParteMensual={(rep) => {
              setReviewKind('parteMensual');
              setReviewMonth(rep.month);
              setInspectingParteMensual(rep);
              setInspectingMonthly(null);
              setInspectingAnnual(null);
              setReturnComment(rep.reviewComment || '');
              onSectionChange?.('reviews');
            }}
            onInspectMonthly={(rep) => {
              setReviewKind('monthly');
              setReviewMonth(rep.month);
              setInspectingMonthly(rep);
              setInspectingParteMensual(null);
              setInspectingAnnual(null);
              setReturnComment(rep.reviewComment || '');
              onSectionChange?.('reviews');
            }}
          />

          <div className="bg-white border border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Cumplimiento de Reportes Anuales por Centro ({year})
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                {yearAnnuals.filter((r) => r.status === 'submitted').length} pendientes de revisión
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Código SACE</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Centro Educativo</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Director(a)</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Prebásica</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Básica</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Media</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {schools.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Aún no hay centros educativos registrados. Regístralos en &ldquo;Centros y Directores&rdquo; o aprueba las solicitudes entrantes.
                      </td>
                    </tr>
                  ) : (
                    schools.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono text-slate-700">{s.saceCode}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{s.name}</td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {s.directorDisplayName || <span className="text-slate-400">Sin asignar</span>}
                        </td>
                        {(['prebasica', 'basica', 'media'] as EducationLevel[]).map((lvl) => {
                          if (!s.levels.includes(lvl)) {
                            return (
                              <td key={lvl} className="px-4 py-2.5 text-slate-300">
                                —
                              </td>
                            );
                          }
                          const rep = yearAnnuals.find(
                            (r) => r.schoolId === s.id && r.level === lvl
                          );
                          return (
                            <td key={lvl} className="px-4 py-2.5">
                              {rep ? (
                                <StatusText status={rep.status} />
                              ) : (
                                <span className="text-slate-400">Pendiente</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 p-5 space-y-1">
              <p className="text-xs text-slate-500">Centros Educativos</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {schools.length}
              </p>
              <p className="text-xs text-slate-500">
                {pendingRequests.length} directores por aprobar
              </p>
            </div>
            <div className="bg-white border border-slate-200 p-5 space-y-1">
              <p className="text-xs text-slate-500">Matrícula Final Prebásica</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {districtTotals.prebasica}
              </p>
              <p className="text-xs text-slate-500">Año {year}</p>
            </div>
            <div className="bg-white border border-slate-200 p-5 space-y-1">
              <p className="text-xs text-slate-500">Matrícula Final Básica</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {districtTotals.basica}
              </p>
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                I-II (1°-6°): {districtTotals.basicaC12} · III (7°-9°): {districtTotals.basicaC3}
              </p>
            </div>
            <div className="bg-white border border-slate-200 p-5 space-y-1">
              <p className="text-xs text-slate-500">Matrícula Final Media</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {districtTotals.media}
              </p>
              <p className="text-xs text-slate-500">10° a 12° Grado</p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1.5: STATISTICAL REPORTS EXPLORER */}
      {activeSection === 'statisticalReports' && (
        <StatisticalReportsExplorer
          year={year}
          schools={schools}
          parteMensualReports={parteMensualReports}
          monthlyReports={monthlyReports}
          annualReports={annualReports}
          onInspectParteMensual={(rep) => {
            setReviewKind('parteMensual');
            setReviewMonth(rep.month);
            setInspectingParteMensual(rep);
            setInspectingMonthly(null);
            setInspectingAnnual(null);
            setReturnComment(rep.reviewComment || '');
            onSectionChange?.('reviews');
          }}
          onInspectMonthly={(rep) => {
            setReviewKind('monthly');
            setReviewMonth(rep.month);
            setInspectingMonthly(rep);
            setInspectingParteMensual(null);
            setInspectingAnnual(null);
            setReturnComment(rep.reviewComment || '');
            onSectionChange?.('reviews');
          }}
          onInspectAnnual={(rep) => {
            setReviewKind('annual');
            setInspectingAnnual(rep);
            setInspectingParteMensual(null);
            setInspectingMonthly(null);
            setReturnComment(rep.reviewComment || '');
            onSectionChange?.('reviews');
          }}
        />
      )}

      {/* SECTION 2: SCHOOLS & DIRECTORS */}
      {activeSection === 'schools' && (
        <div className="space-y-6">
          {/* Pending Director Requests */}
          <div className="bg-white border border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-700" />
                Solicitudes de Vinculación de Directores ({pendingRequests.length} pendientes)
              </h2>
            </div>
            <div className="divide-y divide-slate-200">
              {pendingRequests.length === 0 ? (
                <p className="p-5 text-xs text-slate-500">
                  No hay solicitudes de directores pendientes de aprobación en este momento.
                </p>
              ) : (
                pendingRequests.map((req) => (
                  <div
                    key={req.uid}
                    className="p-5 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {req.displayName}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          · DNI <span className="font-mono">{req.dni}</span>
                          {req.directorPhone ? (
                            <>
                              {' '}
                              · Tel. <span className="font-mono">{req.directorPhone}</span>
                            </>
                          ) : null}{' '}
                          · {formatAccountIdentifier(req.email, req.proposedSaceCode)}
                        </span>
                      </p>
                      <p className="text-xs text-slate-700">
                        Solicita:{' '}
                        <strong>
                          {req.proposedSchoolName} ({req.proposedSaceCode})
                        </strong>{' '}
                        {req.proposedDistrict ? `· ${getDistrictLabel(req.proposedDistrict)} ` : ''}
                        · {req.proposedCommunity} ·{' '}
                        {req.proposedLevels
                          .map((l) => getSchoolLevelLabel(l, req.proposedBasicaScope))
                          .join(', ')}{' '}
                        {req.proposedLevels.includes('prebasica') && req.proposedPrebasicaType
                          ? `· Prebásica: ${normalizePrebasicaCenterType(req.proposedPrebasicaType) || req.proposedPrebasicaType} `
                          : ''}
                        {req.proposedLevels.includes('basica') &&
                        req.proposedBasicaScope === 'c1_2' &&
                        req.proposedBasicaType
                          ? `· Básica (1° a 6°): ${BASICA_CENTER_TYPE_LABELS[req.proposedBasicaType]} `
                          : ''}
                        ·{' '}
                        {req.requestType === 'new_school'
                          ? 'Centro nuevo propuesto'
                          : 'Centro existente'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {rejectingUid === req.uid ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Motivo del rechazo..."
                            className="px-2.5 py-1.5 text-xs border border-red-300 bg-white w-56"
                          />
                          <button
                            type="button"
                            disabled={actionBusy || !rejectReason.trim()}
                            onClick={() => handleRejectRequest(req)}
                            className="px-3 py-1.5 text-xs font-medium bg-red-700 hover:bg-red-800 text-white disabled:opacity-50 cursor-pointer"
                          >
                            Confirmar rechazo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingUid(null);
                              setRejectReason('');
                            }}
                            className="px-2.5 py-1.5 text-xs border border-slate-300 bg-white cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => {
                              setRejectingUid(req.uid);
                              setRejectReason('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer whitespace-nowrap"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Rechazar
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => handleApproveRequest(req)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Aprobar y vincular
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Schools Catalog */}
          <div className="bg-white border border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Catálogo Oficial de Centros Educativos ({filteredSchools.length})
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={schoolDistrictFilter}
                  onChange={(e) =>
                    setSchoolDistrictFilter(
                      e.target.value as 'all' | DistrictCode | 'unassigned'
                    )
                  }
                  className="px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                >
                  <option value="all">Todos los distritos</option>
                  {DISTRICT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  <option value="unassigned">Sin distrito asignado</option>
                </select>
                <select
                  value={schoolCenterTypeFilter}
                  onChange={(e) => setSchoolCenterTypeFilter(e.target.value as CenterTypeFilter)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                >
                  {CENTER_TYPE_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={schoolSearch}
                    onChange={(e) => setSchoolSearch(e.target.value)}
                    placeholder="Buscar centro o SACE..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 w-56"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewSchool((v) => !v);
                    setEditingSchoolId(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nuevo centro
                </button>
              </div>
            </div>

            {schoolCatalogBanner && (
              <div
                className={`px-5 py-3 border-b text-xs flex items-center justify-between gap-3 ${
                  schoolCatalogBanner.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <span>{schoolCatalogBanner.text}</span>
                <button
                  type="button"
                  onClick={() => setSchoolCatalogBanner(null)}
                  className="text-slate-500 hover:text-slate-800 cursor-pointer"
                  aria-label="Cerrar aviso"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {showNewSchool && (
              <form
                onSubmit={handleCreateSchool}
                className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nombre del Centro
                  </label>
                  <input
                    type="text"
                    required
                    value={newSchoolName}
                    onChange={(e) => setNewSchoolName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 bg-white"
                    placeholder="Ej. C.E.B. José Trinidad Reyes"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Código SACE
                  </label>
                  <input
                    type="text"
                    required
                    value={newSaceCode}
                    onChange={(e) => setNewSaceCode(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 bg-white"
                    placeholder="050300025B02"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Comunidad / Lugar
                  </label>
                  <input
                    type="text"
                    value={newCommunity}
                    onChange={(e) => setNewCommunity(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Distrito
                  </label>
                  <select
                    value={newDistrict}
                    onChange={(e) => setNewDistrict(e.target.value as DistrictCode)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                  >
                    {DISTRICT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Teléfono del Director
                  </label>
                  <input
                    type="tel"
                    maxLength={30}
                    value={newDirectorPhone}
                    onChange={(e) => setNewDirectorPhone(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 bg-white"
                    placeholder="Ej. 9988-7766"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Niveles</label>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {(['prebasica', 'basica', 'media'] as EducationLevel[]).map((lvl) => (
                      <label key={lvl} className="inline-flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={newLevels.includes(lvl)}
                          onChange={() =>
                            setNewLevels((prev) =>
                              prev.includes(lvl)
                                ? prev.length > 1
                                  ? prev.filter((i) => i !== lvl)
                                  : prev
                                : [...prev, lvl]
                            )
                          }
                        />
                        {LEVEL_LABELS[lvl]}
                      </label>
                    ))}
                  </div>
                  {newLevels.includes('prebasica') && (
                    <div className="mt-2.5">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Tipo de centro (Prebásica)
                      </label>
                      <select
                        value={newPrebasicaType}
                        onChange={(e) =>
                          setNewPrebasicaType(e.target.value as CanonicalPrebasicaCenterType)
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                      >
                        {PREBASICA_CENTER_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {newLevels.includes('basica') && (
                    <div className="mt-2.5 space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Subnivel de Básica
                        </label>
                        <select
                          value={newBasicaScope}
                          onChange={(e) => setNewBasicaScope(e.target.value as BasicaScope)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                        >
                          {(['c1_2', 'c3', 'c1_2_3'] as BasicaScope[]).map((sc) => (
                            <option key={sc} value={sc}>
                              Básica · {BASICA_SCOPE_LABELS[sc]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {newBasicaScope === 'c1_2' && (
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Tipo de centro (Básica de 1° a 6° grado)
                          </label>
                          <select
                            value={newBasicaType}
                            onChange={(e) =>
                              setNewBasicaType(e.target.value as CanonicalBasicaCenterType)
                            }
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                          >
                            {BASICA_CENTER_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {BASICA_CENTER_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Sector</label>
                    <select
                      value={newSector}
                      onChange={(e) => setNewSector(e.target.value as SectorType)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                    >
                      <option value="gubernamental">Gubernamental</option>
                      <option value="no_gubernamental">No Gubernamental</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Modalidad
                      </label>
                      <select
                        value={newModality}
                        onChange={(e) => setNewModality(e.target.value as ModalityType)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                      >
                        <option value="presencial">Presencial</option>
                        <option value="isemed">ISEMED</option>
                        <option value="acelerado">Acelerado</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="px-4 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              </form>
            )}

            {editingSchoolId && (
              <form
                onSubmit={handleUpdateSchool}
                className="p-5 bg-blue-50/50 border-b border-blue-200 grid grid-cols-1 sm:grid-cols-3 gap-4"
              >
                <div className="sm:col-span-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-900">
                    Editando centro educativo del catálogo
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingSchoolId(null)}
                    className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nombre del Centro
                  </label>
                  <input
                    type="text"
                    required
                    value={editSchoolName}
                    onChange={(e) => setEditSchoolName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Código SACE
                  </label>
                  <input
                    type="text"
                    required
                    value={editSaceCode}
                    onChange={(e) => setEditSaceCode(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Comunidad / Lugar
                  </label>
                  <input
                    type="text"
                    value={editCommunity}
                    onChange={(e) => setEditCommunity(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Distrito
                  </label>
                  <select
                    value={editDistrict}
                    onChange={(e) => setEditDistrict(e.target.value as DistrictCode | '')}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                  >
                    <option value="">Sin distrito asignado</option>
                    {DISTRICT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Teléfono del Director
                  </label>
                  <input
                    type="tel"
                    maxLength={30}
                    value={editDirectorPhone}
                    onChange={(e) => setEditDirectorPhone(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 bg-white"
                    placeholder="Ej. 9988-7766"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Niveles</label>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {(['prebasica', 'basica', 'media'] as EducationLevel[]).map((lvl) => (
                      <label key={lvl} className="inline-flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={editLevels.includes(lvl)}
                          onChange={() =>
                            setEditLevels((prev) =>
                              prev.includes(lvl)
                                ? prev.length > 1
                                  ? prev.filter((i) => i !== lvl)
                                  : prev
                                : [...prev, lvl]
                            )
                          }
                        />
                        {LEVEL_LABELS[lvl]}
                      </label>
                    ))}
                  </div>
                  {editLevels.includes('prebasica') && (
                    <div className="mt-2.5">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Tipo de centro (Prebásica)
                      </label>
                      <select
                        value={editPrebasicaType}
                        onChange={(e) =>
                          setEditPrebasicaType(e.target.value as CanonicalPrebasicaCenterType)
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                      >
                        {PREBASICA_CENTER_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {editLevels.includes('basica') && (
                    <div className="mt-2.5 space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Subnivel de Básica
                        </label>
                        <select
                          value={editBasicaScope}
                          onChange={(e) => setEditBasicaScope(e.target.value as BasicaScope)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                        >
                          {(['c1_2', 'c3', 'c1_2_3'] as BasicaScope[]).map((sc) => (
                            <option key={sc} value={sc}>
                              Básica · {BASICA_SCOPE_LABELS[sc]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {editBasicaScope === 'c1_2' && (
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Tipo de centro (Básica de 1° a 6° grado)
                          </label>
                          <select
                            value={editBasicaType}
                            onChange={(e) =>
                              setEditBasicaType(e.target.value as CanonicalBasicaCenterType)
                            }
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                          >
                            {BASICA_CENTER_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {BASICA_CENTER_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Sector</label>
                    <select
                      value={editSector}
                      onChange={(e) => setEditSector(e.target.value as SectorType)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                    >
                      <option value="gubernamental">Gubernamental</option>
                      <option value="no_gubernamental">No Gubernamental</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Modalidad
                      </label>
                      <select
                        value={editModality}
                        onChange={(e) => setEditModality(e.target.value as ModalityType)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
                      >
                        <option value="presencial">Presencial</option>
                        <option value="isemed">ISEMED</option>
                        <option value="acelerado">Acelerado</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="px-4 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
                    >
                      Actualizar
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left font-semibold">Código SACE</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Nombre del Centro</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Distrito</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Comunidad</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Niveles</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Tipo de Centro</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Director Asignado</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Teléfono</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Sector</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredSchools.map((s) => {
                    const typeSummary = getSchoolCenterTypesSummary(s);
                    const phone = schoolContacts[s.id]?.directorPhone;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono">{s.saceCode}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{s.name}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {s.district ? (
                            <span className="px-2 py-0.5 text-[11px] font-medium bg-blue-50 border border-blue-200 text-blue-800">
                              {getDistrictLabel(s.district)}
                            </span>
                          ) : (
                            <span className="text-slate-400">Sin asignar</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{s.community}</td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {s.levels.map((l) => getSchoolLevelLabel(l, s)).join(' · ')}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {typeSummary || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {s.directorDisplayName || <span className="text-slate-400">Sin director</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                          {phone || <span className="font-sans text-slate-400">Sin teléfono</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {s.sector === 'no_gubernamental' ? 'No Gubernamental' : 'Gubernamental'}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-3">
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => handleStartEditSchool(s)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline cursor-pointer disabled:opacity-50"
                            >
                              <Pencil className="w-3 h-3" />
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => {
                                setDeletingSchool(s);
                                setDeleteSchoolReportsToo(false);
                              }}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2B: USERS, BULK PROVISIONING & ASISTENTES TÉCNICOS */}
      {activeSection === 'users' && (
        <AdminUsersSection
          currentProfile={profile}
          users={users}
          schools={schools}
          activities={activities}
        />
      )}

      {/* SECTION 3: REVIEWS */}
      {activeSection === 'reviews' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 bg-slate-100">
              <button
                type="button"
                onClick={() => {
                  setReviewKind('parteMensual');
                  setInspectingAnnual(null);
                  setInspectingMonthly(null);
                  setEditingInspectedReport(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                  reviewKind === 'parteMensual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                Parte Mensual ({yearPartesMensuales.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setReviewKind('monthly');
                  setInspectingAnnual(null);
                  setInspectingParteMensual(null);
                  setEditingInspectedReport(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                  reviewKind === 'monthly' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Movimientos Mensuales ({yearMonthlies.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setReviewKind('annual');
                  setInspectingMonthly(null);
                  setInspectingParteMensual(null);
                  setEditingInspectedReport(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                  reviewKind === 'annual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Cuadros Anuales ({yearAnnuals.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              {(reviewKind === 'monthly' || reviewKind === 'parteMensual') && (
                <select
                  value={reviewMonth}
                  onChange={(e) => setReviewMonth(Number(e.target.value))}
                  className="px-2.5 py-1.5 border border-slate-300 bg-white"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={reviewDistrict}
                onChange={(e) =>
                  setReviewDistrict(e.target.value as 'all' | DistrictCode | 'unassigned')
                }
                aria-label="Filtrar por distrito escolar"
                className="px-2.5 py-1.5 border border-slate-300 bg-white"
              >
                <option value="all">Todos los distritos</option>
                {DISTRICT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value="unassigned">Sin distrito asignado</option>
              </select>
              <select
                value={reviewLevel}
                onChange={(e) => {
                  const lvl = e.target.value as 'all' | EducationLevel;
                  setReviewLevel(lvl);
                  if (lvl !== 'basica') setReviewBasicaScope('all');
                  if (lvl === 'media') {
                    setReviewCenterType('all');
                  } else if (lvl === 'prebasica' && reviewCenterType.startsWith('basica:')) {
                    setReviewCenterType('all');
                  } else if (lvl === 'basica' && reviewCenterType.startsWith('prebasica:')) {
                    setReviewCenterType('all');
                  }
                }}
                className="px-2.5 py-1.5 border border-slate-300 bg-white"
              >
                <option value="all">Todos los niveles</option>
                <option value="prebasica">Prebásica</option>
                <option value="basica">Básica</option>
                <option value="media">Media</option>
              </select>
              {reviewLevel === 'basica' && (
                <select
                  value={reviewBasicaScope}
                  onChange={(e) => {
                    const sc = e.target.value as 'all' | BasicaScope;
                    setReviewBasicaScope(sc);
                    if (sc === 'c3' || sc === 'c1_2_3') {
                      setReviewCenterType('all');
                    }
                  }}
                  className="px-2.5 py-1.5 border border-slate-300 bg-white"
                >
                  <option value="all">Todos los subniveles de Básica</option>
                  {(['c1_2', 'c3', 'c1_2_3'] as BasicaScope[]).map((sc) => (
                    <option key={sc} value={sc}>
                      {BASICA_SCOPE_LABELS[sc]}
                    </option>
                  ))}
                </select>
              )}
              {reviewLevel !== 'media' &&
                !(reviewLevel === 'basica' && (reviewBasicaScope === 'c3' || reviewBasicaScope === 'c1_2_3')) && (
                  <select
                    value={reviewCenterType}
                    onChange={(e) => setReviewCenterType(e.target.value as CenterTypeFilter)}
                    className="px-2.5 py-1.5 border border-slate-300 bg-white"
                  >
                    {CENTER_TYPE_FILTER_OPTIONS.filter((opt) => {
                      if (opt.value === 'all') return true;
                      if (reviewLevel === 'prebasica') return opt.value.startsWith('prebasica:');
                      if (reviewLevel === 'basica') return opt.value.startsWith('basica:');
                      return true;
                    }).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              <select
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as 'all' | ReportStatus)}
                className="px-2.5 py-1.5 border border-slate-300 bg-white"
              >
                <option value="all">Todos los estados</option>
                <option value="submitted">Enviados a revisión</option>
                <option value="approved">Aprobados</option>
                <option value="returned">Devueltos</option>
                <option value="draft">Borradores</option>
              </select>
            </div>
          </div>

          {/* Inspection panel */}
          {(inspectingAnnual || inspectingParteMensual || inspectingMonthly) && (
            <div className="bg-white border border-blue-300 p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <p className="text-xs text-blue-700 font-semibold">
                    Inspección de Reporte Distrital
                  </p>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    {inspectingAnnual
                      ? `${inspectingAnnual.schoolName} · Anual ${getSchoolLevelLabel(
                          inspectingAnnual.level,
                          schools.find((s) => s.id === inspectingAnnual.schoolId)
                        )}`
                      : inspectingParteMensual
                      ? `${inspectingParteMensual.schoolName} · Parte Mensual ${
                          MONTHS.find((m) => m.value === inspectingParteMensual.month)?.label
                        } ${getSchoolLevelLabel(
                          inspectingParteMensual.level,
                          schools.find((s) => s.id === inspectingParteMensual.schoolId)
                        )}`
                      : `${inspectingMonthly?.schoolName} · ${
                          MONTHS.find((m) => m.value === inspectingMonthly?.month)?.label
                        } ${getSchoolLevelLabel(
                          inspectingMonthly!.level,
                          schools.find((s) => s.id === inspectingMonthly!.schoolId)
                        )}`}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingInspectedReport((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border cursor-pointer whitespace-nowrap ${
                      editingInspectedReport
                        ? 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800'
                        : 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
                    }`}
                  >
                    {editingInspectedReport ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Bloquear edición (solo lectura)
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3.5 h-3.5" />
                        Habilitar edición
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectingAnnual(null);
                      setInspectingParteMensual(null);
                      setInspectingMonthly(null);
                      setEditingInspectedReport(false);
                    }}
                    className="px-3 py-1.5 text-xs border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                  >
                    Cerrar inspección
                  </button>
                </div>
              </div>

              {editingInspectedReport && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2">
                  <Pencil className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Modo de edición habilitado</p>
                    <p className="mt-0.5 text-blue-800">
                      Puedes modificar los datos del cuadro si es necesario. Usa{' '}
                      <strong>Guardar cambios</strong> dentro del cuadro antes de aprobar o devolver,
                      o presiona <strong>Guardar y aprobar</strong> directamente.
                    </p>
                  </div>
                </div>
              )}

              {inspectingAnnual && (() => {
                const matchedSchool = schools.find((s) => s.id === inspectingAnnual.schoolId);
                const resolvedSchool: School = matchedSchool
                  ? {
                      ...matchedSchool,
                      directorUid: inspectingAnnual.directorUid || matchedSchool.directorUid,
                      directorDisplayName:
                        inspectingAnnual.directorName || matchedSchool.directorDisplayName,
                    }
                  : {
                      id: inspectingAnnual.schoolId,
                      saceCode: inspectingAnnual.saceCode,
                      name: inspectingAnnual.schoolName,
                      community: inspectingAnnual.community,
                      levels: [inspectingAnnual.level],
                      sector: inspectingAnnual.sector,
                      modality: inspectingAnnual.modality,
                      directorUid: inspectingAnnual.directorUid,
                      directorDisplayName: inspectingAnnual.directorName,
                      active: true,
                    };

                return (
                  <>
                    {inspectingAnnual.level === 'basica' && (
                      <BasicaAnnualEditor
                        key={inspectingAnnual.id}
                        year={inspectingAnnual.year}
                        basicaScope={getBasicaScope(resolvedSchool)}
                        school={resolvedSchool}
                        profile={profile}
                        readOnly={!editingInspectedReport}
                        reviewMode
                        prefetchedReport={inspectingAnnual}
                        prefetchedLoaded
                        prefetchedParteMensualReports={parteMensualReports}
                      />
                    )}
                    {inspectingAnnual.level === 'media' && (
                      <MediaAnnualEditor
                        key={inspectingAnnual.id}
                        year={inspectingAnnual.year}
                        school={resolvedSchool}
                        profile={profile}
                        readOnly={!editingInspectedReport}
                        reviewMode
                        prefetchedReport={inspectingAnnual}
                        prefetchedLoaded
                        prefetchedParteMensualReports={parteMensualReports}
                      />
                    )}
                    {inspectingAnnual.level === 'prebasica' && (
                      <PrebasicaAnnualEditor
                        key={inspectingAnnual.id}
                        year={inspectingAnnual.year}
                        school={resolvedSchool}
                        profile={profile}
                        readOnly={!editingInspectedReport}
                        reviewMode
                        prefetchedReport={inspectingAnnual}
                        prefetchedLoaded
                        prefetchedParteMensualReports={parteMensualReports}
                      />
                    )}
                  </>
                );
              })()}

              {inspectingParteMensual && (() => {
                const matchedSchool = schools.find(
                  (s) => s.id === inspectingParteMensual.schoolId
                );
                const resolvedSchool: School = matchedSchool
                  ? {
                      ...matchedSchool,
                      community:
                        inspectingParteMensual.lugar || matchedSchool.community || 'Omoa',
                      directorUid:
                        inspectingParteMensual.directorUid || matchedSchool.directorUid,
                      directorDisplayName:
                        inspectingParteMensual.directorName || matchedSchool.directorDisplayName,
                    }
                  : {
                      id: inspectingParteMensual.schoolId,
                      saceCode: inspectingParteMensual.saceCode,
                      name: inspectingParteMensual.schoolName,
                      community: inspectingParteMensual.lugar || 'Omoa',
                      levels: [inspectingParteMensual.level],
                      sector: 'gubernamental',
                      modality: 'presencial',
                      directorUid: inspectingParteMensual.directorUid,
                      directorDisplayName: inspectingParteMensual.directorName,
                      active: true,
                    };

                return (
                  <ParteMensualEditor
                    key={inspectingParteMensual.id}
                    year={inspectingParteMensual.year}
                    month={inspectingParteMensual.month}
                    level={inspectingParteMensual.level}
                    basicaScope={
                      inspectingParteMensual.level === 'basica'
                        ? getBasicaScope(resolvedSchool)
                        : undefined
                    }
                    school={resolvedSchool}
                    profile={profile}
                    readOnly={!editingInspectedReport}
                    reviewMode
                    prefetchedReport={inspectingParteMensual}
                    prefetchedLoaded
                    prefetchedParteMensualReports={parteMensualReports}
                  />
                );
              })()}

              {inspectingMonthly && (() => {
                const matchedSchool = schools.find((s) => s.id === inspectingMonthly.schoolId);
                const resolvedSchool: School = matchedSchool
                  ? {
                      ...matchedSchool,
                      directorUid: inspectingMonthly.directorUid || matchedSchool.directorUid,
                      directorDisplayName:
                        inspectingMonthly.directorName || matchedSchool.directorDisplayName,
                    }
                  : {
                      id: inspectingMonthly.schoolId,
                      saceCode: inspectingMonthly.saceCode,
                      name: inspectingMonthly.schoolName,
                      community: 'Omoa',
                      levels: [inspectingMonthly.level],
                      sector: 'gubernamental',
                      modality: 'presencial',
                      directorUid: inspectingMonthly.directorUid,
                      directorDisplayName: inspectingMonthly.directorName,
                      active: true,
                    };

                return (
                  <MovimientosSaceEditor
                    key={inspectingMonthly.id}
                    year={inspectingMonthly.year}
                    month={inspectingMonthly.month}
                    level={inspectingMonthly.level}
                    school={resolvedSchool}
                    profile={profile}
                    readOnly={!editingInspectedReport}
                    reviewMode
                    prefetchedReport={inspectingMonthly}
                    prefetchedLoaded
                  />
                );
              })()}

              <div className="pt-4 border-t border-slate-200 space-y-3">
                {editingInspectedReport && (
                  <p className="text-[11px] text-blue-800">
                    Si realizaste modificaciones en los campos del cuadro, recuerda presionar{' '}
                    <strong>Guardar cambios</strong> dentro del cuadro antes de usar las acciones
                    de aprobación o devolución.
                  </p>
                )}
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex-1 min-w-[260px]">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Observaciones para devolver al director (requerido si se devuelve)
                    </label>
                    <input
                      type="text"
                      value={returnComment}
                      onChange={(e) => setReturnComment(e.target.value)}
                      placeholder="Ej. Revisar Matrícula Final de 4° grado, no coincide con edades."
                      className="w-full px-3 py-2 text-xs border border-slate-300"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={actionBusy || !returnComment.trim()}
                      onClick={() =>
                        handleReviewDecision(
                          inspectingAnnual
                            ? 'annual'
                            : inspectingParteMensual
                            ? 'parteMensual'
                            : 'monthly',
                          inspectingAnnual
                            ? inspectingAnnual.id
                            : inspectingParteMensual
                            ? inspectingParteMensual.id
                            : inspectingMonthly!.id,
                          'returned'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Devolver con observaciones
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() =>
                        handleReviewDecision(
                          inspectingAnnual
                            ? 'annual'
                            : inspectingParteMensual
                            ? 'parteMensual'
                            : 'monthly',
                          inspectingAnnual
                            ? inspectingAnnual.id
                            : inspectingParteMensual
                            ? inspectingParteMensual.id
                            : inspectingMonthly!.id,
                          'approved'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Aprobar reporte
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Review list table */}
          <div className="bg-white border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left font-semibold">Código SACE</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Centro Educativo</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Nivel</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Director</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Estado</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {reviewKind === 'annual' ? (
                  filteredReviewAnnuals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No hay reportes anuales que coincidan con el filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    filteredReviewAnnuals.map((rep) => {
                      const sch = schools.find((s) => s.id === rep.schoolId);
                      const typeSummary = sch ? getSchoolCenterTypesSummary(sch) : '';
                      return (
                        <tr key={rep.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-mono">{rep.saceCode}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-900">{rep.schoolName}</p>
                            {typeSummary && (
                              <p className="text-[11px] text-slate-500">{typeSummary}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {getSchoolLevelLabel(rep.level, sch)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{rep.directorName}</td>
                          <td className="px-4 py-2.5">
                            <StatusText status={rep.status} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setInspectingAnnual(rep);
                                setInspectingParteMensual(null);
                                setInspectingMonthly(null);
                                setEditingInspectedReport(false);
                                setReturnComment(rep.reviewComment || '');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 cursor-pointer whitespace-nowrap"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Inspeccionar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )
                ) : reviewKind === 'parteMensual' ? (
                  filteredReviewPartes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No hay reportes de Parte Mensual para este mes y filtro.
                      </td>
                    </tr>
                  ) : (
                    filteredReviewPartes.map((rep) => {
                      const sch = schools.find((s) => s.id === rep.schoolId);
                      const typeSummary = sch ? getSchoolCenterTypesSummary(sch) : '';
                      return (
                        <tr key={rep.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-mono">{rep.saceCode}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-900">{rep.schoolName}</p>
                            {typeSummary && (
                              <p className="text-[11px] text-slate-500">{typeSummary}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {getSchoolLevelLabel(rep.level, sch)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{rep.directorName}</td>
                          <td className="px-4 py-2.5">
                            <StatusText status={rep.status} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setInspectingParteMensual(rep);
                                setInspectingAnnual(null);
                                setInspectingMonthly(null);
                                setEditingInspectedReport(false);
                                setReturnComment(rep.reviewComment || '');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 cursor-pointer whitespace-nowrap"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Inspeccionar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )
                ) : filteredReviewMonthlies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No hay reportes mensuales para este mes y filtro.
                    </td>
                  </tr>
                ) : (
                  filteredReviewMonthlies.map((rep) => {
                    const sch = schools.find((s) => s.id === rep.schoolId);
                    const typeSummary = sch ? getSchoolCenterTypesSummary(sch) : '';
                    return (
                    <tr key={rep.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono">{rep.saceCode}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{rep.schoolName}</p>
                        {typeSummary && (
                          <p className="text-[11px] text-slate-500">{typeSummary}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {getSchoolLevelLabel(rep.level, sch)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{rep.directorName}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusText status={rep.status} />
                          {rep.noMovements && (
                            <span className="text-[11px] font-medium text-slate-500">
                              · Sin movimientos SACE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setInspectingMonthly(rep);
                            setInspectingParteMensual(null);
                            setInspectingAnnual(null);
                            setEditingInspectedReport(false);
                            setReturnComment(rep.reviewComment || '');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Inspeccionar
                        </button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3.4: UPLOAD SCHOOL REPORTS BY ADMIN/ASSISTANT */}
      {activeSection === 'upload' && (
        <AdminSchoolReportUpload
          year={year}
          profile={profile}
          schools={schools}
          parteMensualReports={parteMensualReports}
          monthlyReports={monthlyReports}
          annualReports={annualReports}
          reportsLoaded={
            yearReportsLoaded.parte && yearReportsLoaded.monthly && yearReportsLoaded.annual
          }
          onGoToSchools={() => onSectionChange?.('schools')}
        />
      )}

      {/* SECTION 3.5: ACTIVITIES & COMPLIANCE CONTROL */}
      {activeSection === 'activities' && (
        <ActivityComplianceAdmin
          year={year}
          schools={schools}
          users={users}
          profile={profile}
          activities={activities}
          compliances={activityCompliances}
          deadlines={districtDeadlines}
          parteMensualReports={parteMensualReports}
          monthlyReports={monthlyReports}
          annualReports={annualReports}
          onDeadlinesSaved={() => setDlSavedBanner(true)}
          onOpenReview={(target) => {
            setReviewKind(target.kind);
            if (target.month) {
              setReviewMonth(target.month);
            }
            setReviewStatus('all');
            setEditingInspectedReport(false);

            if (target.schoolId) {
              if (target.kind === 'parteMensual') {
                const candidates = parteMensualReports.filter(
                  (r) =>
                    r.year === year &&
                    r.schoolId === target.schoolId &&
                    (!target.month || r.month === target.month)
                );
                const match =
                  candidates.find((r) => r.status === 'submitted') ?? candidates[0] ?? null;
                setInspectingParteMensual(match);
                setInspectingMonthly(null);
                setInspectingAnnual(null);
                setReturnComment(match?.reviewComment || '');
              } else if (target.kind === 'monthly') {
                const candidates = monthlyReports.filter(
                  (r) =>
                    r.year === year &&
                    r.schoolId === target.schoolId &&
                    (!target.month || r.month === target.month)
                );
                const match =
                  candidates.find((r) => r.status === 'submitted') ?? candidates[0] ?? null;
                setInspectingMonthly(match);
                setInspectingParteMensual(null);
                setInspectingAnnual(null);
                setReturnComment(match?.reviewComment || '');
              } else {
                const candidates = annualReports.filter(
                  (r) => r.year === year && r.schoolId === target.schoolId
                );
                const match =
                  candidates.find((r) => r.status === 'submitted') ?? candidates[0] ?? null;
                setInspectingAnnual(match);
                setInspectingParteMensual(null);
                setInspectingMonthly(null);
                setReturnComment(match?.reviewComment || '');
              }
            } else {
              setInspectingParteMensual(null);
              setInspectingMonthly(null);
              setInspectingAnnual(null);
              setReturnComment('');
            }
            onSectionChange?.('reviews');
          }}
        />
      )}

      {/* SECTION 4: CONSOLIDATED EXCEL & PDF */}
      {activeSection === 'consolidated' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Generador de Cuadros Consolidados del Distrito N° 18-B
                </h2>
                <p className="text-xs text-slate-600">
                  Suma automáticamente las estadísticas de los centros filtrados y genera el archivo oficial en Excel (.xlsx) y PDF.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100">
                <button
                  type="button"
                  onClick={() => setConsKind('parteMensual')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    consKind === 'parteMensual'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Parte Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setConsKind('monthly')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    consKind === 'monthly' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Movimientos Mensuales
                </button>
                <button
                  type="button"
                  onClick={() => setConsKind('annual')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    consKind === 'annual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Cuadros Anuales
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 pt-2 border-t border-slate-200 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Distrito Escolar</label>
                <select
                  value={consDistrict}
                  onChange={(e) => {
                    setConsDistrict(e.target.value as 'all' | DistrictCode | 'unassigned');
                    setConsSchoolId('all');
                  }}
                  className="w-full px-2.5 py-2 border border-slate-300 bg-white"
                >
                  <option value="all">Todos los distritos</option>
                  {DISTRICT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  <option value="unassigned">Sin distrito asignado</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Nivel Educativo</label>
                <select
                  value={consLevel}
                  onChange={(e) => {
                    const nextLevel = e.target.value as EducationLevel;
                    setConsLevel(nextLevel);
                    setConsCenterType('all');
                    setConsSchoolId('all');
                  }}
                  className="w-full px-2.5 py-2 border border-slate-300 bg-white"
                >
                  <option value="prebasica">Prebásica</option>
                  <option value="basica">Básica</option>
                  <option value="media">Media</option>
                </select>
              </div>

              {consLevel === 'basica' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Subnivel de Básica
                  </label>
                  <select
                    value={consBasicaScope}
                    onChange={(e) => {
                      const nextScope = e.target.value as BasicaScope;
                      setConsBasicaScope(nextScope);
                      if (nextScope !== 'c1_2') setConsCenterType('all');
                      setConsSchoolId('all');
                    }}
                    className="w-full px-2.5 py-2 border border-slate-300 bg-white"
                  >
                    <option value="c1_2">Básica de 1° a 6° (I y II Ciclo)</option>
                    <option value="c1_2_3">Básica de 1° a 9° (I, II y III Ciclo)</option>
                  </select>
                </div>
              )}

              {(consLevel === 'prebasica' ||
                (consLevel === 'basica' && consBasicaScope === 'c1_2')) && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Tipo de centro
                  </label>
                  <select
                    value={consCenterType}
                    onChange={(e) => {
                      setConsCenterType(e.target.value as CenterTypeFilter);
                      setConsSchoolId('all');
                    }}
                    className="w-full px-2.5 py-2 border border-slate-300 bg-white"
                  >
                    {CENTER_TYPE_FILTER_OPTIONS.filter((opt) => {
                      if (opt.value === 'all') return true;
                      if (consLevel === 'prebasica') return opt.value.startsWith('prebasica:');
                      return opt.value.startsWith('basica:');
                    }).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.value === 'all'
                          ? 'Todos los tipos'
                          : opt.label.replace(/^Prebásica · |^Básica \(1° a 6°\) · /, '')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(consKind === 'monthly' || consKind === 'parteMensual') && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Mes</label>
                  <select
                    value={clampSchoolMonth(consMonth)}
                    onChange={(e) => setConsMonth(Number(e.target.value))}
                    className="w-full px-2.5 py-2 border border-slate-300 bg-white"
                  >
                    {SCHOOL_MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Alcance de validación</label>
                <select
                  value={consScope}
                  onChange={(e) =>
                    setConsScope(e.target.value as 'approved_only' | 'submitted_and_approved')
                  }
                  className="w-full px-2.5 py-2 border border-slate-300 bg-white"
                >
                  <option value="submitted_and_approved">Enviados y Aprobados</option>
                  <option value="approved_only">Solo Aprobados</option>
                </select>
              </div>

              {consKind === 'annual' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Sector</label>
                  <select
                    value={consSector}
                    onChange={(e) => setConsSector(e.target.value as 'all' | SectorType)}
                    className="w-full px-2.5 py-2 border border-slate-300 bg-white"
                  >
                    <option value="all">Todos los sectores</option>
                    <option value="gubernamental">Gubernamental</option>
                    <option value="no_gubernamental">No Gubernamental</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Centro Educativo</label>
                <select
                  value={consSchoolId}
                  onChange={(e) => setConsSchoolId(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 bg-white"
                >
                  <option value="all">
                    {consDistrict === 'all'
                      ? 'Todos los distritos'
                      : consDistrict === 'unassigned'
                      ? 'Todos (sin distrito)'
                      : `Todo el ${getDistrictLabel(consDistrict)}`}
                  </option>
                  {availableConsSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {consKind === 'parteMensual' ? (
            consolidatedParteMensualSubset.length === 0 ? (
              <div className="bg-white border border-slate-200 p-8 text-center text-xs text-slate-500">
                No hay reportes de Parte Mensual de{' '}
                {getSchoolLevelLabel(consLevel, effectiveConsBasicaScope)} para{' '}
                {MONTHS.find((m) => m.value === consMonth)?.label} {year} con el filtro seleccionado.
              </div>
            ) : (
              <ParteMensualEditor
                year={year}
                month={consMonth}
                level={consLevel}
                basicaScope={effectiveConsBasicaScope}
                school={consSchoolObj}
                profile={profile}
                readOnly
                isConsolidated={consSchoolId === 'all'}
                externalAggregate={consolidatedParteMensualData}
              />
            )
          ) : consKind === 'annual' ? (
            consolidatedAnnualSubset.length === 0 ? (
              <div className="bg-white border border-slate-200 p-8 text-center text-xs text-slate-500">
                No hay reportes anuales de{' '}
                {getSchoolLevelLabel(consLevel, effectiveConsBasicaScope)} con el filtro
                seleccionado para consolidar.
              </div>
            ) : consLevel === 'basica' ? (
              <BasicaAnnualEditor
                year={year}
                basicaScope={effectiveConsBasicaScope}
                school={consSchoolObj}
                profile={profile}
                readOnly
                isConsolidated={consSchoolId === 'all'}
                externalData={consolidatedBasicaData}
              />
            ) : consLevel === 'media' ? (
              <MediaAnnualEditor
                year={year}
                school={consSchoolObj}
                profile={profile}
                readOnly
                isConsolidated={consSchoolId === 'all'}
                externalData={consolidatedMediaData}
              />
            ) : (
              <PrebasicaAnnualEditor
                year={year}
                school={consSchoolObj}
                profile={profile}
                readOnly
                isConsolidated={consSchoolId === 'all'}
                externalData={consolidatedPrebasicaData}
              />
            )
          ) : (
            <div className="bg-white border border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Consolidado Mensual Movimientos-SACE ·{' '}
                    {getSchoolLevelLabel(consLevel, effectiveConsBasicaScope)} ·{' '}
                    {MONTHS.find((m) => m.value === consMonth)?.label} {year}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {consolidatedMonthlySubset.length} centros incluidos (
                    {consolidatedMonthlySubset.filter((r) => r.noMovements).length} sin movimientos
                    SACE) ·{' '}
                    {consolidatedMonthlySubset.reduce((s, r) => s + (r.ingresos?.length || 0), 0)}{' '}
                    ingresos ·{' '}
                    {consolidatedMonthlySubset.reduce((s, r) => s + (r.traslados?.length || 0), 0)}{' '}
                    traslados ·{' '}
                    {consolidatedMonthlySubset.reduce((s, r) => s + (r.desertores?.length || 0), 0)}{' '}
                    desertores
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={consolidatedMonthlySubset.length === 0}
                    onClick={() =>
                      exportMonthlyReportExcel(consolidatedMonthlySubset, {
                        year,
                        month: consMonth,
                        level: consLevel,
                        basicaScope: effectiveConsBasicaScope,
                        schoolName: consSchoolObj.name,
                        saceCode: consSchoolObj.saceCode,
                        community: 'Omoa, Cortés',
                        isConsolidated: consSchoolId === 'all',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    Descargar Excel
                  </button>
                  <button
                    type="button"
                    disabled={consolidatedMonthlySubset.length === 0}
                    onClick={() =>
                      exportMonthlyReportPdf(consolidatedMonthlySubset, {
                        year,
                        month: consMonth,
                        level: consLevel,
                        basicaScope: effectiveConsBasicaScope,
                        schoolName: consSchoolObj.name,
                        saceCode: consSchoolObj.saceCode,
                        community: 'Omoa, Cortés',
                        isConsolidated: consSchoolId === 'all',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-red-700" />
                    Descargar PDF
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {deletingSchool && (() => {
        const linkedUsersCount = users.filter((u) => u.schoolId === deletingSchool.id).length;
        const linkedAnnualCount = annualReports.filter((r) => r.schoolId === deletingSchool.id).length;
        const linkedParteCount = parteMensualReports.filter((r) => r.schoolId === deletingSchool.id).length;
        const linkedMonthlyCount = monthlyReports.filter((r) => r.schoolId === deletingSchool.id).length;
        const linkedComplianceCount = activityCompliances.filter(
          (c) => c.schoolId === deletingSchool.id
        ).length;
        const linkedReportsTotal =
          linkedAnnualCount + linkedParteCount + linkedMonthlyCount + linkedComplianceCount;

        return (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 max-w-md w-full p-5 space-y-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 bg-red-50 border border-red-200 text-red-700 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Eliminar centro del catálogo oficial
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Esta acción eliminará el centro educativo de forma permanente.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setDeletingSchool(null)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 text-xs space-y-1">
                <p className="font-semibold text-slate-900">{deletingSchool.name}</p>
                <p className="text-slate-600">
                  Código SACE: <span className="font-mono">{deletingSchool.saceCode}</span> ·{' '}
                  {deletingSchool.community || 'Omoa'}
                </p>
                {deletingSchool.directorDisplayName && (
                  <p className="text-slate-600">
                    Director asignado: {deletingSchool.directorDisplayName}
                  </p>
                )}
              </div>

              {linkedUsersCount > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5">
                  Hay {linkedUsersCount} usuario(s) vinculado(s) a este centro; quedarán sin centro asignado para poder vincularse a otro centro.
                </p>
              )}

              <label className="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteSchoolReportsToo}
                  onChange={(e) => setDeleteSchoolReportsToo(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Eliminar también todos los reportes y cumplimientos históricos asociados a este
                  centro
                  {linkedReportsTotal > 0
                    ? ` (${linkedReportsTotal} en ${year}: ${linkedParteCount} parte(s) mensual(es), ${linkedMonthlyCount} movimiento(s), ${linkedAnnualCount} cuadro(s) anual(es), ${linkedComplianceCount} cumplimiento(s))`
                    : ' (incluyendo años anteriores)'}
                  .
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setDeletingSchool(null)}
                  className="px-3.5 py-1.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleConfirmDeleteSchool}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-red-700 hover:bg-red-800 text-white cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {actionBusy ? 'Eliminando...' : 'Sí, eliminar centro'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

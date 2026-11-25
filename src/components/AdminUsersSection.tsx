import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardPaste,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AdminPosition,
  DistrictActivity,
  School,
  UserProfile,
  UserRole,
} from '../types/sace';
import {
  PRIMARY_ADMIN_EMAIL,
  formatAccountIdentifier,
  getAdminPositionLabel,
  normalizeSaceCodeForAuth,
} from '../utils/saceCalculations';
import {
  type BulkProvisionRowResult,
  type BulkUserAccountType,
  type BulkUserDraftRow,
  createSingleAdminOrAssistantAccount,
  downloadBulkUsersTemplateExcel,
  parseBulkPasteText,
  parseBulkUsersFile,
  provisionBulkUsersWithDefaultPassword,
} from '../utils/adminUserProvisioning';

interface AdminUsersSectionProps {
  currentProfile: UserProfile;
  users: UserProfile[];
  schools: School[];
  activities: DistrictActivity[];
}

type UsersSubTab = 'list' | 'assistant' | 'bulk';

const createEmptyBulkRow = (): BulkUserDraftRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  identifier: '',
  password: '',
  displayName: '',
  dni: '',
  schoolName: '',
  community: 'Omoa',
});

export function AdminUsersSection({
  currentProfile,
  users,
  schools,
}: AdminUsersSectionProps) {
  const [subTab, setSubTab] = useState<UsersSubTab>('list');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'admin' | 'asistente_tecnico' | 'director' | 'pending'
  >('all');
  const [actionBusy, setActionBusy] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Edit user modal state
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editDni, setEditDni] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('director');
  const [editAdminPosition, setEditAdminPosition] = useState<AdminPosition>('asistente_tecnico');
  const [editSchoolId, setEditSchoolId] = useState('');
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  // Create Asistente Técnico state
  const [asstName, setAsstName] = useState('');
  const [asstIdentifier, setAsstIdentifier] = useState('');
  const [asstDni, setAsstDni] = useState('');
  const [asstPosition, setAsstPosition] = useState<AdminPosition>('asistente_tecnico');
  const [asstPassword, setAsstPassword] = useState('Distrito18B*');
  const [showAsstPassword, setShowAsstPassword] = useState(false);
  const [createdAssistantReceipt, setCreatedAssistantReceipt] = useState<{
    displayName: string;
    identifier: string;
    password: string;
    position: AdminPosition;
  } | null>(null);

  // Bulk user creation state
  const [bulkAccountType, setBulkAccountType] = useState<BulkUserAccountType>('director');
  const [bulkDefaultPassword, setBulkDefaultPassword] = useState('Sace2026*');
  const [showBulkPassword, setShowBulkPassword] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkUserDraftRow[]>([createEmptyBulkRow()]);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkProvisionRowResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stats = useMemo(() => {
    const admins = users.filter((u) => u.role === 'admin');
    const assistants = admins.filter((u) => u.adminPosition === 'asistente_tecnico');
    const directors = users.filter((u) => u.role === 'director');
    const pending = users.filter((u) => u.role === 'pending');
    return {
      total: users.length,
      admins: admins.length,
      assistants: assistants.length,
      directors: directors.length,
      pending: pending.length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => {
        if (roleFilter === 'admin' && u.role !== 'admin') return false;
        if (
          roleFilter === 'asistente_tecnico' &&
          !(u.role === 'admin' && u.adminPosition === 'asistente_tecnico')
        ) {
          return false;
        }
        if (roleFilter === 'director' && u.role !== 'director') return false;
        if (roleFilter === 'pending' && u.role !== 'pending') return false;
        if (!q) return true;
        return (
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.saceCode || '').toLowerCase().includes(q) ||
          (u.dni || '').toLowerCase().includes(q) ||
          (u.schoolName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const order: Record<UserRole, number> = { admin: 0, director: 1, pending: 2 };
        if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
        return a.displayName.localeCompare(b.displayName);
      });
  }, [users, search, roleFilter]);

  const schoolsWithoutAccount = useMemo(() => {
    const linkedSchoolIds = new Set(
      users.filter((u) => u.role === 'director' && u.schoolId).map((u) => u.schoolId)
    );
    const linkedSaceCodes = new Set(
      users
        .map((u) => normalizeSaceCodeForAuth(u.saceCode || ''))
        .filter(Boolean)
    );
    return schools.filter(
      (s) =>
        !linkedSchoolIds.has(s.id) &&
        !linkedSaceCodes.has(normalizeSaceCodeForAuth(s.saceCode || ''))
    );
  }, [schools, users]);

  const openEditUser = (u: UserProfile) => {
    setEditingUser(u);
    setEditName(u.displayName);
    setEditDni(u.dni || '');
    setEditRole(u.role);
    setEditAdminPosition(u.adminPosition || 'asistente_tecnico');
    setEditSchoolId(u.schoolId || '');
    setBanner(null);
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const isTargetPrimary =
      editingUser.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
    const effectiveRole: UserRole = isTargetPrimary ? 'admin' : editRole;

    if (effectiveRole === 'director' && !editSchoolId) {
      setBanner({
        type: 'err',
        text: 'Selecciona el centro educativo que se vinculará al director.',
      });
      return;
    }

    setActionBusy(true);
    setBanner(null);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', editingUser.uid);
      const adminRef = doc(db, 'admins', editingUser.uid);
      const cleanName = editName.trim().slice(0, 160) || editingUser.displayName;
      const cleanDni = editDni.trim().slice(0, 30);

      let nextSchoolId = '';
      let nextSchoolName = '';
      let nextSaceCode = editingUser.saceCode || '';

      if (effectiveRole === 'director') {
        const chosenSchool = schools.find((s) => s.id === editSchoolId);
        if (chosenSchool) {
          nextSchoolId = chosenSchool.id;
          nextSchoolName = chosenSchool.name;
          nextSaceCode = chosenSchool.saceCode;
          batch.update(doc(db, 'schools', chosenSchool.id), {
            directorUid: editingUser.uid,
            directorDisplayName: cleanName,
            updatedAt: serverTimestamp(),
          });
        }
      } else if (editingUser.role === 'director' && editingUser.schoolId) {
        const prevSchool = schools.find((s) => s.id === editingUser.schoolId);
        if (prevSchool && prevSchool.directorUid === editingUser.uid) {
          batch.update(doc(db, 'schools', prevSchool.id), {
            directorUid: '',
            directorDisplayName: '',
            updatedAt: serverTimestamp(),
          });
        }
      }

      if (effectiveRole === 'admin') {
        const positionToSave: AdminPosition = isTargetPrimary
          ? 'administrador'
          : editAdminPosition;
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists()) {
          batch.update(adminRef, {
            email: editingUser.email,
            displayName: cleanName,
            position: positionToSave,
          });
        } else {
          batch.set(adminRef, {
            uid: editingUser.uid,
            email: editingUser.email,
            displayName: cleanName,
            position: positionToSave,
            addedBy: currentProfile.uid,
            createdAt: serverTimestamp(),
          });
        }
        batch.update(userRef, {
          displayName: cleanName,
          dni: cleanDni,
          role: 'admin',
          adminPosition: positionToSave,
          needsOnboarding: false,
          schoolId: '',
          schoolName: '',
          saceCode: nextSaceCode,
          updatedAt: serverTimestamp(),
        });
      } else {
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists() && editingUser.uid !== currentProfile.uid) {
          batch.delete(adminRef);
        }
        batch.update(userRef, {
          displayName: cleanName,
          dni: cleanDni,
          role: effectiveRole,
          adminPosition: 'administrador',
          needsOnboarding:
            effectiveRole === 'pending' ? Boolean(editingUser.needsOnboarding) : false,
          schoolId: nextSchoolId,
          schoolName: nextSchoolName,
          saceCode: nextSaceCode,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setEditingUser(null);
      setBanner({
        type: 'ok',
        text: `Perfil de ${cleanName} actualizado correctamente.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingUser.uid}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteUserProfile = async (u: UserProfile) => {
    if (
      u.uid === currentProfile.uid ||
      u.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()
    ) {
      return;
    }
    setActionBusy(true);
    setBanner(null);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', u.uid));

      const adminSnap = await getDoc(doc(db, 'admins', u.uid));
      if (adminSnap.exists()) {
        batch.delete(doc(db, 'admins', u.uid));
      }

      if (u.schoolId) {
        const sch = schools.find((s) => s.id === u.schoolId);
        if (sch && sch.directorUid === u.uid) {
          batch.update(doc(db, 'schools', sch.id), {
            directorUid: '',
            directorDisplayName: '',
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      setConfirmDeleteUid(null);
      setBanner({
        type: 'ok',
        text: `Acceso de "${u.displayName}" eliminado de la plataforma.`,
      });
    } catch (err) {
      await deleteDoc(doc(db, 'users', u.uid)).catch(() => {});
      handleFirestoreError(err, OperationType.DELETE, `users/${u.uid}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    setCreatedAssistantReceipt(null);

    if (asstName.trim().length < 2) {
      setBanner({ type: 'err', text: 'Ingresa el nombre completo del Asistente Técnico.' });
      return;
    }
    if (asstIdentifier.trim().length < 2) {
      setBanner({
        type: 'err',
        text: 'Ingresa un correo electrónico o código de usuario institucional.',
      });
      return;
    }
    if (asstPassword.length < 6) {
      setBanner({
        type: 'err',
        text: 'La contraseña debe tener al menos 6 caracteres.',
      });
      return;
    }

    setActionBusy(true);
    try {
      const created = await createSingleAdminOrAssistantAccount({
        identifier: asstIdentifier,
        password: asstPassword,
        displayName: asstName,
        dni: asstDni,
        position: asstPosition,
        adminUid: currentProfile.uid,
      });

      const shownIdentifier = created.storedCode || created.email;
      setCreatedAssistantReceipt({
        displayName: asstName.trim(),
        identifier: shownIdentifier,
        password: asstPassword,
        position: asstPosition,
      });
      setBanner({
        type: 'ok',
        text: `${getAdminPositionLabel(asstPosition)} "${asstName.trim()}" creado con acceso de administrador.`,
      });
      setAsstName('');
      setAsstIdentifier('');
      setAsstDni('');
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo crear la cuenta.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleLoadUnassignedSchools = () => {
    setBulkAccountType('director');
    setBulkResults(null);
    if (schoolsWithoutAccount.length === 0) {
      setBanner({
        type: 'ok',
        text: 'Todos los centros del catálogo ya tienen una cuenta vinculada.',
      });
      return;
    }
    setBulkRows(
      schoolsWithoutAccount.map((s) => ({
        id: `sch-${s.id}`,
        identifier: s.saceCode,
        password: '',
        displayName: '',
        dni: '',
        schoolName: s.name,
        community: s.community || 'Omoa',
      }))
    );
    setBanner({
      type: 'ok',
      text: `Se cargaron ${schoolsWithoutAccount.length} Código(s) SACE de centros sin cuenta desde el catálogo.`,
    });
  };

  const handleApplyPaste = () => {
    const parsed = parseBulkPasteText(pasteText, bulkAccountType);
    if (parsed.length === 0) {
      setBanner({
        type: 'err',
        text: 'No se detectaron filas válidas en el texto pegado.',
      });
      return;
    }
    setBulkRows((prev) => {
      const hasOnlyBlank =
        prev.length === 1 &&
        !prev[0].identifier.trim() &&
        !prev[0].displayName.trim() &&
        !(prev[0].password || '').trim();
      return hasOnlyBlank ? parsed : [...prev, ...parsed];
    });
    setPasteText('');
    setShowPasteBox(false);
    setBulkResults(null);
    setBanner({
      type: 'ok',
      text: `Se agregaron ${parsed.length} fila(s) a la tabla de carga masiva.`,
    });
  };

  const handleImportBulkFile = async (file: File | null | undefined) => {
    if (!file) return;
    setBanner(null);
    try {
      const parsed = await parseBulkUsersFile(file, bulkAccountType);
      if (parsed.length === 0) {
        setBanner({
          type: 'err',
          text: 'El archivo no contiene filas válidas para importar.',
        });
        return;
      }
      setBulkRows(parsed);
      setBulkResults(null);
      setBanner({
        type: 'ok',
        text: `Se importaron ${parsed.length} fila(s) desde "${file.name}". Revisa la tabla y pulsa Crear usuarios.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text:
          err instanceof Error
            ? `No se pudo leer el archivo: ${err.message}`
            : 'Error al leer el archivo.',
      });
    }
  };

  const handleRunBulkCreation = async () => {
    setBanner(null);
    const nonEmptyRows = bulkRows.filter((r) =>
      bulkAccountType === 'director'
        ? r.identifier.trim() || (r.password || '').trim()
        : r.identifier.trim() || r.displayName.trim()
    );
    if (nonEmptyRows.length === 0) {
      setBanner({
        type: 'err',
        text: 'Agrega al menos una fila con datos válidos antes de ejecutar la creación masiva.',
      });
      return;
    }
    const needsBatchDefault = nonEmptyRows.some((r) => !(r.password || '').trim());
    if (needsBatchDefault && bulkDefaultPassword.trim().length < 6) {
      setBanner({
        type: 'err',
        text: 'Ingresa una contraseña predeterminada de al menos 6 caracteres (o especifica contraseña en cada fila).',
      });
      return;
    }

    setBulkRunning(true);
    setBulkResults(null);
    setBulkProgress({ done: 0, total: nonEmptyRows.length });
    try {
      const results = await provisionBulkUsersWithDefaultPassword({
        rows: nonEmptyRows,
        accountType: bulkAccountType,
        defaultPassword: bulkDefaultPassword,
        existingSchools: schools,
        existingUsers: users,
        adminUid: currentProfile.uid,
        onProgress: (done, total) => setBulkProgress({ done, total }),
      });

      setBulkResults(results);
      const createdCount = results.filter((r) => r.status === 'created').length;
      const errorCount = results.length - createdCount;
      setBanner({
        type: errorCount === 0 ? 'ok' : 'err',
        text: `Proceso finalizado: ${createdCount} usuario(s) creado(s)${
          errorCount > 0 ? ` y ${errorCount} fila(s) con error.` : '.'
        }`,
      });
    } finally {
      setBulkRunning(false);
      setBulkProgress(null);
    }
  };

  const updateBulkRow = (id: string, field: keyof BulkUserDraftRow, value: string) => {
    setBulkRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Total de Usuarios</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {stats.total}
          </p>
          <p className="text-xs text-slate-500">Cuentas registradas en Distrito 18-B</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Equipo Administrador</p>
          <p className="font-mono text-2xl font-bold text-blue-700 tabular-nums">
            {stats.admins}
          </p>
          <p className="text-xs text-slate-500">
            {stats.assistants} Asistente(s) Técnico(s)
          </p>
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Directores Activos</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {stats.directors}
          </p>
          <p className="text-xs text-slate-500">
            {schoolsWithoutAccount.length} centro(s) sin cuenta
          </p>
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Pendientes de Vincular</p>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums">
            {stats.pending}
          </p>
          <p className="text-xs text-slate-500">Esperando aprobación o centro</p>
        </div>
      </div>

      {/* Sub-tabs header */}
      <div className="bg-white border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100">
          <button
            type="button"
            onClick={() => {
              setSubTab('list');
              setBanner(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium cursor-pointer whitespace-nowrap ${
              subTab === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Directorio de Usuarios ({users.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('assistant');
              setBanner(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium cursor-pointer whitespace-nowrap ${
              subTab === 'assistant' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Crear Asistente Técnico (Admin)
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('bulk');
              setBanner(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium cursor-pointer whitespace-nowrap ${
              subTab === 'bulk' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Creación Masiva de Usuarios
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          Los Asistentes Técnicos de la Dirección Distrital operan con permisos completos de Administrador.
        </p>
      </div>

      {banner && (
        <div
          className={`p-3.5 border text-xs flex items-center gap-2 ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {banner.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-700 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* TAB 1: DIRECTORY & USER ADMINISTRATION */}
      {subTab === 'list' && (
        <div className="bg-white border border-slate-200">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-700" />
              Administración de Usuarios del Distrito
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nombre, correo, SACE o DNI..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 w-64"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) =>
                  setRoleFilter(
                    e.target.value as
                      | 'all'
                      | 'admin'
                      | 'asistente_tecnico'
                      | 'director'
                      | 'pending'
                  )
                }
                className="px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
              >
                <option value="all">Todos los roles ({users.length})</option>
                <option value="admin">Todos los Administradores ({stats.admins})</option>
                <option value="asistente_tecnico">
                  Asistentes Técnicos ({stats.assistants})
                </option>
                <option value="director">Directores ({stats.directors})</option>
                <option value="pending">Pendientes ({stats.pending})</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left font-semibold">Nombre / DNI</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Acceso</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Rol / Cargo</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Centro Educativo</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No se encontraron usuarios con el filtro aplicado.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.uid === currentProfile.uid;
                    const isPrimary =
                      u.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
                    return (
                      <tr key={u.uid} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-900">
                            {u.displayName || (
                              <span className="italic text-slate-500">
                                Director (primer ingreso pendiente)
                              </span>
                            )}{' '}
                            {isSelf && (
                              <span className="text-[11px] font-normal text-blue-700">
                                (Tú)
                              </span>
                            )}
                          </p>
                          {u.dni && (
                            <p className="text-[11px] font-mono text-slate-500">
                              DNI: {u.dni}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 font-mono text-[11px]">
                          {formatAccountIdentifier(u.email, u.saceCode, u.role)}
                        </td>
                        <td className="px-4 py-2.5">
                          {u.role === 'admin' ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium border ${
                                u.adminPosition === 'asistente_tecnico'
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                                  : 'bg-blue-50 border-blue-200 text-blue-800'
                              }`}
                            >
                              <ShieldCheck className="w-3 h-3" />
                              {getAdminPositionLabel(u.adminPosition)}
                            </span>
                          ) : u.role === 'director' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-emerald-50 border border-emerald-200 text-emerald-800">
                              <UserCheck className="w-3 h-3" />
                              Director de Centro
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-amber-50 border border-amber-200 text-amber-800">
                              {u.needsOnboarding ? 'Primer ingreso pendiente' : 'Pendiente'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {u.schoolName ? (
                            <div>
                              <p className="font-medium text-slate-800">{u.schoolName}</p>
                              {u.saceCode && (
                                <p className="text-[11px] font-mono text-slate-500">
                                  {u.saceCode}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">
                              {u.role === 'admin' ? 'Dirección Distrital 18-B' : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => openEditUser(u)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline cursor-pointer disabled:opacity-50"
                            >
                              <Pencil className="w-3 h-3" />
                              Editar
                            </button>
                            {!isSelf && !isPrimary && (
                              confirmDeleteUid === u.uid ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={actionBusy}
                                    onClick={() => handleDeleteUserProfile(u)}
                                    className="px-2 py-0.5 text-[11px] font-medium bg-red-700 text-white cursor-pointer"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUid(null)}
                                    className="px-2 py-0.5 text-[11px] border border-slate-300 bg-white cursor-pointer"
                                  >
                                    No
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => setConfirmDeleteUid(u.uid)}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline cursor-pointer disabled:opacity-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Eliminar
                                </button>
                              )
                            )}
                          </div>
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

      {/* TAB 2: CREATE ASISTENTE TÉCNICO (ADMIN) */}
      {subTab === 'assistant' && (
        <div className="bg-white border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70">
            <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-700" />
              Nueva cuenta de Asistente Técnico de la Dirección Distrital
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Los Asistentes Técnicos se registran automáticamente con rol de{' '}
              <strong>Administrador</strong> para revisar cuadros, gestionar fechas límite, validar cumplimiento y exportar consolidados sin cerrar tu sesión actual.
            </p>
          </div>

          <form onSubmit={handleCreateAssistant} className="p-6 space-y-5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nombre completo del Asistente Técnico *
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={asstName}
                  onChange={(e) => setAsstName(e.target.value)}
                  placeholder="Ej. Lic. Carlos Eduardo Méndez"
                  className="w-full px-3 py-2 text-sm border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Correo electrónico o Usuario institucional *
                </label>
                <input
                  type="text"
                  required
                  maxLength={254}
                  value={asstIdentifier}
                  onChange={(e) => setAsstIdentifier(e.target.value)}
                  placeholder="Ej. carlos.mendez@educatrachos.hn o AT-18B-01"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Puedes ingresar un correo electrónico o un código de usuario corto (sin espacios).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  N° de Identidad (DNI)
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={asstDni}
                  onChange={(e) => setAsstDni(e.target.value)}
                  placeholder="0501-1988-00987"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Cargo Administrativo *
                </label>
                <select
                  value={asstPosition}
                  onChange={(e) => setAsstPosition(e.target.value as AdminPosition)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                >
                  <option value="asistente_tecnico">
                    Asistente Técnico Distrital (Administrador)
                  </option>
                  <option value="administrador">Administrador Distrital</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Contraseña inicial (mín. 6 caracteres) *
                </label>
                <div className="relative">
                  <input
                    type={showAsstPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={asstPassword}
                    onChange={(e) => setAsstPassword(e.target.value)}
                    className="w-full px-3 pr-10 py-2 text-sm font-mono border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAsstPassword((v) => !v)}
                    aria-label={showAsstPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showAsstPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <p className="text-[11px] text-slate-500">
                El Asistente Técnico iniciará sesión desde la pantalla principal ingresando su correo o usuario y esta contraseña.
              </p>
              <button
                type="submit"
                disabled={actionBusy}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4" />
                {actionBusy ? 'Creando cuenta...' : 'Crear cuenta de Asistente Técnico'}
              </button>
            </div>
          </form>

          {createdAssistantReceipt && (
            <div className="mx-6 mb-6 p-4 bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1.5">
              <p className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-700" />
                Credenciales listas para entregar al usuario:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <p>
                  Nombre: <strong>{createdAssistantReceipt.displayName}</strong>
                </p>
                <p>
                  Usuario / Correo:{' '}
                  <strong className="font-mono">{createdAssistantReceipt.identifier}</strong>
                </p>
                <p>
                  Contraseña:{' '}
                  <strong className="font-mono">{createdAssistantReceipt.password}</strong>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BULK USER CREATION */}
      {subTab === 'bulk' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 p-5 space-y-5 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-700" />
                  Creación Masiva de Usuarios
                </h2>
                <p className="text-slate-600 mt-1">
                  {bulkAccountType === 'director'
                    ? 'Para Directores, solo se sube el Código SACE y la contraseña (por fila o predeterminada). El director guardará su nombre completo, DNI, teléfono, comunidad y niveles que atiende al ingresar por primera vez.'
                    : 'Crea múltiples cuentas de Asistente Técnico en un solo lote con contraseña individual o predeterminada.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadBulkUsersTemplateExcel(bulkAccountType)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  Descargar plantilla (.xlsx)
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportBulkFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={bulkRunning}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-blue-700 bg-white hover:bg-blue-50 text-blue-700 font-medium cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Importar Excel / CSV
                </button>
              </div>
            </div>

            {/* Batch Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Tipo de usuarios del lote *
                </label>
                <select
                  value={bulkAccountType}
                  disabled={bulkRunning}
                  onChange={(e) => {
                    setBulkAccountType(e.target.value as BulkUserAccountType);
                    setBulkResults(null);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 bg-white"
                >
                  <option value="director">
                    Directores de Centros (Código SACE)
                  </option>
                  <option value="asistente_tecnico">
                    Asistentes Técnicos Distritales (Administrador)
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Contraseña predeterminada (si la fila no indica una)
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type={showBulkPassword ? 'text' : 'password'}
                    minLength={6}
                    disabled={bulkRunning}
                    value={bulkDefaultPassword}
                    onChange={(e) => setBulkDefaultPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-8 pr-9 py-2 text-xs font-mono border border-slate-300 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBulkPassword((v) => !v)}
                    aria-label={showBulkPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showBulkPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-col justify-end">
                {bulkAccountType === 'director' ? (
                  <p className="text-[11px] text-slate-600 pb-1">
                    Al ingresar por primera vez, el director completará su <strong>nombre completo</strong>, <strong>DNI</strong>, <strong>teléfono</strong>, <strong>comunidad</strong> y <strong>niveles que atiende</strong>.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-600 pb-1">
                    Todas las cuentas creadas recibirán privilegios completos de{' '}
                    <strong>Administrador Distrital (Asistente Técnico)</strong>.
                  </p>
                )}
              </div>
            </div>

            {/* Quick actions for populating table */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {bulkAccountType === 'director' && (
                  <button
                    type="button"
                    disabled={bulkRunning}
                    onClick={handleLoadUnassignedSchools}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-medium cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Cargar códigos SACE sin cuenta ({schoolsWithoutAccount.length})
                  </button>
                )}
                <button
                  type="button"
                  disabled={bulkRunning}
                  onClick={() => setShowPasteBox((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-blue-700" />
                  Pegar desde Excel / CSV
                </button>
                <button
                  type="button"
                  disabled={bulkRunning}
                  onClick={() => setBulkRows((prev) => [...prev, createEmptyBulkRow()])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar fila
                </button>
              </div>

              {bulkRows.length > 1 && (
                <button
                  type="button"
                  disabled={bulkRunning}
                  onClick={() => {
                    setBulkRows([createEmptyBulkRow()]);
                    setBulkResults(null);
                  }}
                  className="text-xs text-slate-500 hover:text-red-700 cursor-pointer"
                >
                  Limpiar tabla
                </button>
              )}
            </div>

            {showPasteBox && (
              <div className="p-4 bg-slate-50 border border-slate-200 space-y-2.5">
                <p className="font-medium text-slate-800">
                  Pega una línea por usuario separada por coma, punto y coma o tabulación desde Excel:
                </p>
                <p className="text-[11px] font-mono text-slate-500">
                  {bulkAccountType === 'director'
                    ? 'Formato: CODIGO_SACE, CONTRASEÑA (si omites la contraseña usará la predeterminada)'
                    : 'Formato: CORREO_O_USUARIO, NOMBRE_COMPLETO, DNI, CONTRASEÑA'}
                </p>
                <textarea
                  rows={5}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={
                    bulkAccountType === 'director'
                      ? '050300012B02, Sace2026*\n050300045P01, ClaveCentro02'
                      : 'asistente1@educatrachos.hn, Lic. Carlos Méndez, 0501-1988-00987, Distrito18B*'
                  }
                  className="w-full p-2.5 font-mono text-xs border border-slate-300 bg-white"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasteBox(false)}
                    className="px-3 py-1.5 border border-slate-300 bg-white text-slate-700 cursor-pointer"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyPaste}
                    className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-medium cursor-pointer"
                  >
                    Cargar filas a la tabla
                  </button>
                </div>
              </div>
            )}

            {/* Editable Grid */}
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold w-10">#</th>
                    <th className="px-3 py-2 text-left font-semibold min-w-[180px]">
                      {bulkAccountType === 'director'
                        ? 'Código SACE *'
                        : 'Correo o Usuario *'}
                    </th>
                    {bulkAccountType === 'asistente_tecnico' && (
                      <>
                        <th className="px-3 py-2 text-left font-semibold min-w-[200px]">
                          Nombre completo *
                        </th>
                        <th className="px-3 py-2 text-left font-semibold min-w-[140px]">DNI</th>
                      </>
                    )}
                    <th className="px-3 py-2 text-left font-semibold min-w-[200px]">
                      Contraseña {bulkAccountType === 'director' ? '*' : '(opcional)'}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold w-16">Quitar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bulkRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-1.5 font-mono text-slate-500">{idx + 1}</td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          disabled={bulkRunning}
                          value={row.identifier}
                          onChange={(e) => updateBulkRow(row.id, 'identifier', e.target.value)}
                          placeholder={
                            bulkAccountType === 'director'
                              ? '050300012B02'
                              : 'asistente@correo.hn o AT-18B'
                          }
                          className="w-full px-2 py-1 font-mono border border-slate-300 bg-white"
                        />
                      </td>
                      {bulkAccountType === 'asistente_tecnico' && (
                        <>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              disabled={bulkRunning}
                              value={row.displayName}
                              onChange={(e) =>
                                updateBulkRow(row.id, 'displayName', e.target.value)
                              }
                              placeholder="Nombre completo"
                              className="w-full px-2 py-1 border border-slate-300 bg-white"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              disabled={bulkRunning}
                              value={row.dni}
                              onChange={(e) => updateBulkRow(row.id, 'dni', e.target.value)}
                              placeholder="0501-1985-00123"
                              className="w-full px-2 py-1 font-mono border border-slate-300 bg-white"
                            />
                          </td>
                        </>
                      )}
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          disabled={bulkRunning}
                          value={row.password || ''}
                          onChange={(e) => updateBulkRow(row.id, 'password', e.target.value)}
                          placeholder={
                            bulkDefaultPassword
                              ? `Predeterminada: ${bulkDefaultPassword}`
                              : 'Mínimo 6 caracteres'
                          }
                          className="w-full px-2 py-1 font-mono border border-slate-300 bg-white"
                        />
                      </td>
                      <td className="px-3 py-1 text-right">
                        <button
                          type="button"
                          disabled={bulkRunning || bulkRows.length === 1}
                          onClick={() =>
                            setBulkRows((prev) => prev.filter((item) => item.id !== row.id))
                          }
                          aria-label="Eliminar fila"
                          className="p-1 text-slate-400 hover:text-red-700 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Submit Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div className="text-[11px] text-slate-600">
                {bulkProgress ? (
                  <span className="font-medium text-blue-800">
                    Creando cuentas... {bulkProgress.done} de {bulkProgress.total}
                  </span>
                ) : (
                  <span>
                    Se crearán{' '}
                    <strong className="font-mono">
                      {
                        bulkRows.filter((r) =>
                          bulkAccountType === 'director'
                            ? r.identifier.trim() || (r.password || '').trim()
                            : r.identifier.trim() || r.displayName.trim()
                        ).length
                      }
                    </strong>{' '}
                    usuario(s). Las filas sin contraseña usarán la predeterminada.
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={bulkRunning}
                onClick={handleRunBulkCreation}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {bulkRunning ? 'Procesando lote...' : 'Crear usuarios masivamente'}
              </button>
            </div>
          </div>

          {/* Bulk Results Summary */}
          {bulkResults && (
            <div className="bg-white border border-slate-200">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Resultado de la Creación Masiva ({bulkResults.length} procesados)
                </h3>
                <span className="text-xs font-mono text-slate-600">
                  Creados: {bulkResults.filter((r) => r.status === 'created').length} · Errores:{' '}
                  {bulkResults.filter((r) => r.status === 'error').length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2 text-left font-semibold">Usuario / SACE</th>
                      <th className="px-4 py-2 text-left font-semibold">
                        {bulkAccountType === 'director' ? 'Centro / Perfil' : 'Nombre'}
                      </th>
                      <th className="px-4 py-2 text-left font-semibold">Estado</th>
                      <th className="px-4 py-2 text-left font-semibold">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bulkResults.map((res) => (
                      <tr key={res.rowId}>
                        <td className="px-4 py-2 font-mono">{res.identifier}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">{res.displayName}</td>
                        <td className="px-4 py-2">
                          {res.status === 'created' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Creado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Error
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{res.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-300 w-full max-w-lg shadow-lg">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Editar Usuario y Permisos
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUserEdit} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 text-slate-700">
                Acceso:{' '}
                <strong className="font-mono">
                  {formatAccountIdentifier(
                    editingUser.email,
                    editingUser.saceCode,
                    editingUser.role
                  )}
                </strong>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">DNI</label>
                  <input
                    type="text"
                    maxLength={30}
                    value={editDni}
                    onChange={(e) => setEditDni(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono border border-slate-300 bg-white"
                  />
                </div>
              </div>

              {editingUser.uid !== currentProfile.uid &&
                editingUser.email.toLowerCase() !== PRIMARY_ADMIN_EMAIL.toLowerCase() && (
                  <>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Rol en el sistema *
                      </label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as UserRole)}
                        className="w-full px-3 py-1.5 border border-slate-300 bg-white"
                      >
                        <option value="director">Director de Centro Educativo</option>
                        <option value="admin">
                          Administrador / Asistente Técnico Distrital
                        </option>
                        <option value="pending">Pendiente de aprobación</option>
                      </select>
                    </div>

                    {editRole === 'admin' && (
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Cargo administrativo
                        </label>
                        <select
                          value={editAdminPosition}
                          onChange={(e) =>
                            setEditAdminPosition(e.target.value as AdminPosition)
                          }
                          className="w-full px-3 py-1.5 border border-slate-300 bg-white"
                        >
                          <option value="asistente_tecnico">
                            Asistente Técnico de la Dirección Distrital
                          </option>
                          <option value="administrador">Administrador Distrital</option>
                        </select>
                      </div>
                    )}

                    {editRole === 'director' && (
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Centro Educativo asignado *
                        </label>
                        <select
                          required
                          value={editSchoolId}
                          onChange={(e) => setEditSchoolId(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-300 bg-white"
                        >
                          <option value="">Selecciona un centro educativo...</option>
                          {schools.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.saceCode})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3.5 py-2 border border-slate-300 bg-white text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-medium disabled:opacity-50 cursor-pointer"
                >
                  {actionBusy ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

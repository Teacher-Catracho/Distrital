import ExcelJS from 'exceljs';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  initializeAuth,
  inMemoryPersistence,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, resolvedFirebaseConfig } from '../firebase';
import type {
  AdminPosition,
  DistrictActivity,
  School,
  UserProfile,
} from '../types/sace';
import {
  isValidEmailAddress,
  normalizeSaceCodeForAuth,
  saceCodeToAuthEmail,
} from './saceCalculations';

export type BulkUserAccountType = 'director' | 'asistente_tecnico';

export interface BulkUserDraftRow {
  id: string;
  identifier: string; // Código SACE for director, or Email/Username for asistente_tecnico
  password?: string; // Contraseña específica de la fila (opcional si hay contraseña predeterminada)
  displayName: string;
  dni: string;
  schoolName: string;
  community: string;
}

export interface BulkProvisionRowResult {
  rowId: string;
  identifier: string;
  displayName: string;
  authIdentifier: string;
  status: 'created' | 'error';
  message: string;
  schoolAction?: 'linked_existing' | 'created_school' | 'none';
}

export function mapProvisionAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  switch (code) {
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Habilita el proveedor "Correo electrónico/contraseña" en Firebase Console (Authentication → Sign-in method).';
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta registrada con este identificador / correo.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'El correo o código de acceso tiene un formato inválido.';
    case 'auth/too-many-requests':
      return 'Demasiadas solicitudes seguidas. Espera un momento e intenta nuevamente.';
    case 'auth/network-request-failed':
      return 'Error de red al conectar con Firebase Authentication.';
    default:
      return err instanceof Error ? err.message : 'No se pudo crear la cuenta.';
  }
}

export function resolveLoginIdentifierToAuth(
  rawIdentifier: string,
  accountType: BulkUserAccountType
): {
  ok: true;
  authEmail: string;
  storedCode: string;
  loginDisplay: string;
} | {
  ok: false;
  error: string;
} {
  const trimmed = rawIdentifier.trim();
  if (!trimmed) {
    return {
      ok: false,
      error:
        accountType === 'director'
          ? 'Falta el Código SACE.'
          : 'Falta el correo electrónico o usuario de acceso.',
    };
  }

  if (trimmed.includes('@')) {
    if (accountType === 'director') {
      return {
        ok: false,
        error: 'Ingresa únicamente el Código SACE del centro educativo (no correo electrónico).',
      };
    }
    const email = trimmed.toLowerCase().slice(0, 254);
    if (!isValidEmailAddress(email)) {
      return { ok: false, error: 'El correo electrónico no tiene un formato válido.' };
    }
    return {
      ok: true,
      authEmail: email,
      storedCode: '',
      loginDisplay: email,
    };
  }

  const normalizedCode = normalizeSaceCodeForAuth(trimmed).slice(0, 40);
  const cleanAlphaNum = normalizedCode.replace(/[^A-Z0-9]/g, '');
  if (cleanAlphaNum.length < 2) {
    return {
      ok: false,
      error:
        accountType === 'director'
          ? 'Código SACE demasiado corto.'
          : 'El usuario debe tener al menos 2 caracteres alfanuméricos o ser un correo.',
    };
  }

  return {
    ok: true,
    authEmail: saceCodeToAuthEmail(normalizedCode),
    storedCode: normalizedCode,
    loginDisplay: normalizedCode,
  };
}

async function provisionAuthAccountWithoutSessionImpact(
  authEmail: string,
  password: string,
  displayName: string
): Promise<{ uid: string; email: string }> {
  const appName = `sace-provisioner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const secondaryApp = initializeApp(resolvedFirebaseConfig, appName);
  const secondaryAuth = initializeAuth(secondaryApp, {
    persistence: inMemoryPersistence,
  });

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, password);
    try {
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
    } catch {
      // Non-blocking if displayName update fails
    }
    return {
      uid: cred.user.uid,
      email: cred.user.email || authEmail,
    };
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}

export async function createSingleAdminOrAssistantAccount(params: {
  identifier: string;
  password: string;
  displayName: string;
  dni: string;
  position: AdminPosition;
  adminUid: string;
}): Promise<{ uid: string; email: string; storedCode: string }> {
  const resolved = resolveLoginIdentifierToAuth(params.identifier, 'asistente_tecnico');
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }
  if (params.password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }
  const cleanName = params.displayName.trim().slice(0, 160);
  if (cleanName.length < 2) {
    throw new Error('Ingresa el nombre completo.');
  }
  const cleanDni = params.dni.trim().slice(0, 30);

  let createdAuth: { uid: string; email: string };
  try {
    createdAuth = await provisionAuthAccountWithoutSessionImpact(
      resolved.authEmail,
      params.password,
      cleanName
    );
  } catch (err) {
    throw new Error(mapProvisionAuthError(err));
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'admins', createdAuth.uid), {
    uid: createdAuth.uid,
    email: createdAuth.email,
    displayName: cleanName,
    position: params.position,
    addedBy: params.adminUid,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', createdAuth.uid), {
    uid: createdAuth.uid,
    email: createdAuth.email,
    displayName: cleanName,
    dni: cleanDni,
    role: 'admin',
    adminPosition: params.position,
    schoolId: '',
    schoolName: '',
    saceCode: resolved.storedCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return {
    uid: createdAuth.uid,
    email: createdAuth.email,
    storedCode: resolved.storedCode,
  };
}

export async function provisionBulkUsersWithDefaultPassword(params: {
  rows: BulkUserDraftRow[];
  accountType: BulkUserAccountType;
  defaultPassword: string;
  existingSchools: School[];
  existingUsers: UserProfile[];
  adminUid: string;
  onProgress?: (completed: number, total: number) => void;
}): Promise<BulkProvisionRowResult[]> {
  const {
    rows,
    accountType,
    defaultPassword,
    existingSchools,
    existingUsers,
    adminUid,
    onProgress,
  } = params;

  const knownEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
  const knownSaces = new Set(
    existingUsers
      .map((u) => normalizeSaceCodeForAuth(u.saceCode || ''))
      .filter(Boolean)
  );
  const schoolBySace = new Map<string, School>();
  for (const s of existingSchools) {
    const key = normalizeSaceCodeForAuth(s.saceCode || '');
    if (key) schoolBySace.set(key, s);
  }

  const results: BulkProvisionRowResult[] = [];
  const total = rows.length;

  for (let i = 0; i < total; i++) {
    const row = rows[i];
    const cleanName = row.displayName.trim().slice(0, 160);
    const cleanDni = row.dni.trim().slice(0, 30);
    const effectivePassword = (row.password || '').trim() || defaultPassword.trim();

    const resolved = resolveLoginIdentifierToAuth(row.identifier, accountType);
    if (!resolved.ok) {
      results.push({
        rowId: row.id,
        identifier: row.identifier,
        displayName: cleanName || 'Primer ingreso pendiente',
        authIdentifier: row.identifier,
        status: 'error',
        message: resolved.error,
      });
      onProgress?.(i + 1, total);
      continue;
    }

    if (effectivePassword.length < 6) {
      results.push({
        rowId: row.id,
        identifier: resolved.loginDisplay,
        displayName:
          accountType === 'director' ? 'Primer ingreso pendiente' : cleanName || '—',
        authIdentifier: resolved.authEmail,
        status: 'error',
        message:
          'Falta una contraseña válida (mínimo 6 caracteres en la fila o en la contraseña predeterminada).',
      });
      onProgress?.(i + 1, total);
      continue;
    }

    if (accountType === 'asistente_tecnico' && cleanName.length < 2) {
      results.push({
        rowId: row.id,
        identifier: resolved.loginDisplay,
        displayName: cleanName || '—',
        authIdentifier: resolved.authEmail,
        status: 'error',
        message: 'El nombre completo debe tener al menos 2 caracteres.',
      });
      onProgress?.(i + 1, total);
      continue;
    }

    if (
      knownEmails.has(resolved.authEmail.toLowerCase()) ||
      (resolved.storedCode && knownSaces.has(resolved.storedCode))
    ) {
      results.push({
        rowId: row.id,
        identifier: resolved.loginDisplay,
        displayName:
          accountType === 'director' ? 'Primer ingreso pendiente' : cleanName || '—',
        authIdentifier: resolved.authEmail,
        status: 'error',
        message: 'Ya existe un usuario registrado en el sistema con este identificador.',
      });
      onProgress?.(i + 1, total);
      continue;
    }

    let createdAuth: { uid: string; email: string };
    try {
      createdAuth = await provisionAuthAccountWithoutSessionImpact(
        resolved.authEmail,
        effectivePassword,
        accountType === 'director' ? resolved.storedCode : cleanName
      );
    } catch (err) {
      results.push({
        rowId: row.id,
        identifier: resolved.loginDisplay,
        displayName:
          accountType === 'director' ? 'Primer ingreso pendiente' : cleanName || '—',
        authIdentifier: resolved.authEmail,
        status: 'error',
        message: mapProvisionAuthError(err),
      });
      onProgress?.(i + 1, total);
      continue;
    }

    try {
      const batch = writeBatch(db);

      if (accountType === 'asistente_tecnico') {
        batch.set(doc(db, 'admins', createdAuth.uid), {
          uid: createdAuth.uid,
          email: createdAuth.email,
          displayName: cleanName,
          position: 'asistente_tecnico',
          addedBy: adminUid,
          createdAt: serverTimestamp(),
        });

        batch.set(doc(db, 'users', createdAuth.uid), {
          uid: createdAuth.uid,
          email: createdAuth.email,
          displayName: cleanName,
          dni: cleanDni,
          role: 'admin',
          adminPosition: 'asistente_tecnico',
          schoolId: '',
          schoolName: '',
          saceCode: resolved.storedCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await batch.commit();
        knownEmails.add(createdAuth.email.toLowerCase());
        if (resolved.storedCode) knownSaces.add(resolved.storedCode);

        results.push({
          rowId: row.id,
          identifier: resolved.loginDisplay,
          displayName: cleanName,
          authIdentifier: resolved.loginDisplay,
          status: 'created',
          message: 'Asistente Técnico (Administrador) creado correctamente.',
          schoolAction: 'none',
        });
      } else {
        const saceKey = resolved.storedCode || normalizeSaceCodeForAuth(row.identifier);
        const matchedSchool = saceKey ? schoolBySace.get(saceKey) : undefined;
        const prelinkedSchoolId = matchedSchool ? matchedSchool.id : '';
        const prelinkedSchoolName = matchedSchool ? matchedSchool.name : '';
        const canonicalSaceCode = matchedSchool ? matchedSchool.saceCode : saceKey;

        batch.set(doc(db, 'users', createdAuth.uid), {
          uid: createdAuth.uid,
          email: createdAuth.email,
          displayName: '',
          dni: '',
          role: 'pending',
          needsOnboarding: true,
          schoolId: prelinkedSchoolId,
          schoolName: prelinkedSchoolName,
          saceCode: canonicalSaceCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await batch.commit();
        knownEmails.add(createdAuth.email.toLowerCase());
        if (saceKey) knownSaces.add(saceKey);

        results.push({
          rowId: row.id,
          identifier: canonicalSaceCode || resolved.loginDisplay,
          displayName: prelinkedSchoolName || 'Primer ingreso pendiente',
          authIdentifier: canonicalSaceCode || resolved.loginDisplay,
          status: 'created',
          message: matchedSchool
            ? `Cuenta creada (${matchedSchool.name}). Completará su perfil al iniciar sesión.`
            : 'Cuenta creada. El director registrará su nombre, teléfono, comunidad y niveles al ingresar por primera vez.',
          schoolAction: matchedSchool ? 'linked_existing' : 'none',
        });
      }
    } catch (err) {
      results.push({
        rowId: row.id,
        identifier: resolved.loginDisplay,
        displayName:
          accountType === 'director' ? 'Primer ingreso pendiente' : cleanName || '—',
        authIdentifier: resolved.authEmail,
        status: 'error',
        message:
          err instanceof Error
            ? `Auth creado, pero error al guardar perfil: ${err.message}`
            : 'Error al guardar perfil en base de datos.',
      });
    }

    onProgress?.(i + 1, total);
  }

  return results;
}

export async function downloadBulkUsersTemplateExcel(accountType: BulkUserAccountType) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Usuarios');

  if (accountType === 'director') {
    ws.addRow(['CODIGO_SACE', 'CONTRASEÑA']);
    ws.addRow(['050300012B02', 'Sace2026*']);
    ws.addRow(['050300045P01', 'ClaveCentro02']);
    ws.columns = [{ width: 24 }, { width: 24 }];
  } else {
    ws.addRow(['CORREO_O_USUARIO', 'NOMBRE_ASISTENTE', 'DNI', 'CONTRASEÑA']);
    ws.addRow(['asistente1@educatrachos.hn', 'Lic. Carlos Eduardo Méndez', '0501-1988-00987', 'Distrito18B*']);
    ws.addRow(['AT-18B-02', 'Lic. Ana Sofía Hernández', '0503-1992-00321', '']);
    ws.columns = [{ width: 32 }, { width: 32 }, { width: 20 }, { width: 22 }];
  }

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    accountType === 'director'
      ? 'Plantilla_Carga_Masiva_Directores_SACE_18B.xlsx'
      : 'Plantilla_Carga_Masiva_Asistentes_18B.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseBulkPasteText(
  text: string,
  accountType: BulkUserAccountType = 'director'
): BulkUserDraftRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: BulkUserDraftRow[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const separator = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
    const parts = line.split(separator).map((p) => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length === 0 || !parts[0]) continue;

    const firstLower = parts[0].toLowerCase();
    if (
      idx === 0 &&
      (firstLower.includes('sace') ||
        firstLower.includes('correo') ||
        firstLower.includes('usuario') ||
        firstLower.includes('codigo') ||
        firstLower.includes('código'))
    ) {
      continue;
    }

    if (accountType === 'director') {
      rows.push({
        id: `bulk-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        identifier: parts[0] || '',
        password: parts[1] || '',
        displayName: '',
        dni: '',
        schoolName: '',
        community: 'Omoa',
      });
    } else {
      rows.push({
        id: `bulk-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        identifier: parts[0] || '',
        displayName: parts[1] || '',
        dni: parts[2] || '',
        password: parts[3] || '',
        schoolName: '',
        community: 'Omoa',
      });
    }
  }

  return rows;
}

export async function parseBulkUsersFile(
  file: File,
  accountType: BulkUserAccountType = 'director'
): Promise<BulkUserDraftRow[]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) {
    const text = await file.text();
    return parseBulkPasteText(text, accountType);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const parsed: BulkUserDraftRow[] = [];
  ws.eachRow((row, rowNumber) => {
    const cellText = (colIdx: number) => {
      const val = row.getCell(colIdx).value;
      if (val === null || val === undefined) return '';
      if (typeof val === 'object' && 'text' in val) return String(val.text || '').trim();
      if (typeof val === 'object' && 'result' in val) return String(val.result ?? '').trim();
      return String(val).trim();
    };

    const c1 = cellText(1);
    const c2 = cellText(2);
    const c3 = cellText(3);
    const c4 = cellText(4);

    if (!c1 && !c2) return;

    const firstLower = c1.toLowerCase();
    if (
      rowNumber === 1 &&
      (firstLower.includes('sace') ||
        firstLower.includes('correo') ||
        firstLower.includes('usuario') ||
        firstLower.includes('codigo') ||
        firstLower.includes('código'))
    ) {
      return;
    }

    if (accountType === 'director') {
      parsed.push({
        id: `xlsx-${Date.now()}-${rowNumber}`,
        identifier: c1,
        password: c2,
        displayName: '',
        dni: '',
        schoolName: '',
        community: 'Omoa',
      });
    } else {
      parsed.push({
        id: `xlsx-${Date.now()}-${rowNumber}`,
        identifier: c1,
        displayName: c2,
        dni: c3,
        password: c4,
        schoolName: '',
        community: 'Omoa',
      });
    }
  });

  return parsed;
}

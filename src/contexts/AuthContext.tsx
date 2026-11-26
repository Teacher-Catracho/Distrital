import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type {
  BasicaCenterType,
  BasicaScope,
  DirectorRequest,
  DistrictCode,
  EducationLevel,
  ModalityType,
  PrebasicaCenterType,
  School,
  SectorType,
  UserProfile,
} from '../types/sace';
import {
  PRIMARY_ADMIN_EMAIL,
  PRIMARY_ADMIN_USERNAME,
  normalizeSaceCodeForAuth,
  saceCodeToAuthEmail,
} from '../utils/saceCalculations';

export interface CompleteProvisionedOnboardingPayload {
  displayName: string;
  dni: string;
  directorPhone: string;
  schoolName: string;
  community: string;
  district: DistrictCode;
  levels: EducationLevel[];
  basicaScope?: BasicaScope;
  prebasicaType?: PrebasicaCenterType;
  basicaType?: BasicaCenterType;
  sector: SectorType;
  modality: ModalityType;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  directorRequest: DirectorRequest | null;
  schools: School[];
  assignedSchool: School | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithSace: (saceCode: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  submitDirectorRequest: (
    payload: Omit<
      DirectorRequest,
      'uid' | 'email' | 'status' | 'reviewComment' | 'createdAt' | 'updatedAt'
    >
  ) => Promise<void>;
  completeProvisionedDirectorOnboarding: (
    payload: CompleteProvisionedOnboardingPayload
  ) => Promise<void>;
}

function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  switch (code) {
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'El acceso con Código SACE y contraseña requiere habilitar el proveedor "Correo electrónico/contraseña" en Firebase Console (Authentication → Sign-in method).';
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta registrada con este código SACE. Inicia sesión con tu contraseña o solicita ayuda al Administrador Distrital.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Código SACE o contraseña incorrectos. Verifica tus datos e intenta nuevamente.';
    case 'auth/weak-password':
      return 'La contraseña es muy débil. Debe tener al menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'El código SACE ingresado no tiene un formato válido.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.';
    case 'auth/user-disabled':
      return 'Esta cuenta fue deshabilitada. Comunícate con la Dirección Distrital.';
    case 'auth/network-request-failed':
      return 'Error de conexión. Verifica tu acceso a internet e intenta de nuevo.';
    default:
      return err instanceof Error ? err.message : 'No se pudo iniciar sesión con credenciales.';
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [directorRequest, setDirectorRequest] = useState<DirectorRequest | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setDirectorRequest(null);
        setSchools([]);
        setLoading(false);
        return;
      }

      setAuthError(null);
      setLoading(true);
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        const isPrimaryAdmin =
          (user.email || '').toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();

        if (!snap.exists()) {
          if (!isPrimaryAdmin) {
            await signOut(auth).catch(() => {});
            setProfile(null);
            setLoading(false);
            setAuthError(
              'Tu cuenta no está registrada en la plataforma. Solicita tus credenciales a la Dirección Distrital.'
            );
            return;
          }

          try {
            await setDoc(userRef, {
              uid: user.uid,
              email: user.email || PRIMARY_ADMIN_EMAIL,
              displayName: user.displayName || 'Administrador Distrital',
              dni: PRIMARY_ADMIN_USERNAME,
              role: 'admin',
              adminPosition: 'administrador',
              schoolId: '',
              schoolName: '',
              saceCode: PRIMARY_ADMIN_USERNAME,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
          }
        } else if (isPrimaryAdmin && snap.data().role !== 'admin') {
          try {
            await updateDoc(userRef, {
              role: 'admin',
              adminPosition: 'administrador',
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
          }
        }

        if (isPrimaryAdmin) {
          const adminRef = doc(db, 'admins', user.uid);
          const adminSnap = await getDoc(adminRef);
          if (!adminSnap.exists()) {
            try {
              await setDoc(adminRef, {
                uid: user.uid,
                email: user.email || PRIMARY_ADMIN_EMAIL,
                displayName: user.displayName || 'Administrador Distrital',
                position: 'administrador',
                addedBy: 'system',
                createdAt: serverTimestamp(),
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, `admins/${user.uid}`);
            }
          }
        }
      } catch (err) {
        console.error(err);
        setAuthError(
          err instanceof Error ? err.message : 'Error al inicializar el perfil de usuario.'
        );
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    const userPath = `users/${firebaseUser.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
          setLoading(false);
        } else {
          setLoading(false);
        }
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    );

    const reqPath = `directorRequests/${firebaseUser.uid}`;
    const unsubReq = onSnapshot(
      doc(db, 'directorRequests', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          setDirectorRequest(snap.data() as DirectorRequest);
        } else {
          setDirectorRequest(null);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, reqPath);
      }
    );

    const schoolsPath = 'schools';
    const unsubSchools = onSnapshot(
      collection(db, schoolsPath),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<School, 'id'>) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setSchools(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, schoolsPath);
      }
    );

    return () => {
      unsubProfile();
      unsubReq();
      unsubSchools();
    };
  }, [firebaseUser]);

  const clearAuthError = () => setAuthError(null);

  const signInWithSace = async (identifier: string, password: string): Promise<boolean> => {
    setAuthError(null);
    const trimmed = identifier.trim();
    if (!trimmed) {
      setAuthError('Ingresa tu código SACE, usuario o correo electrónico.');
      return false;
    }
    if (!password) {
      setAuthError('Ingresa tu contraseña.');
      return false;
    }

    let authEmail = '';
    if (trimmed.includes('@')) {
      const normalizedEmail = trimmed.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        setAuthError('El correo electrónico ingresado no tiene un formato válido.');
        return false;
      }
      authEmail = normalizedEmail;
    } else {
      const normalizedSace = normalizeSaceCodeForAuth(trimmed);
      const cleanAlphaNum = normalizedSace.replace(/[^A-Z0-9]/g, '');
      if (cleanAlphaNum.length < 2) {
        setAuthError('Ingresa un código SACE o usuario válido.');
        return false;
      }
      authEmail = saceCodeToAuthEmail(normalizedSace);
    }

    try {
      await signInWithEmailAndPassword(auth, authEmail, password);
      return true;
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
      return false;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const submitDirectorRequest = async (
    payload: Omit<
      DirectorRequest,
      'uid' | 'email' | 'status' | 'reviewComment' | 'createdAt' | 'updatedAt'
    >
  ) => {
    if (!firebaseUser) return;
    const reqPath = `directorRequests/${firebaseUser.uid}`;
    const reqRef = doc(db, 'directorRequests', firebaseUser.uid);
    const existingSnap = await getDoc(reqRef);

    try {
      if (existingSnap.exists()) {
        await updateDoc(reqRef, {
          ...payload,
          status: 'pending',
          reviewComment: '',
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(reqRef, {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          ...payload,
          status: 'pending',
          reviewComment: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        displayName: payload.displayName,
        dni: payload.dni,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, reqPath);
    }
  };

  const completeProvisionedDirectorOnboarding = async (
    payload: CompleteProvisionedOnboardingPayload
  ) => {
    if (!firebaseUser || !profile) {
      throw new Error('No hay sesión activa.');
    }
    if (!profile.needsOnboarding || !profile.saceCode) {
      throw new Error('Esta cuenta no corresponde a un primer ingreso habilitado.');
    }

    const displayName = payload.displayName.trim().slice(0, 160);
    const dni = payload.dni.trim().slice(0, 30);
    const directorPhone = payload.directorPhone.trim().slice(0, 30);
    const schoolName = payload.schoolName.trim().slice(0, 200);
    const community = (payload.community.trim() || 'Omoa').slice(0, 160);
    const levels: EducationLevel[] =
      payload.levels.length > 0 ? payload.levels.slice(0, 3) : ['basica'];

    if (displayName.length < 2) {
      throw new Error('Ingresa el nombre completo del director.');
    }
    if (dni.length < 3) {
      throw new Error('Ingresa el número de identidad (DNI).');
    }
    if (schoolName.length < 2) {
      throw new Error('Ingresa el nombre oficial del centro educativo.');
    }
    if (payload.district !== '18' && payload.district !== '18-B') {
      throw new Error('Selecciona el distrito educativo al que pertenece el centro (Distrito 18 o Distrito 18-B).');
    }
    if (levels.includes('prebasica') && !payload.prebasicaType) {
      throw new Error('Selecciona el tipo de centro de Prebásica (Normal, CEP-U o CCPREB).');
    }
    const effectiveBasicaScope: BasicaScope = payload.basicaScope || 'c1_2_3';
    if (levels.includes('basica') && effectiveBasicaScope === 'c1_2' && !payload.basicaType) {
      throw new Error('Selecciona el tipo de centro de Básica de 1° a 6° grado (Normal o PROHECO).');
    }

    try {
      await updateProfile(firebaseUser, { displayName });
    } catch {
      // Non-blocking Auth displayName update
    }

    const normalizedUserSace = normalizeSaceCodeForAuth(profile.saceCode);
    const matchedSchool =
      (profile.schoolId ? schools.find((s) => s.id === profile.schoolId) : undefined) ||
      schools.find((s) => normalizeSaceCodeForAuth(s.saceCode || '') === normalizedUserSace);

    const batch = writeBatch(db);
    let targetSchoolId = '';

    if (matchedSchool) {
      targetSchoolId = matchedSchool.id;
      batch.update(doc(db, 'schools', matchedSchool.id), {
        name: schoolName,
        community,
        district: payload.district,
        levels,
        prebasicaType:
          levels.includes('prebasica') && payload.prebasicaType
            ? payload.prebasicaType
            : deleteField(),
        basicaScope: levels.includes('basica') ? effectiveBasicaScope : deleteField(),
        basicaType:
          levels.includes('basica') && effectiveBasicaScope === 'c1_2' && payload.basicaType
            ? payload.basicaType
            : deleteField(),
        sector: payload.sector,
        modality: payload.modality,
        directorUid: firebaseUser.uid,
        directorDisplayName: displayName,
        updatedAt: serverTimestamp(),
      });

      const contactRef = doc(db, 'schoolContacts', matchedSchool.id);
      const existingContactSnap = await getDoc(contactRef);
      if (existingContactSnap.exists()) {
        batch.update(contactRef, {
          directorPhone,
          updatedByUid: firebaseUser.uid,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(contactRef, {
          schoolId: matchedSchool.id,
          directorPhone,
          updatedByUid: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      const newSchoolRef = doc(collection(db, 'schools'));
      targetSchoolId = newSchoolRef.id;
      batch.set(newSchoolRef, {
        saceCode: profile.saceCode.slice(0, 40),
        name: schoolName,
        community,
        district: payload.district,
        levels,
        ...(levels.includes('prebasica') && payload.prebasicaType
          ? { prebasicaType: payload.prebasicaType }
          : {}),
        ...(levels.includes('basica')
          ? {
              basicaScope: effectiveBasicaScope,
              ...(effectiveBasicaScope === 'c1_2' && payload.basicaType
                ? { basicaType: payload.basicaType }
                : {}),
            }
          : {}),
        sector: payload.sector,
        modality: payload.modality,
        directorUid: firebaseUser.uid,
        directorDisplayName: displayName,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'schoolContacts', targetSchoolId), {
        schoolId: targetSchoolId,
        directorPhone,
        updatedByUid: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.update(doc(db, 'users', firebaseUser.uid), {
      displayName,
      dni,
      role: 'director',
      needsOnboarding: false,
      schoolId: targetSchoolId,
      schoolName,
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
    }
  };

  const assignedSchool =
    profile?.schoolId ? schools.find((s) => s.id === profile.schoolId) || null : null;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        directorRequest,
        schools,
        assignedSchool,
        loading,
        authError,
        clearAuthError,
        signInWithSace,
        logout,
        submitDirectorRequest,
        completeProvisionedDirectorOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

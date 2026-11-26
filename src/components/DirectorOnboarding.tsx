import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, LogOut, Search, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type {
  BasicaScope,
  CanonicalBasicaCenterType,
  CanonicalPrebasicaCenterType,
  DistrictCode,
  EducationLevel,
  ModalityType,
  SectorType,
} from '../types/sace';
import {
  BASICA_CENTER_TYPES,
  BASICA_CENTER_TYPE_LABELS,
  BASICA_SCOPE_LABELS,
  DISTRICT_OPTIONS,
  LEVEL_LABELS,
  PREBASICA_CENTER_TYPES,
  formatAccountIdentifier,
  getDistrictLabel,
  getSchoolLevelLabel,
  normalizeBasicaCenterType,
  normalizePrebasicaCenterType,
  normalizeSaceCodeForAuth,
} from '../utils/saceCalculations';

export function DirectorOnboarding() {
  const {
    firebaseUser,
    profile,
    directorRequest,
    schools,
    logout,
    submitDirectorRequest,
    completeProvisionedDirectorOnboarding,
  } = useAuth();

  const isProvisionedFirstLogin = Boolean(profile?.needsOnboarding && profile?.saceCode);

  const matchedCatalogSchool = useMemo(() => {
    if (!profile?.saceCode && !profile?.schoolId) return null;
    const normUserSace = normalizeSaceCodeForAuth(profile?.saceCode || '');
    return (
      (profile?.schoolId ? schools.find((s) => s.id === profile.schoolId) : undefined) ||
      (normUserSace
        ? schools.find((s) => normalizeSaceCodeForAuth(s.saceCode || '') === normUserSace)
        : undefined) ||
      null
    );
  }, [schools, profile?.schoolId, profile?.saceCode]);

  const [displayName, setDisplayName] = useState(
    directorRequest?.displayName || profile?.displayName || ''
  );
  const [dni, setDni] = useState(directorRequest?.dni || profile?.dni || '');
  const [directorPhone, setDirectorPhone] = useState(directorRequest?.directorPhone || '');
  const [requestType, setRequestType] = useState<'existing_school' | 'new_school'>(
    directorRequest?.requestType || (schools.length > 0 ? 'existing_school' : 'new_school')
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState(directorRequest?.schoolId || '');
  const [proposedSchoolName, setProposedSchoolName] = useState(
    directorRequest?.proposedSchoolName || matchedCatalogSchool?.name || profile?.schoolName || ''
  );
  const [proposedSaceCode, setProposedSaceCode] = useState(
    directorRequest?.proposedSaceCode || profile?.saceCode || ''
  );
  const [proposedCommunity, setProposedCommunity] = useState(
    directorRequest?.proposedCommunity || matchedCatalogSchool?.community || 'Omoa'
  );
  const [proposedDistrict, setProposedDistrict] = useState<DistrictCode | ''>(
    directorRequest?.proposedDistrict || matchedCatalogSchool?.district || ''
  );
  const [proposedLevels, setProposedLevels] = useState<EducationLevel[]>(
    directorRequest?.proposedLevels || matchedCatalogSchool?.levels || ['basica']
  );
  const [proposedBasicaScope, setProposedBasicaScope] = useState<BasicaScope>(
    directorRequest?.proposedBasicaScope || matchedCatalogSchool?.basicaScope || 'c1_2_3'
  );
  const [proposedPrebasicaType, setProposedPrebasicaType] = useState<CanonicalPrebasicaCenterType | ''>(
    normalizePrebasicaCenterType(
      directorRequest?.proposedPrebasicaType || matchedCatalogSchool?.prebasicaType
    ) || ''
  );
  const [proposedBasicaType, setProposedBasicaType] = useState<CanonicalBasicaCenterType | ''>(
    normalizeBasicaCenterType(
      directorRequest?.proposedBasicaType || matchedCatalogSchool?.basicaType
    ) || ''
  );
  const [proposedSector, setProposedSector] = useState<SectorType>(
    directorRequest?.proposedSector || matchedCatalogSchool?.sector || 'gubernamental'
  );
  const [proposedModality, setProposedModality] = useState<ModalityType>(
    directorRequest?.proposedModality || matchedCatalogSchool?.modality || 'presencial'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(
    isProvisionedFirstLogin || !directorRequest || directorRequest.status === 'rejected'
  );

  const prefilledCatalogSchoolIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isProvisionedFirstLogin || !matchedCatalogSchool) return;
    if (prefilledCatalogSchoolIdRef.current === matchedCatalogSchool.id) return;
    prefilledCatalogSchoolIdRef.current = matchedCatalogSchool.id;

    setProposedSchoolName((prev) => prev.trim() || matchedCatalogSchool.name);
    setProposedSaceCode(matchedCatalogSchool.saceCode);
    setProposedCommunity(matchedCatalogSchool.community || 'Omoa');
    if (matchedCatalogSchool.district) {
      setProposedDistrict(matchedCatalogSchool.district);
    }
    if (matchedCatalogSchool.levels.length > 0) {
      setProposedLevels(matchedCatalogSchool.levels);
    }
    if (matchedCatalogSchool.basicaScope) {
      setProposedBasicaScope(matchedCatalogSchool.basicaScope);
    }
    if (matchedCatalogSchool.prebasicaType) {
      const normalizedPre = normalizePrebasicaCenterType(matchedCatalogSchool.prebasicaType);
      if (normalizedPre) setProposedPrebasicaType(normalizedPre);
    }
    if (matchedCatalogSchool.basicaType) {
      const normalizedBas = normalizeBasicaCenterType(matchedCatalogSchool.basicaType);
      if (normalizedBas) setProposedBasicaType(normalizedBas);
    }
    setProposedSector(matchedCatalogSchool.sector);
    setProposedModality(matchedCatalogSchool.modality);
  }, [isProvisionedFirstLogin, matchedCatalogSchool]);

  const filteredSchools = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.saceCode.toLowerCase().includes(q) ||
        s.community.toLowerCase().includes(q)
    );
  }, [schools, searchTerm]);

  const toggleLevel = (lvl: EducationLevel) => {
    setProposedLevels((prev) =>
      prev.includes(lvl)
        ? prev.length > 1
          ? prev.filter((item) => item !== lvl)
          : prev
        : [...prev, lvl]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (displayName.trim().length < 3) {
      setError('Ingresa tu nombre completo como director(a).');
      return;
    }
    if (dni.trim().length < 5) {
      setError('Ingresa tu número de identidad (DNI).');
      return;
    }

    if (isProvisionedFirstLogin) {
      if (directorPhone.trim().length < 4) {
        setError('Ingresa el número de teléfono del director.');
        return;
      }
      if (proposedSchoolName.trim().length < 3) {
        setError('Ingresa el nombre oficial del centro educativo.');
        return;
      }
      if (proposedCommunity.trim().length < 2) {
        setError('Ingresa la comunidad, aldea o barrio del centro educativo.');
        return;
      }
      if (!proposedDistrict) {
        setError('Selecciona el distrito al que pertenece el centro educativo (Distrito 18 o Distrito 18-B).');
        return;
      }
      if (proposedLevels.length === 0) {
        setError('Selecciona al menos un nivel educativo que atiende el centro.');
        return;
      }
      if (proposedLevels.includes('prebasica') && !proposedPrebasicaType) {
        setError('Selecciona el tipo de centro de Prebásica (Normal, CEP-U o CCPREB).');
        return;
      }
      if (
        proposedLevels.includes('basica') &&
        proposedBasicaScope === 'c1_2' &&
        !proposedBasicaType
      ) {
        setError('Selecciona el tipo de centro para Básica de 1° a 6° grado (Normal o PROHECO).');
        return;
      }

      setSubmitting(true);
      try {
        await completeProvisionedDirectorOnboarding({
          displayName: displayName.trim(),
          dni: dni.trim(),
          directorPhone: directorPhone.trim(),
          schoolName: proposedSchoolName.trim(),
          community: proposedCommunity.trim(),
          district: proposedDistrict,
          levels: proposedLevels,
          ...(proposedLevels.includes('prebasica') && proposedPrebasicaType
            ? { prebasicaType: proposedPrebasicaType }
            : {}),
          ...(proposedLevels.includes('basica')
            ? {
                basicaScope: proposedBasicaScope,
                ...(proposedBasicaScope === 'c1_2' && proposedBasicaType
                  ? { basicaType: proposedBasicaType }
                  : {}),
              }
            : {}),
          sector: proposedSector,
          modality: proposedModality,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron guardar tus datos.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (requestType === 'existing_school') {
      const target = schools.find((s) => s.id === selectedSchoolId);
      if (!target) {
        setError('Selecciona un centro educativo del catálogo.');
        return;
      }
      setSubmitting(true);
      try {
        await submitDirectorRequest({
          displayName: displayName.trim(),
          dni: dni.trim(),
          ...(directorPhone.trim() ? { directorPhone: directorPhone.trim().slice(0, 30) } : {}),
          requestType: 'existing_school',
          schoolId: target.id,
          proposedSchoolName: target.name,
          proposedSaceCode: target.saceCode,
          proposedCommunity: target.community,
          ...(target.district ? { proposedDistrict: target.district } : {}),
          proposedLevels: target.levels,
          ...(target.prebasicaType ? { proposedPrebasicaType: target.prebasicaType } : {}),
          ...(target.basicaScope ? { proposedBasicaScope: target.basicaScope } : {}),
          ...(target.basicaType ? { proposedBasicaType: target.basicaType } : {}),
          proposedSector: target.sector,
          proposedModality: target.modality,
        });
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.');
      } finally {
        setSubmitting(false);
      }
    } else {
      if (proposedSchoolName.trim().length < 3 || proposedSaceCode.trim().length < 2) {
        setError('Ingresa el nombre oficial y el código SACE del centro educativo.');
        return;
      }
      if (!proposedDistrict) {
        setError('Selecciona el distrito al que pertenece el centro educativo (Distrito 18 o Distrito 18-B).');
        return;
      }
      if (proposedLevels.includes('prebasica') && !proposedPrebasicaType) {
        setError('Selecciona el tipo de centro de Prebásica (Normal, CEP-U o CCPREB).');
        return;
      }
      if (
        proposedLevels.includes('basica') &&
        proposedBasicaScope === 'c1_2' &&
        !proposedBasicaType
      ) {
        setError('Selecciona el tipo de centro para Básica de 1° a 6° grado (Normal o PROHECO).');
        return;
      }
      setSubmitting(true);
      try {
        await submitDirectorRequest({
          displayName: displayName.trim(),
          dni: dni.trim(),
          ...(directorPhone.trim() ? { directorPhone: directorPhone.trim().slice(0, 30) } : {}),
          requestType: 'new_school',
          schoolId: '',
          proposedSchoolName: proposedSchoolName.trim(),
          proposedSaceCode: proposedSaceCode.trim(),
          proposedCommunity: proposedCommunity.trim() || 'Omoa',
          proposedDistrict,
          proposedLevels,
          ...(proposedLevels.includes('prebasica') && proposedPrebasicaType
            ? { proposedPrebasicaType }
            : {}),
          ...(proposedLevels.includes('basica')
            ? {
                proposedBasicaScope,
                ...(proposedBasicaScope === 'c1_2' && proposedBasicaType
                  ? { proposedBasicaType }
                  : {}),
              }
            : {}),
          proposedSector,
          proposedModality,
        });
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.');
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
        <span className="font-display text-lg font-bold text-slate-900 whitespace-nowrap shrink-0">
          SACE Distrito 18-B Omoa
        </span>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="hidden sm:inline truncate max-w-[220px]">
            {formatAccountIdentifier(
              firebaseUser?.email,
              directorRequest?.proposedSaceCode || profile?.saceCode
            )}
          </span>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-6 sm:p-10 space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {isProvisionedFirstLogin
              ? 'Primer Ingreso · Completa los Datos de tu Centro'
              : 'Vinculación de Director de Centro Educativo'}
          </h1>
          <p className="text-sm text-slate-600">
            {isProvisionedFirstLogin
              ? 'Tu cuenta fue habilitada por la Dirección Distrital. Registra tus datos personales y la información de tu centro educativo para comenzar.'
              : 'Selecciona tu centro educativo o solicita su incorporación. El Administrador Distrital revisará y aprobará tu acceso.'}
          </p>
        </div>

        {!isProvisionedFirstLogin && directorRequest && !editing && (
          <div className="bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Estado de tu solicitud</p>
                {directorRequest.status === 'pending' ? (
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700">
                    <Clock className="w-4 h-4" />
                    En espera de aprobación distrital
                  </p>
                ) : directorRequest.status === 'rejected' ? (
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-red-700">
                    <AlertTriangle className="w-4 h-4" />
                    Solicitud observada o rechazada
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    Aprobada
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
              >
                Modificar solicitud
              </button>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Director(a)</dt>
                <dd className="font-medium text-slate-900">{directorRequest.displayName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">N° Identidad</dt>
                <dd className="font-mono text-slate-900">{directorRequest.dni}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Centro Educativo</dt>
                <dd className="font-medium text-slate-900">{directorRequest.proposedSchoolName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Código SACE</dt>
                <dd className="font-mono text-slate-900">{directorRequest.proposedSaceCode}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Niveles</dt>
                <dd className="text-slate-900">
                  {directorRequest.proposedLevels
                    .map((l) => getSchoolLevelLabel(l, directorRequest.proposedBasicaScope))
                    .join(' · ')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Comunidad / Lugar</dt>
                <dd className="text-slate-900">{directorRequest.proposedCommunity}</dd>
              </div>
              {directorRequest.proposedDistrict && (
                <div>
                  <dt className="text-xs text-slate-500">Distrito Educativo</dt>
                  <dd className="text-slate-900">
                    {getDistrictLabel(directorRequest.proposedDistrict)}
                  </dd>
                </div>
              )}
            </dl>

            {directorRequest.reviewComment && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <strong className="font-semibold">Observación del Distrito: </strong>
                {directorRequest.reviewComment}
              </div>
            )}
          </div>
        )}

        {(editing || isProvisionedFirstLogin) && (
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 p-6 space-y-6">
            {isProvisionedFirstLogin && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-2.5">
                <UserCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    Código SACE verificado:{' '}
                    <span className="font-mono">{profile?.saceCode}</span>
                  </p>
                  <p className="text-blue-900 mt-0.5">
                    Esta pantalla solo aparece en tu primer ingreso. Al guardar, accederás directamente al portal de reportes de tu centro educativo.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre completo del Director(a) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-none focus:border-blue-700"
                  placeholder="Ej. María Fernanda López"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  N° de Identidad (DNI) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={30}
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 focus:outline-none focus:border-blue-700"
                  placeholder="0501-1985-00123"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Teléfono del Director {isProvisionedFirstLogin ? '*' : ''}
                </label>
                <input
                  type="tel"
                  required={isProvisionedFirstLogin}
                  maxLength={30}
                  value={directorPhone}
                  onChange={(e) => setDirectorPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 focus:outline-none focus:border-blue-700"
                  placeholder="Ej. 9988-7766"
                />
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200">
              {!isProvisionedFirstLogin && (
                <div className="flex items-center gap-2 p-1 bg-slate-100 w-fit">
                  <button
                    type="button"
                    onClick={() => setRequestType('existing_school')}
                    className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                      requestType === 'existing_school'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Seleccionar centro registrado ({schools.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestType('new_school')}
                    className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                      requestType === 'new_school'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Mi centro no aparece en la lista
                  </button>
                </div>
              )}

              {!isProvisionedFirstLogin && requestType === 'existing_school' ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar por nombre del centro, código SACE o comunidad..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 focus:outline-none focus:border-blue-700"
                    />
                  </div>
                  {filteredSchools.length === 0 ? (
                    <div className="p-4 border border-slate-200 bg-slate-50 text-xs text-slate-600">
                      No hay centros disponibles que coincidan. Si el catálogo distrital aún no incluye tu centro, selecciona la pestaña &ldquo;Mi centro no aparece en la lista&rdquo;.
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto border border-slate-200 divide-y divide-slate-200">
                      {filteredSchools.map((s) => (
                        <label
                          key={s.id}
                          className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 ${
                            selectedSchoolId === s.id ? 'bg-blue-50/70' : ''
                          }`}
                        >
                          <input
                            type="radio"
                            name="schoolSelection"
                            checked={selectedSchoolId === s.id}
                            onChange={() => setSelectedSchoolId(s.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900">{s.name}</p>
                            <p className="text-xs text-slate-500">
                              <span className="font-mono">{s.saceCode}</span>
                              {s.district ? ` · ${getDistrictLabel(s.district)}` : ''} ·{' '}
                              {s.community} ·{' '}
                              {s.levels.map((l) => getSchoolLevelLabel(l, s)).join(', ')}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nombre oficial del Centro Educativo *
                    </label>
                    <input
                      type="text"
                      required={isProvisionedFirstLogin}
                      maxLength={200}
                      value={proposedSchoolName}
                      onChange={(e) => setProposedSchoolName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-none focus:border-blue-700"
                      placeholder="Ej. C.E.B. Francisco Morazán"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Código SACE
                    </label>
                    <input
                      type="text"
                      readOnly={isProvisionedFirstLogin}
                      disabled={isProvisionedFirstLogin}
                      value={isProvisionedFirstLogin ? profile?.saceCode || '' : proposedSaceCode}
                      onChange={(e) => setProposedSaceCode(e.target.value)}
                      className={`w-full px-3 py-2 text-sm font-mono border border-slate-300 focus:outline-none focus:border-blue-700 ${
                        isProvisionedFirstLogin ? 'bg-slate-100 text-slate-700 cursor-not-allowed' : ''
                      }`}
                      placeholder="050300012B02"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Comunidad / Aldea / Barrio *
                    </label>
                    <input
                      type="text"
                      required={isProvisionedFirstLogin}
                      maxLength={160}
                      value={proposedCommunity}
                      onChange={(e) => setProposedCommunity(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 focus:outline-none focus:border-blue-700"
                      placeholder="Omoa"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Distrito Educativo del Municipio *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {DISTRICT_OPTIONS.map((opt) => {
                        const selected = proposedDistrict === opt.value;
                        return (
                          <label
                            key={opt.value}
                            className={`flex items-center gap-2.5 px-3 py-2.5 border text-sm cursor-pointer transition-colors ${
                              selected
                                ? 'border-blue-700 bg-blue-50 text-blue-950 font-semibold'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="proposedDistrict"
                              value={opt.value}
                              checked={selected}
                              onChange={() => setProposedDistrict(opt.value)}
                              required
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Niveles que atiende *
                    </label>
                    <div className="flex flex-wrap gap-3 pt-1">
                      {(['prebasica', 'basica', 'media'] as EducationLevel[]).map((lvl) => (
                        <label key={lvl} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={proposedLevels.includes(lvl)}
                            onChange={() => toggleLevel(lvl)}
                          />
                          {LEVEL_LABELS[lvl]}
                        </label>
                      ))}
                    </div>
                    {proposedLevels.includes('prebasica') && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Tipo de centro (Prebásica) *
                        </label>
                        <select
                          required
                          value={proposedPrebasicaType}
                          onChange={(e) =>
                            setProposedPrebasicaType(
                              e.target.value as CanonicalPrebasicaCenterType | ''
                            )
                          }
                          className="w-full px-2.5 py-2 text-xs border border-slate-300 bg-white"
                        >
                          <option value="">Selecciona tipo de centro...</option>
                          {PREBASICA_CENTER_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {proposedLevels.includes('basica') && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Subnivel de Básica *
                          </label>
                          <select
                            value={proposedBasicaScope}
                            onChange={(e) => setProposedBasicaScope(e.target.value as BasicaScope)}
                            className="w-full px-2.5 py-2 text-xs border border-slate-300 bg-white"
                          >
                            {(['c1_2', 'c3', 'c1_2_3'] as BasicaScope[]).map((sc) => (
                              <option key={sc} value={sc}>
                                Básica · {BASICA_SCOPE_LABELS[sc]}
                              </option>
                            ))}
                          </select>
                        </div>
                        {proposedBasicaScope === 'c1_2' && (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Tipo de centro (Básica de 1° a 6° grado) *
                            </label>
                            <select
                              required
                              value={proposedBasicaType}
                              onChange={(e) =>
                                setProposedBasicaType(
                                  e.target.value as CanonicalBasicaCenterType | ''
                                )
                              }
                              className="w-full px-2.5 py-2 text-xs border border-slate-300 bg-white"
                            >
                              <option value="">Selecciona tipo de centro...</option>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Administración
                      </label>
                      <select
                        value={proposedSector}
                        onChange={(e) => setProposedSector(e.target.value as SectorType)}
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 bg-white"
                      >
                        <option value="gubernamental">Gubernamental</option>
                        <option value="no_gubernamental">No Gubernamental</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Modalidad
                      </label>
                      <select
                        value={proposedModality}
                        onChange={(e) => setProposedModality(e.target.value as ModalityType)}
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 bg-white"
                      >
                        <option value="presencial">Presencial</option>
                        <option value="isemed">ISEMED</option>
                        <option value="acelerado">Acelerado</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              {!isProvisionedFirstLogin && directorRequest && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {submitting
                  ? isProvisionedFirstLogin
                    ? 'Guardando datos...'
                    : 'Enviando...'
                  : isProvisionedFirstLogin
                  ? 'Guardar datos e ingresar al sistema'
                  : 'Enviar solicitud al Distrito'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

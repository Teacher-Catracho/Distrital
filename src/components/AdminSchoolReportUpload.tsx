import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  ClipboardList,
  FileBarChart2,
  Search,
  Upload,
} from 'lucide-react';
import type {
  AnnualReport,
  CenterTypeFilter,
  DistrictCode,
  EducationLevel,
  MonthlyReport,
  ParteMensualReport,
  ReportStatus,
  School,
  UserProfile,
} from '../types/sace';
import {
  CENTER_TYPE_FILTER_OPTIONS,
  DISTRICT_OPTIONS,
  MONTHS,
  getBasicaScope,
  getDistrictLabel,
  getSchoolCenterTypesSummary,
  getSchoolLevelLabel,
  schoolMatchesCenterTypeFilter,
} from '../utils/saceCalculations';
import { BasicaAnnualEditor } from './BasicaAnnualEditor';
import { MediaAnnualEditor } from './MediaAnnualEditor';
import { MovimientosSaceEditor } from './MovimientosSaceEditor';
import { ParteMensualEditor } from './ParteMensualEditor';
import { PrebasicaAnnualEditor } from './PrebasicaAnnualEditor';

type UploadReportKind = 'parteMensual' | 'monthly' | 'annual';

const SCHOOL_MONTHS = MONTHS.filter((m) => m.value >= 2 && m.value <= 11);

const LEVEL_DISPLAY_ORDER: Record<EducationLevel, number> = {
  prebasica: 0,
  basica: 1,
  media: 2,
};

function clampSchoolMonth(month: number): number {
  if (month < 2) return 2;
  if (month > 11) return 11;
  return month;
}

function getStatusPillStyle(status?: ReportStatus): {
  label: string;
  classes: string;
} {
  switch (status) {
    case 'approved':
      return {
        label: 'Aprobado',
        classes: 'bg-emerald-50 border-emerald-300 text-emerald-800',
      };
    case 'submitted':
      return {
        label: 'Enviado',
        classes: 'bg-blue-50 border-blue-300 text-blue-800',
      };
    case 'returned':
      return {
        label: 'Devuelto',
        classes: 'bg-amber-50 border-amber-300 text-amber-800',
      };
    case 'draft':
      return {
        label: 'Borrador',
        classes: 'bg-slate-100 border-slate-300 text-slate-700',
      };
    default:
      return {
        label: 'Sin subir',
        classes: 'bg-white border-slate-200 text-slate-500',
      };
  }
}

interface AdminSchoolReportUploadProps {
  year: number;
  profile: UserProfile;
  schools: School[];
  parteMensualReports: ParteMensualReport[];
  monthlyReports: MonthlyReport[];
  annualReports: AnnualReport[];
  reportsLoaded?: boolean;
  onGoToSchools?: () => void;
}

export function AdminSchoolReportUpload({
  year,
  profile,
  schools,
  parteMensualReports,
  monthlyReports,
  annualReports,
  reportsLoaded = true,
  onGoToSchools,
}: AdminSchoolReportUploadProps) {
  const [kind, setKind] = useState<UploadReportKind>('parteMensual');
  const [selectedDistrict, setSelectedDistrict] = useState<'all' | DistrictCode | 'unassigned'>('all');
  const [selectedCenterType, setSelectedCenterType] = useState<CenterTypeFilter>('all');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel>('basica');
  const [selectedMonth, setSelectedMonth] = useState<number>(() =>
    clampSchoolMonth(new Date().getMonth() + 1)
  );

  const sortedSchools = useMemo(() => {
    return [...schools]
      .filter((s) => s.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [schools]);

  const hasUnassignedDistrict = useMemo(
    () => sortedSchools.some((s) => !s.district),
    [sortedSchools]
  );

  const filteredSchools = useMemo(() => {
    const byFilters = sortedSchools.filter((s) => {
      if (selectedDistrict === 'unassigned') {
        if (s.district) return false;
      } else if (selectedDistrict !== 'all' && s.district !== selectedDistrict) {
        return false;
      }
      if (!schoolMatchesCenterTypeFilter(s, selectedCenterType)) {
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
        s.community.toLowerCase().includes(q)
    );
  }, [sortedSchools, selectedDistrict, selectedCenterType, schoolSearch]);

  useEffect(() => {
    if (filteredSchools.length === 0) {
      if (selectedSchoolId !== '') setSelectedSchoolId('');
      return;
    }
    if (!filteredSchools.some((s) => s.id === selectedSchoolId)) {
      setSelectedSchoolId(filteredSchools[0].id);
    }
  }, [filteredSchools, selectedSchoolId]);

  const selectedSchool = useMemo(
    () => sortedSchools.find((s) => s.id === selectedSchoolId) || null,
    [sortedSchools, selectedSchoolId]
  );

  const availableLevels = useMemo(() => {
    if (!selectedSchool) return ['basica'] as EducationLevel[];
    const raw: EducationLevel[] =
      selectedSchool.levels.length > 0 ? selectedSchool.levels : ['basica'];
    return [...raw].sort(
      (a, b) => (LEVEL_DISPLAY_ORDER[a] ?? 99) - (LEVEL_DISPLAY_ORDER[b] ?? 99)
    );
  }, [selectedSchool]);

  useEffect(() => {
    if (!availableLevels.includes(selectedLevel)) {
      setSelectedLevel(availableLevels[0]);
    }
  }, [availableLevels, selectedLevel]);

  const currentSchoolMonthStatuses = useMemo(() => {
    if (!selectedSchool) return new Map<number, ReportStatus>();
    const map = new Map<number, ReportStatus>();
    const list =
      kind === 'parteMensual' ? parteMensualReports : monthlyReports;
    for (const r of list) {
      if (
        r.year === year &&
        r.schoolId === selectedSchool.id &&
        r.level === selectedLevel
      ) {
        map.set(r.month, r.status);
      }
    }
    return map;
  }, [selectedSchool, kind, parteMensualReports, monthlyReports, year, selectedLevel]);

  const currentSchoolAnnualStatuses = useMemo(() => {
    if (!selectedSchool) return new Map<EducationLevel, ReportStatus>();
    const map = new Map<EducationLevel, ReportStatus>();
    for (const r of annualReports) {
      if (r.year === year && r.schoolId === selectedSchool.id) {
        map.set(r.level, r.status);
      }
    }
    return map;
  }, [selectedSchool, annualReports, year]);

  const currentParteMensualReport = useMemo(() => {
    if (!selectedSchool) return null;
    return (
      parteMensualReports.find(
        (r) =>
          r.year === year &&
          r.month === selectedMonth &&
          r.schoolId === selectedSchool.id &&
          r.level === selectedLevel
      ) ?? null
    );
  }, [parteMensualReports, year, selectedMonth, selectedSchool, selectedLevel]);

  const currentMonthlyReport = useMemo(() => {
    if (!selectedSchool) return null;
    return (
      monthlyReports.find(
        (r) =>
          r.year === year &&
          r.month === selectedMonth &&
          r.schoolId === selectedSchool.id &&
          r.level === selectedLevel
      ) ?? null
    );
  }, [monthlyReports, year, selectedMonth, selectedSchool, selectedLevel]);

  const currentAnnualReport = useMemo(() => {
    if (!selectedSchool) return null;
    return (
      annualReports.find(
        (r) =>
          r.year === year &&
          r.schoolId === selectedSchool.id &&
          r.level === selectedLevel
      ) ?? null
    );
  }, [annualReports, year, selectedSchool, selectedLevel]);

  if (sortedSchools.length === 0) {
    return (
      <div className="bg-white border border-slate-200 p-8 text-center space-y-3">
        <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
        <p className="text-sm font-semibold text-slate-900">
          No hay centros educativos activos registrados
        </p>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Registra primero al menos un centro educativo en el catálogo para poder subir sus
          partes mensuales o cuadros de fin de año.
        </p>
        {onGoToSchools && (
          <button
            type="button"
            onClick={onGoToSchools}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
          >
            Ir a Centros y Directores
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-700" />
              Subir Reportes de Centros Educativos ({year})
            </h2>
            <p className="text-xs text-slate-600">
              Permite a administradores y asistentes técnicos capturar, corregir, enviar o aprobar
              directamente el Parte Mensual, Movimientos-SACE y Cuadros de Fin de Año de cualquier
              centro educativo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => setKind('parteMensual')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                kind === 'parteMensual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Parte Mensual
            </button>
            <button
              type="button"
              onClick={() => setKind('monthly')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                kind === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Movimientos-SACE
            </button>
            <button
              type="button"
              onClick={() => setKind('annual')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                kind === 'annual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileBarChart2 className="w-3.5 h-3.5" />
              Cuadro de Fin de Año
            </button>
          </div>
        </div>

        {/* District, School, Level & Month Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-slate-200 text-xs">
          <div className="md:col-span-2">
            <label className="block font-medium text-slate-700 mb-1">
              Distrito
            </label>
            <select
              value={selectedDistrict}
              onChange={(e) =>
                setSelectedDistrict(e.target.value as 'all' | DistrictCode | 'unassigned')
              }
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              <option value="all">Todos los distritos</option>
              {DISTRICT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              {hasUnassignedDistrict && (
                <option value="unassigned">Sin distrito asignado</option>
              )}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block font-medium text-slate-700 mb-1">
              Tipo de centro
            </label>
            <select
              value={selectedCenterType}
              onChange={(e) => setSelectedCenterType(e.target.value as CenterTypeFilter)}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              {CENTER_TYPE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block font-medium text-slate-700 mb-1">
              Buscar centro o SACE
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                placeholder="Nombre, SACE..."
                className="w-full pl-8 pr-3 py-2 border border-slate-300 bg-white"
              />
            </div>
          </div>

          <div className={kind === 'annual' ? 'md:col-span-3' : 'md:col-span-2'}>
            <label className="block font-medium text-slate-700 mb-1">
              Centro Educativo ({filteredSchools.length})
            </label>
            <select
              value={selectedSchool?.id || ''}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              {filteredSchools.length === 0 ? (
                <option value="">
                  {schoolSearch.trim()
                    ? `Sin coincidencias para "${schoolSearch}"`
                    : 'Sin centros en este distrito'}
                </option>
              ) : (
                filteredSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.saceCode} · {s.name} ({getDistrictLabel(s.district)} · {s.community})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className={kind === 'annual' ? 'md:col-span-3' : 'md:col-span-2'}>
            <label className="block font-medium text-slate-700 mb-1">
              Nivel Educativo del Centro
            </label>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100">
              {availableLevels.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(lvl)}
                  className={`flex-1 px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    selectedLevel === lvl
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {getSchoolLevelLabel(lvl, selectedSchool || undefined)}
                </button>
              ))}
            </div>
          </div>

          {kind !== 'annual' && (
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Mes</label>
              <select
                value={clampSchoolMonth(selectedMonth)}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
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
        </div>

        {/* Selected School Info & Quick Navigation Status Strip */}
        {selectedSchool && (
          <div className="pt-3 border-t border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{selectedSchool.name}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{selectedSchool.saceCode}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-semibold border ${
                    selectedSchool.district
                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  {getDistrictLabel(selectedSchool.district)}
                </span>
                <span aria-hidden="true">·</span>
                <span>{selectedSchool.community}</span>
                {getSchoolCenterTypesSummary(selectedSchool) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-700">
                      {getSchoolCenterTypesSummary(selectedSchool)}
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>
                  Director(a):{' '}
                  <strong className="text-slate-800">
                    {selectedSchool.directorDisplayName || 'Sin director vinculado'}
                  </strong>
                </span>
              </div>
              {onGoToSchools && (
                <button
                  type="button"
                  onClick={onGoToSchools}
                  className="text-blue-700 hover:underline font-medium cursor-pointer"
                >
                  Editar datos/niveles del centro
                </button>
              )}
            </div>

            {kind !== 'annual' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500 mr-1">
                  Estado {year} ({getSchoolLevelLabel(selectedLevel, selectedSchool)}):
                </span>
                {SCHOOL_MONTHS.map((m) => {
                  const st = currentSchoolMonthStatuses.get(m.value);
                  const style = getStatusPillStyle(st);
                  const isCurrent = selectedMonth === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setSelectedMonth(m.value)}
                      title={`${m.label}: ${style.label}`}
                      className={`px-2 py-1 text-[11px] font-medium border cursor-pointer transition-all ${
                        style.classes
                      } ${isCurrent ? 'ring-2 ring-blue-600 ring-offset-1' : 'hover:opacity-85'}`}
                    >
                      {m.label.slice(0, 3)} · {style.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500 mr-1">
                  Estado Cuadro Anual {year}:
                </span>
                {availableLevels.map((lvl) => {
                  const st = currentSchoolAnnualStatuses.get(lvl);
                  const style = getStatusPillStyle(st);
                  const isCurrent = selectedLevel === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSelectedLevel(lvl)}
                      className={`px-2.5 py-1 text-[11px] font-medium border cursor-pointer transition-all ${
                        style.classes
                      } ${isCurrent ? 'ring-2 ring-blue-600 ring-offset-1' : 'hover:opacity-85'}`}
                    >
                      {getSchoolLevelLabel(lvl, selectedSchool)} · {style.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Embedded Editor */}
      {selectedSchool ? (
        <>
          {kind === 'parteMensual' && (
            <ParteMensualEditor
              key={`pm_${year}_${selectedMonth}_${selectedSchool.id}_${selectedLevel}`}
              year={year}
              month={selectedMonth}
              level={selectedLevel}
              basicaScope={
                selectedLevel === 'basica' ? getBasicaScope(selectedSchool) : undefined
              }
              school={selectedSchool}
              profile={profile}
              prefetchedReport={currentParteMensualReport}
              prefetchedLoaded={reportsLoaded}
              prefetchedParteMensualReports={parteMensualReports}
            />
          )}

          {kind === 'monthly' && (
            <MovimientosSaceEditor
              key={`mov_${year}_${selectedMonth}_${selectedSchool.id}_${selectedLevel}`}
              year={year}
              month={selectedMonth}
              level={selectedLevel}
              school={selectedSchool}
              profile={profile}
              prefetchedReport={currentMonthlyReport}
              prefetchedLoaded={reportsLoaded}
            />
          )}

          {kind === 'annual' && selectedLevel === 'prebasica' && (
            <PrebasicaAnnualEditor
              key={`ann_pre_${year}_${selectedSchool.id}`}
              year={year}
              school={selectedSchool}
              profile={profile}
              prefetchedReport={currentAnnualReport}
              prefetchedLoaded={reportsLoaded}
              prefetchedParteMensualReports={parteMensualReports}
            />
          )}

          {kind === 'annual' && selectedLevel === 'basica' && (
            <BasicaAnnualEditor
              key={`ann_bas_${year}_${selectedSchool.id}_${getBasicaScope(selectedSchool)}`}
              year={year}
              basicaScope={getBasicaScope(selectedSchool)}
              school={selectedSchool}
              profile={profile}
              prefetchedReport={currentAnnualReport}
              prefetchedLoaded={reportsLoaded}
              prefetchedParteMensualReports={parteMensualReports}
            />
          )}

          {kind === 'annual' && selectedLevel === 'media' && (
            <MediaAnnualEditor
              key={`ann_med_${year}_${selectedSchool.id}`}
              year={year}
              school={selectedSchool}
              profile={profile}
              prefetchedReport={currentAnnualReport}
              prefetchedLoaded={reportsLoaded}
              prefetchedParteMensualReports={parteMensualReports}
            />
          )}
        </>
      ) : (
        <div className="bg-white border border-slate-200 p-8 text-center space-y-2">
          <Building2 className="w-7 h-7 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">
            No hay centros educativos que coincidan con el filtro actual
          </p>
          <p className="text-xs text-slate-600">
            Cambia el filtro de distrito o borra el texto de búsqueda para seleccionar un centro educativo.
          </p>
        </div>
      )}
    </div>
  );
}

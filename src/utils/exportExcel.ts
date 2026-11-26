import ExcelJS from 'exceljs';
import type {
  BasicaAnnualData,
  BasicaScope,
  EducationLevel,
  EstadisticoRow,
  EvaluacionFinalRow,
  MediaAnnualData,
  MonthlyReport,
  MovementRow,
  ParteMensualComputedRow,
  PrebasicaAnnualData,
} from '../types/sace';
import {
  BASICA_AGES,
  BASICA_ALL_GRADES,
  BASICA_CYCLE_1_2,
  BASICA_CYCLE_3,
  BASICA_EGRESADOS_AGES,
  BASICA_EVAL_AREAS,
  BASICA_RESUMEN_SUBJECTS,
  BASICA_SCOPE_SHORT_LABELS,
  BASICA_SUBJECTS,
  LEVEL_LABELS,
  MEDIA_AGES,
  MEDIA_DECIMO_SUBJECTS,
  MEDIA_GRADES,
  MEDIA_RESUMEN_SUBJECTS,
  MEDIA_UNDECIMO_SUBJECTS,
  MONTHS,
  PREBASICA_AGES,
  PREBASICA_GRADES,
  addFM,
  addIBAE,
  addNV,
  emptyFM,
  emptyIBAE,
  emptyNV,
  getBasicaGradesForScope,
  getParteMensualGrades,
  normalizePrebasicaData,
  sumEstadisticoRows,
  sumEvaluacionFinalRows,
  sumParteMensualComputedRows,
  totalANA,
  totalFM,
  totalIBAE,
  totalNV,
} from './saceCalculations';

export interface ExportMeta {
  year: number;
  schoolName: string;
  saceCode: string;
  community: string;
  directorName?: string;
  directorDni?: string;
  placeAndDate?: string;
  sector?: 'gubernamental' | 'no_gubernamental';
  modality?: 'presencial' | 'isemed' | 'acelerado';
  basicaScope?: BasicaScope;
  isConsolidated?: boolean;
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF1E293B' } },
  left: { style: 'thin', color: { argb: 'FF1E293B' } },
  bottom: { style: 'thin', color: { argb: 'FF1E293B' } },
  right: { style: 'thin', color: { argb: 'FF1E293B' } },
};

const HEADER_FILL_GREEN: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9EAD3' },
};

const SUBHEADER_FILL_BLUE: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E1F2' },
};

const TOTAL_FILL_YELLOW: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF2CC' },
};

const SUBTOTAL_FILL_GRAY: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2EFDA' },
};

function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function addOfficialBanner(
  sheet: ExcelJS.Worksheet,
  totalCols: number,
  title: string,
  meta: ExportMeta
) {
  const lastCol = Math.max(totalCols, 8);
  sheet.mergeCells(1, 1, 1, lastCol);
  sheet.getCell(1, 1).value = 'GOBIERNO DE LA REPÚBLICA DE HONDURAS · SECRETARÍA DE EDUCACIÓN';
  sheet.getCell(1, 1).font = { name: 'Calibri', size: 11, bold: true };
  sheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells(2, 1, 2, lastCol);
  sheet.getCell(2, 1).value =
    'DIRECCIÓN DEPARTAMENTAL DE EDUCACIÓN DE CORTÉS · DISTRITO EDUCATIVO N° 18-B, OMOA';
  sheet.getCell(2, 1).font = { name: 'Calibri', size: 10, bold: true };
  sheet.getCell(2, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells(3, 1, 3, lastCol);
  sheet.getCell(3, 1).value = title;
  sheet.getCell(3, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  sheet.getCell(3, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  const half = Math.max(4, Math.floor(lastCol * 0.65));
  sheet.mergeCells(5, 1, 5, half);
  sheet.getCell(5, 1).value = `Centro Educativo: ${meta.schoolName}`;
  sheet.getCell(5, 1).font = { name: 'Calibri', size: 10, bold: true };

  sheet.mergeCells(5, half + 1, 5, lastCol);
  sheet.getCell(5, half + 1).value = `Código SACE: ${meta.saceCode || 'CONSOLIDADO DISTRITAL'}`;
  sheet.getCell(5, half + 1).font = { name: 'Calibri', size: 10, bold: true };

  sheet.mergeCells(6, 1, 6, half);
  sheet.getCell(6, 1).value = `Lugar / Comunidad: ${meta.community || 'Omoa, Cortés'}`;
  sheet.getCell(6, 1).font = { name: 'Calibri', size: 9.5 };

  sheet.mergeCells(6, half + 1, 6, lastCol);
  sheet.getCell(6, half + 1).value = `Año Lectivo: ${meta.year}`;
  sheet.getCell(6, half + 1).font = { name: 'Calibri', size: 9.5 };
}

function addSignatureFooter(sheet: ExcelJS.Worksheet, startRow: number, totalCols: number, meta: ExportMeta) {
  const half = Math.max(3, Math.floor(totalCols / 2));
  sheet.mergeCells(startRow, 1, startRow, half);
  sheet.getCell(startRow, 1).value = `Lugar y fecha: ${meta.placeAndDate || 'Omoa, Cortés, ' + meta.year}`;
  sheet.getCell(startRow, 1).font = { name: 'Calibri', size: 9.5 };

  sheet.mergeCells(startRow, half + 1, startRow, totalCols);
  sheet.getCell(startRow, half + 1).value = `Firma y sello: ______________________________`;
  sheet.getCell(startRow, half + 1).font = { name: 'Calibri', size: 9.5 };

  if (meta.directorName || meta.directorDni) {
    sheet.mergeCells(startRow + 1, 1, startRow + 1, half);
    sheet.getCell(startRow + 1, 1).value = `Director(a): ${meta.directorName || ''}`;
    sheet.getCell(startRow + 1, 1).font = { name: 'Calibri', size: 9.5 };
    sheet.mergeCells(startRow + 1, half + 1, startRow + 1, totalCols);
    sheet.getCell(startRow + 1, half + 1).value = `N° Identidad: ${meta.directorDni || ''}`;
    sheet.getCell(startRow + 1, half + 1).font = { name: 'Calibri', size: 9.5 };
  }
}

function styleCell(
  cell: ExcelJS.Cell,
  options: {
    bold?: boolean;
    fill?: ExcelJS.Fill;
    align?: 'left' | 'center' | 'right';
    numFmt?: string;
    size?: number;
  } = {}
) {
  cell.border = THIN_BORDER;
  cell.font = {
    name: 'Calibri',
    size: options.size || 9.5,
    bold: Boolean(options.bold),
  };
  if (options.fill) cell.fill = options.fill;
  cell.alignment = {
    horizontal: options.align || 'center',
    vertical: 'middle',
    wrapText: true,
  };
  if (options.numFmt) cell.numFmt = options.numFmt;
}

function populateEstadisticoSheet(
  sheet: ExcelJS.Worksheet,
  title: string,
  meta: ExportMeta,
  groups: { label: string; rows: { label: string; data: EstadisticoRow }[]; subtotalLabel?: string }[]
) {
  const categories = [
    'Mat. Inicial',
    'Mat. Final',
    'Ingresos',
    'Desertores',
    'Traslados',
    'Aprobados',
    'Reprobados',
    'Egresados',
  ];
  const totalCols = 1 + categories.length * 3;
  addOfficialBanner(sheet, totalCols, title, meta);

  const headerRow1 = 8;
  const headerRow2 = 9;
  sheet.mergeCells(headerRow1, 1, headerRow2, 1);
  sheet.getCell(headerRow1, 1).value = 'GRADOS';
  styleCell(sheet.getCell(headerRow1, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(sheet.getCell(headerRow2, 1), { bold: true, fill: HEADER_FILL_GREEN });

  categories.forEach((cat, idx) => {
    const startCol = 2 + idx * 3;
    sheet.mergeCells(headerRow1, startCol, headerRow1, startCol + 2);
    sheet.getCell(headerRow1, startCol).value = cat;
    styleCell(sheet.getCell(headerRow1, startCol), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(sheet.getCell(headerRow1, startCol + 1), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(sheet.getCell(headerRow1, startCol + 2), { bold: true, fill: HEADER_FILL_GREEN });

    ['N', 'V', 'T'].forEach((sub, sIdx) => {
      sheet.getCell(headerRow2, startCol + sIdx).value = sub;
      styleCell(sheet.getCell(headerRow2, startCol + sIdx), {
        bold: true,
        fill: SUBHEADER_FILL_BLUE,
      });
    });
  });

  let currentRow = 10;
  const allRows: EstadisticoRow[] = [];

  const writeRow = (label: string, row: EstadisticoRow, fill?: ExcelJS.Fill, bold = false) => {
    sheet.getCell(currentRow, 1).value = label;
    styleCell(sheet.getCell(currentRow, 1), { bold, fill, align: 'left' });

    const vals = [
      row.matInicial,
      row.matFinal,
      row.ingresos,
      row.desertores,
      row.traslados,
      row.aprobados,
      row.reprobados,
      row.egresados,
    ];
    vals.forEach((nv, idx) => {
      const c = 2 + idx * 3;
      sheet.getCell(currentRow, c).value = nv.n;
      sheet.getCell(currentRow, c + 1).value = nv.v;
      sheet.getCell(currentRow, c + 2).value = totalNV(nv);
      styleCell(sheet.getCell(currentRow, c), { bold, fill, align: 'right', numFmt: '#,##0' });
      styleCell(sheet.getCell(currentRow, c + 1), { bold, fill, align: 'right', numFmt: '#,##0' });
      styleCell(sheet.getCell(currentRow, c + 2), {
        bold: true,
        fill: fill || SUBHEADER_FILL_BLUE,
        align: 'right',
        numFmt: '#,##0',
      });
    });
    currentRow++;
  };

  for (const grp of groups) {
    const grpRows: EstadisticoRow[] = [];
    for (const r of grp.rows) {
      writeRow(r.label, r.data);
      grpRows.push(r.data);
      allRows.push(r.data);
    }
    if (grp.subtotalLabel) {
      writeRow(grp.subtotalLabel, sumEstadisticoRows(grpRows), SUBTOTAL_FILL_GRAY, true);
    }
  }

  writeRow('TOTAL', sumEstadisticoRows(allRows), TOTAL_FILL_YELLOW, true);

  sheet.getColumn(1).width = 18;
  for (let c = 2; c <= totalCols; c++) sheet.getColumn(c).width = 6.5;

  addSignatureFooter(sheet, currentRow + 2, totalCols, meta);
}

export async function exportMonthlyReportExcel(
  reports: MonthlyReport[],
  meta: ExportMeta & { month: number; level: EducationLevel }
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Movimientos SACE', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const monthLabel = MONTHS.find((m) => m.value === meta.month)?.label || String(meta.month);
  const levelTitle =
    meta.level === 'basica' && meta.basicaScope
      ? `BÁSICA (${BASICA_SCOPE_SHORT_LABELS[meta.basicaScope].toUpperCase()})`
      : LEVEL_LABELS[meta.level].toUpperCase();
  const totalCols = meta.isConsolidated ? 8 : 7;
  addOfficialBanner(
    sheet,
    totalCols,
    `REPORTE DE MOVIMIENTOS-SACE · ${levelTitle} · ${monthLabel.toUpperCase()} ${meta.year}`,
    meta
  );

  let rowIdx = 8;

  const writeSection = (
    sectionTitle: string,
    colorHex: string,
    rows: (MovementRow & { schoolName?: string })[]
  ) => {
    sheet.mergeCells(rowIdx, 1, rowIdx, totalCols);
    sheet.getCell(rowIdx, 1).value = sectionTitle;
    sheet.getCell(rowIdx, 1).font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: colorHex },
    };
    sheet.getCell(rowIdx, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    rowIdx++;

    const headers = meta.isConsolidated
      ? ['N°', 'Centro Educativo', 'RNE', 'NOMBRE', 'SEXO', 'ACCIÓN', 'GRADO Y SECCIÓN', 'MES']
      : ['N°', 'RNE', 'NOMBRE', 'SEXO', 'ACCIÓN', 'GRADO Y SECCIÓN', 'MES'];

    headers.forEach((h, i) => {
      sheet.getCell(rowIdx, i + 1).value = h;
      styleCell(sheet.getCell(rowIdx, i + 1), { bold: true, fill: HEADER_FILL_GREEN });
    });
    rowIdx++;

    if (rows.length === 0) {
      sheet.mergeCells(rowIdx, 1, rowIdx, totalCols);
      sheet.getCell(rowIdx, 1).value =
        !meta.isConsolidated && reports.length === 1 && reports[0]?.noMovements
          ? 'Mes reportado sin movimientos SACE en esta sección.'
          : 'Sin movimientos registrados en esta sección.';
      styleCell(sheet.getCell(rowIdx, 1), { align: 'center' });
      rowIdx += 2;
      return;
    }

    rows.forEach((r, idx) => {
      const values = meta.isConsolidated
        ? [idx + 1, r.schoolName || '', r.rne, r.nombre, r.sexo, r.accion, r.gradoSeccion, r.mes]
        : [idx + 1, r.rne, r.nombre, r.sexo, r.accion, r.gradoSeccion, r.mes];

      values.forEach((v, i) => {
        sheet.getCell(rowIdx, i + 1).value = v;
        styleCell(sheet.getCell(rowIdx, i + 1), {
          align: i === 0 || i === (meta.isConsolidated ? 4 : 3) ? 'center' : 'left',
        });
      });
      rowIdx++;
    });
    rowIdx++;
  };

  const ingresos = reports.flatMap((rep) =>
    (rep.ingresos || []).map((r) => ({ ...r, schoolName: rep.schoolName }))
  );
  const traslados = reports.flatMap((rep) =>
    (rep.traslados || []).map((r) => ({ ...r, schoolName: rep.schoolName }))
  );
  const desertores = reports.flatMap((rep) =>
    (rep.desertores || []).map((r) => ({ ...r, schoolName: rep.schoolName }))
  );

  writeSection('INGRESOS', 'FF15803D', ingresos);
  writeSection('TRASLADOS', 'FFB45309', traslados);
  writeSection('DESERTORES', 'FFB91C1C', desertores);

  if (meta.isConsolidated) {
    [6, 26, 18, 28, 8, 20, 18, 14].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  } else {
    [6, 18, 30, 8, 22, 20, 14].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  }

  addSignatureFooter(sheet, rowIdx + 1, totalCols, meta);
  downloadWorkbook(
    workbook,
    `Movimientos_SACE_${LEVEL_LABELS[meta.level]}_${monthLabel}_${meta.year}.xlsx`
  );
}

export async function exportBasicaExcel(data: BasicaAnnualData, meta: ExportMeta) {
  const workbook = new ExcelJS.Workbook();
  const scope: BasicaScope = meta.basicaScope || 'c1_2_3';
  const includeC12 = scope !== 'c3';
  const includeC3 = scope !== 'c1_2';
  const activeGrades = getBasicaGradesForScope(scope);
  const scopeSuffix =
    scope === 'c1_2_3' ? 'BÁSICA' : `BÁSICA (${BASICA_SCOPE_SHORT_LABELS[scope].toUpperCase()})`;

  // Sheet 1: Estadístico Final
  const s1 = workbook.addWorksheet('1. Estadístico Final', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const estGroups: {
    label: string;
    rows: { label: string; data: EstadisticoRow }[];
    subtotalLabel?: string;
  }[] = [];
  if (includeC12) {
    estGroups.push({
      label: 'I y II Ciclo',
      rows: BASICA_CYCLE_1_2.map((g) => ({
        label: g.shortLabel,
        data: data.estadisticoFinal[g.key],
      })),
      subtotalLabel: includeC3 ? 'SUBTOTAL I y II Ciclo' : undefined,
    });
  }
  if (includeC3) {
    estGroups.push({
      label: 'III Ciclo',
      rows: BASICA_CYCLE_3.map((g) => ({
        label: g.shortLabel,
        data: data.estadisticoFinal[g.key],
      })),
      subtotalLabel: includeC12 ? 'SUBTOTAL III Ciclo' : undefined,
    });
  }
  populateEstadisticoSheet(s1, `REPORTE ESTADÍSTICO FINAL-SACE ${scopeSuffix} ${meta.year}`, meta, estGroups);

  // Sheet 2: Matrícula por Edades
  const s2 = workbook.addWorksheet('2. Matrícula Edades', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const s2Cols = 1 + (BASICA_AGES.length + 1) * 3;
  addOfficialBanner(s2, s2Cols, `MATRÍCULA FINAL POR EDADES ${scopeSuffix} ${meta.year}`, meta);

  s2.mergeCells(8, 1, 9, 1);
  s2.getCell(8, 1).value = 'Grado';
  styleCell(s2.getCell(8, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(s2.getCell(9, 1), { bold: true, fill: HEADER_FILL_GREEN });

  [...BASICA_AGES.map((a) => a.label), 'TOTAL'].forEach((lbl, idx) => {
    const c = 2 + idx * 3;
    s2.mergeCells(8, c, 8, c + 2);
    s2.getCell(8, c).value = lbl;
    styleCell(s2.getCell(8, c), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s2.getCell(8, c + 1), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s2.getCell(8, c + 2), { bold: true, fill: HEADER_FILL_GREEN });
    ['N', 'V', 'T'].forEach((sub, sIdx) => {
      s2.getCell(9, c + sIdx).value = sub;
      styleCell(s2.getCell(9, c + sIdx), { bold: true, fill: SUBHEADER_FILL_BLUE });
    });
  });

  let r2 = 10;
  const colAgeTotals = BASICA_AGES.map(() => emptyNV());
  for (const g of activeGrades) {
    s2.getCell(r2, 1).value = g.label;
    styleCell(s2.getCell(r2, 1), { align: 'left', bold: true });
    let rowSum = emptyNV();
    BASICA_AGES.forEach((age, idx) => {
      const nv = data.matriculaEdades[g.key][age.key] || emptyNV();
      rowSum = addNV(rowSum, nv);
      colAgeTotals[idx] = addNV(colAgeTotals[idx], nv);
      const c = 2 + idx * 3;
      s2.getCell(r2, c).value = nv.n;
      s2.getCell(r2, c + 1).value = nv.v;
      s2.getCell(r2, c + 2).value = totalNV(nv);
      styleCell(s2.getCell(r2, c), { align: 'right', numFmt: '#,##0' });
      styleCell(s2.getCell(r2, c + 1), { align: 'right', numFmt: '#,##0' });
      styleCell(s2.getCell(r2, c + 2), { bold: true, fill: SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });
    });
    const tc = 2 + BASICA_AGES.length * 3;
    s2.getCell(r2, tc).value = rowSum.n;
    s2.getCell(r2, tc + 1).value = rowSum.v;
    s2.getCell(r2, tc + 2).value = totalNV(rowSum);
    styleCell(s2.getCell(r2, tc), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, tc + 1), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, tc + 2), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
    r2++;
  }
  s2.getCell(r2, 1).value = 'TOTAL';
  styleCell(s2.getCell(r2, 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'left' });
  let grandAge = emptyNV();
  colAgeTotals.forEach((nv, idx) => {
    grandAge = addNV(grandAge, nv);
    const c = 2 + idx * 3;
    s2.getCell(r2, c).value = nv.n;
    s2.getCell(r2, c + 1).value = nv.v;
    s2.getCell(r2, c + 2).value = totalNV(nv);
    styleCell(s2.getCell(r2, c), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, c + 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, c + 2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  });
  const tc2 = 2 + BASICA_AGES.length * 3;
  s2.getCell(r2, tc2).value = grandAge.n;
  s2.getCell(r2, tc2 + 1).value = grandAge.v;
  s2.getCell(r2, tc2 + 2).value = totalNV(grandAge);
  styleCell(s2.getCell(r2, tc2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  styleCell(s2.getCell(r2, tc2 + 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  styleCell(s2.getCell(r2, tc2 + 2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  s2.getColumn(1).width = 16;
  for (let c = 2; c <= s2Cols; c++) s2.getColumn(c).width = 5.5;
  addSignatureFooter(s2, r2 + 2, s2Cols, meta);

  // Sheet 3: Aprobados y No Aprobados por Área
  const s3 = workbook.addWorksheet('3. Aprobados por Área', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const s3Cols = 1 + BASICA_SUBJECTS.length * 3;
  addOfficialBanner(
    s3,
    s3Cols,
    `REPORTE DE APROBADOS Y NO APROBADOS POR ÁREA DE RENDIMIENTO ACADÉMICO ${scopeSuffix} ${meta.year}`,
    meta
  );
  s3.mergeCells(8, 1, 9, 1);
  s3.getCell(8, 1).value = 'Grado';
  styleCell(s3.getCell(8, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(s3.getCell(9, 1), { bold: true, fill: HEADER_FILL_GREEN });
  BASICA_SUBJECTS.forEach((subj, idx) => {
    const c = 2 + idx * 3;
    s3.mergeCells(8, c, 8, c + 2);
    s3.getCell(8, c).value = subj.label;
    styleCell(s3.getCell(8, c), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s3.getCell(8, c + 1), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s3.getCell(8, c + 2), { bold: true, fill: HEADER_FILL_GREEN });
    ['A', 'NA', 'T'].forEach((sub, sIdx) => {
      s3.getCell(9, c + sIdx).value = sub;
      styleCell(s3.getCell(9, c + sIdx), { bold: true, fill: SUBHEADER_FILL_BLUE });
    });
  });

  let r3 = 10;
  const writeS3Group = (grades: typeof BASICA_ALL_GRADES, subLabel?: string) => {
    const totals = BASICA_SUBJECTS.map(() => ({ a: 0, na: 0 }));
    for (const g of grades) {
      s3.getCell(r3, 1).value = g.label;
      styleCell(s3.getCell(r3, 1), { align: 'left' });
      BASICA_SUBJECTS.forEach((subj, idx) => {
        const cellVal = data.aprobadosPorArea[g.key][subj.key] || { a: 0, na: 0 };
        totals[idx].a += cellVal.a;
        totals[idx].na += cellVal.na;
        const c = 2 + idx * 3;
        s3.getCell(r3, c).value = cellVal.a;
        s3.getCell(r3, c + 1).value = cellVal.na;
        s3.getCell(r3, c + 2).value = totalANA(cellVal);
        styleCell(s3.getCell(r3, c), { align: 'right', numFmt: '#,##0' });
        styleCell(s3.getCell(r3, c + 1), { align: 'right', numFmt: '#,##0' });
        styleCell(s3.getCell(r3, c + 2), { bold: true, fill: SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });
      });
      r3++;
    }
    if (subLabel) {
      s3.getCell(r3, 1).value = subLabel;
      styleCell(s3.getCell(r3, 1), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'left' });
      totals.forEach((tot, idx) => {
        const c = 2 + idx * 3;
        s3.getCell(r3, c).value = tot.a;
        s3.getCell(r3, c + 1).value = tot.na;
        s3.getCell(r3, c + 2).value = tot.a + tot.na;
        styleCell(s3.getCell(r3, c), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
        styleCell(s3.getCell(r3, c + 1), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
        styleCell(s3.getCell(r3, c + 2), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
      });
      r3++;
    }
    return totals;
  };

  const t12 = includeC12
    ? writeS3Group(BASICA_CYCLE_1_2, includeC3 ? 'Subtotal I y II Ciclo' : undefined)
    : BASICA_SUBJECTS.map(() => ({ a: 0, na: 0 }));
  const t3 = includeC3
    ? writeS3Group(BASICA_CYCLE_3, includeC12 ? 'Subtotal III Ciclo' : undefined)
    : BASICA_SUBJECTS.map(() => ({ a: 0, na: 0 }));
  s3.getCell(r3, 1).value = 'Total';
  styleCell(s3.getCell(r3, 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'left' });
  BASICA_SUBJECTS.forEach((_, idx) => {
    const a = t12[idx].a + t3[idx].a;
    const na = t12[idx].na + t3[idx].na;
    const c = 2 + idx * 3;
    s3.getCell(r3, c).value = a;
    s3.getCell(r3, c + 1).value = na;
    s3.getCell(r3, c + 2).value = a + na;
    styleCell(s3.getCell(r3, c), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    styleCell(s3.getCell(r3, c + 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    styleCell(s3.getCell(r3, c + 2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  });
  s3.getColumn(1).width = 18;
  for (let c = 2; c <= s3Cols; c++) s3.getColumn(c).width = 6;
  addSignatureFooter(s3, r3 + 2, s3Cols, meta);

  // Sheet 4: Resultados de Evaluación Final
  const s4 = workbook.addWorksheet('4. Evaluación Final', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const evalCats = [
    'Matrícula inicial',
    'Matrícula Final',
    'Ingresos',
    'Desertores',
    'Traslados',
    'Evaluados',
    'Inicial',
    'Básico',
    'Avanzado',
    'Excelente',
    'Repitentes evaluados',
  ];
  const s4Cols = 1 + evalCats.length * 3;
  addOfficialBanner(s4, s4Cols, `RESULTADOS DE EVALUACIÓN FINAL ${scopeSuffix} ${meta.year}`, meta);
  s4.mergeCells(8, 1, 9, 1);
  s4.getCell(8, 1).value = 'Grado';
  styleCell(s4.getCell(8, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(s4.getCell(9, 1), { bold: true, fill: HEADER_FILL_GREEN });
  evalCats.forEach((cat, idx) => {
    const c = 2 + idx * 3;
    s4.mergeCells(8, c, 8, c + 2);
    s4.getCell(8, c).value = cat;
    styleCell(s4.getCell(8, c), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s4.getCell(8, c + 1), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s4.getCell(8, c + 2), { bold: true, fill: HEADER_FILL_GREEN });
    ['N', 'V', 'T'].forEach((sub, sIdx) => {
      s4.getCell(9, c + sIdx).value = sub;
      styleCell(s4.getCell(9, c + sIdx), { bold: true, fill: SUBHEADER_FILL_BLUE });
    });
  });

  let r4 = 10;
  const writeS4Row = (label: string, row: EvaluacionFinalRow, fill?: ExcelJS.Fill, bold = false) => {
    s4.getCell(r4, 1).value = label;
    styleCell(s4.getCell(r4, 1), { bold, fill, align: 'left' });
    const vals = [
      row.matInicial,
      row.matFinal,
      row.ingresos,
      row.desertores,
      row.traslados,
      row.evaluados,
      row.inicial,
      row.basico,
      row.avanzado,
      row.excelente,
      row.repitentesEvaluados,
    ];
    vals.forEach((nv, idx) => {
      const c = 2 + idx * 3;
      s4.getCell(r4, c).value = nv.n;
      s4.getCell(r4, c + 1).value = nv.v;
      s4.getCell(r4, c + 2).value = totalNV(nv);
      styleCell(s4.getCell(r4, c), { bold, fill, align: 'right', numFmt: '#,##0' });
      styleCell(s4.getCell(r4, c + 1), { bold, fill, align: 'right', numFmt: '#,##0' });
      styleCell(s4.getCell(r4, c + 2), {
        bold: true,
        fill: fill || SUBHEADER_FILL_BLUE,
        align: 'right',
        numFmt: '#,##0',
      });
    });
    r4++;
  };
  const r4_12 = includeC12
    ? BASICA_CYCLE_1_2.map((g) => {
        writeS4Row(g.label, data.evaluacionFinal[g.key]);
        return data.evaluacionFinal[g.key];
      })
    : [];
  if (includeC12 && includeC3) {
    writeS4Row('Subtotal I y II Ciclo', sumEvaluacionFinalRows(r4_12), SUBTOTAL_FILL_GRAY, true);
  }
  const r4_3 = includeC3
    ? BASICA_CYCLE_3.map((g) => {
        writeS4Row(g.label, data.evaluacionFinal[g.key]);
        return data.evaluacionFinal[g.key];
      })
    : [];
  if (includeC12 && includeC3) {
    writeS4Row('Subtotal III Ciclo', sumEvaluacionFinalRows(r4_3), SUBTOTAL_FILL_GRAY, true);
  }
  writeS4Row('TOTAL', sumEvaluacionFinalRows([...r4_12, ...r4_3]), TOTAL_FILL_YELLOW, true);
  s4.getColumn(1).width = 18;
  for (let c = 2; c <= s4Cols; c++) s4.getColumn(c).width = 5.5;
  addSignatureFooter(s4, r4 + 2, s4Cols, meta);

  // Sheet 5: Evaluación por Áreas y Egresados 6°/9°
  const s5 = workbook.addWorksheet('5. Áreas y Egresados', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  addOfficialBanner(
    s5,
    10,
    `REPORTE SOBRE RESULTADOS DE EVALUACIÓN POR ÁREAS Y EGRESADOS · ${scopeSuffix} ${meta.year}`,
    meta
  );
  let r5 = 8;
  for (const area of BASICA_EVAL_AREAS) {
    s5.mergeCells(r5, 1, r5, 10);
    s5.getCell(r5, 1).value = area.label;
    styleCell(s5.getCell(r5, 1), { bold: true, fill: HEADER_FILL_GREEN });
    r5++;
    s5.mergeCells(r5, 1, r5 + 1, 1);
    s5.getCell(r5, 1).value = 'GRADO';
    styleCell(s5.getCell(r5, 1), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s5.getCell(r5 + 1, 1), { bold: true, fill: HEADER_FILL_GREEN });
    ['EVALUADOS', 'APROBADOS', 'REPROBADOS'].forEach((grp, idx) => {
      const c = 2 + idx * 3;
      s5.mergeCells(r5, c, r5, c + 2);
      s5.getCell(r5, c).value = grp;
      styleCell(s5.getCell(r5, c), { bold: true, fill: HEADER_FILL_GREEN });
      styleCell(s5.getCell(r5, c + 1), { bold: true, fill: HEADER_FILL_GREEN });
      styleCell(s5.getCell(r5, c + 2), { bold: true, fill: HEADER_FILL_GREEN });
      ['F', 'M', 'T'].forEach((sub, sIdx) => {
        s5.getCell(r5 + 1, c + sIdx).value = sub;
        styleCell(s5.getCell(r5 + 1, c + sIdx), { bold: true, fill: SUBHEADER_FILL_BLUE });
      });
    });
    r5 += 2;
    let sumEv = emptyFM();
    let sumAp = emptyFM();
    let sumRep = emptyFM();
    for (const g of activeGrades) {
      const cell = data.evaluacionPorAreas?.[area.key]?.[g.key] || {
        evaluados: emptyFM(),
        aprobados: emptyFM(),
        reprobados: emptyFM(),
      };
      sumEv = addFM(sumEv, cell.evaluados);
      sumAp = addFM(sumAp, cell.aprobados);
      sumRep = addFM(sumRep, cell.reprobados);
      s5.getCell(r5, 1).value = g.shortLabel;
      styleCell(s5.getCell(r5, 1), { align: 'center' });
      [cell.evaluados, cell.aprobados, cell.reprobados].forEach((fm, idx) => {
        const c = 2 + idx * 3;
        s5.getCell(r5, c).value = fm.f;
        s5.getCell(r5, c + 1).value = fm.m;
        s5.getCell(r5, c + 2).value = totalFM(fm);
        styleCell(s5.getCell(r5, c), { align: 'right', numFmt: '#,##0' });
        styleCell(s5.getCell(r5, c + 1), { align: 'right', numFmt: '#,##0' });
        styleCell(s5.getCell(r5, c + 2), { bold: true, fill: SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });
      });
      r5++;
    }
    s5.getCell(r5, 1).value = 'Total';
    styleCell(s5.getCell(r5, 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'center' });
    [sumEv, sumAp, sumRep].forEach((fm, idx) => {
      const c = 2 + idx * 3;
      s5.getCell(r5, c).value = fm.f;
      s5.getCell(r5, c + 1).value = fm.m;
      s5.getCell(r5, c + 2).value = totalFM(fm);
      styleCell(s5.getCell(r5, c), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
      styleCell(s5.getCell(r5, c + 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
      styleCell(s5.getCell(r5, c + 2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    });
    r5 += 2;
  }

  // Egresados 6° y/o 9° por Edad y Sexo
  const egresadosHeading =
    scope === 'c1_2'
      ? 'EGRESADAS(OS) DE 6° GRADO POR EDAD Y SEXO'
      : scope === 'c3'
      ? 'EGRESADAS(OS) DE 9° GRADO POR EDAD Y SEXO'
      : 'EGRESADAS(OS) DE 6° O 9° GRADO POR EDAD Y SEXO';
  s5.mergeCells(r5, 1, r5, 4);
  s5.getCell(r5, 1).value = egresadosHeading;
  styleCell(s5.getCell(r5, 1), { bold: true, fill: HEADER_FILL_GREEN });
  r5++;
  ['EDAD', 'F', 'M', 'TOTAL'].forEach((h, i) => {
    s5.getCell(r5, i + 1).value = h;
    styleCell(s5.getCell(r5, i + 1), { bold: true, fill: SUBHEADER_FILL_BLUE });
  });
  r5++;
  let egSum = emptyFM();
  for (const age of BASICA_EGRESADOS_AGES) {
    const fm = data.egresadosPorEdad[age.key] || emptyFM();
    egSum = addFM(egSum, fm);
    s5.getCell(r5, 1).value = age.label;
    s5.getCell(r5, 2).value = fm.f;
    s5.getCell(r5, 3).value = fm.m;
    s5.getCell(r5, 4).value = totalFM(fm);
    styleCell(s5.getCell(r5, 1), { align: 'left' });
    styleCell(s5.getCell(r5, 2), { align: 'right', numFmt: '#,##0' });
    styleCell(s5.getCell(r5, 3), { align: 'right', numFmt: '#,##0' });
    styleCell(s5.getCell(r5, 4), { bold: true, fill: SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });
    r5++;
  }
  s5.getCell(r5, 1).value = 'Total';
  s5.getCell(r5, 2).value = egSum.f;
  s5.getCell(r5, 3).value = egSum.m;
  s5.getCell(r5, 4).value = totalFM(egSum);
  styleCell(s5.getCell(r5, 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'left' });
  styleCell(s5.getCell(r5, 2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  styleCell(s5.getCell(r5, 3), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  styleCell(s5.getCell(r5, 4), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  s5.getColumn(1).width = 28;
  for (let c = 2; c <= 10; c++) s5.getColumn(c).width = 9;
  addSignatureFooter(s5, r5 + 2, 10, meta);

  // Sheet 6: Cuadro Resumen por Asignatura (por Denominación de Notas)
  const s6 = workbook.addWorksheet('6. Resumen Asignatura', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const s6Cols = 1 + BASICA_RESUMEN_SUBJECTS.length * 5;
  addOfficialBanner(
    s6,
    s6Cols,
    `CUADRO RESUMEN POR ASIGNATURA (POR DENOMINACIÓN DE NOTAS) · ${scopeSuffix} ${meta.year}`,
    meta
  );
  s6.mergeCells(7, 1, 7, s6Cols);
  s6.getCell(7, 1).value = `Sector: ${
    meta.sector === 'no_gubernamental' ? 'NO GUBERNAMENTAL' : 'GUBERNAMENTAL'
  }`;
  s6.getCell(7, 1).font = { name: 'Calibri', size: 10, bold: true };

  s6.mergeCells(8, 1, 9, 1);
  s6.getCell(8, 1).value = 'GRADOS';
  styleCell(s6.getCell(8, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(s6.getCell(9, 1), { bold: true, fill: HEADER_FILL_GREEN });

  BASICA_RESUMEN_SUBJECTS.forEach((subj, idx) => {
    const c = 2 + idx * 5;
    s6.mergeCells(8, c, 8, c + 4);
    s6.getCell(8, c).value = subj.label;
    for (let k = 0; k < 5; k++) {
      styleCell(s6.getCell(8, c + k), { bold: true, fill: HEADER_FILL_GREEN });
    }
    ['I', 'B', 'A', 'E', 'T'].forEach((sub, sIdx) => {
      s6.getCell(9, c + sIdx).value = sub;
      styleCell(s6.getCell(9, c + sIdx), { bold: true, fill: SUBHEADER_FILL_BLUE });
    });
  });

  let r6 = 10;
  const writeS6Group = (
    grades: typeof BASICA_CYCLE_1_2,
    subLabel?: string
  ) => {
    const sums = BASICA_RESUMEN_SUBJECTS.map(() => emptyIBAE());
    for (const g of grades) {
      s6.getCell(r6, 1).value = g.label.toUpperCase();
      styleCell(s6.getCell(r6, 1), { align: 'left', bold: true });
      BASICA_RESUMEN_SUBJECTS.forEach((subj, idx) => {
        const val = data.resumenDenominacion?.[g.key]?.[subj.key] || emptyIBAE();
        sums[idx] = addIBAE(sums[idx], val);
        const c = 2 + idx * 5;
        s6.getCell(r6, c).value = val.i;
        s6.getCell(r6, c + 1).value = val.b;
        s6.getCell(r6, c + 2).value = val.a;
        s6.getCell(r6, c + 3).value = val.e;
        s6.getCell(r6, c + 4).value = totalIBAE(val);
        for (let k = 0; k < 4; k++) {
          styleCell(s6.getCell(r6, c + k), { align: 'right', numFmt: '#,##0' });
        }
        styleCell(s6.getCell(r6, c + 4), { bold: true, fill: SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });
      });
      r6++;
    }
    if (subLabel) {
      s6.getCell(r6, 1).value = subLabel;
      styleCell(s6.getCell(r6, 1), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'left' });
      sums.forEach((val, idx) => {
        const c = 2 + idx * 5;
        s6.getCell(r6, c).value = val.i;
        s6.getCell(r6, c + 1).value = val.b;
        s6.getCell(r6, c + 2).value = val.a;
        s6.getCell(r6, c + 3).value = val.e;
        s6.getCell(r6, c + 4).value = totalIBAE(val);
        for (let k = 0; k < 5; k++) {
          styleCell(s6.getCell(r6, c + k), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
        }
      });
      r6++;
    }
    return sums;
  };

  const s6_12 = includeC12
    ? writeS6Group(BASICA_CYCLE_1_2, includeC3 ? 'SUB TOTAL' : undefined)
    : BASICA_RESUMEN_SUBJECTS.map(() => emptyIBAE());
  const s6_3 = includeC3
    ? writeS6Group(BASICA_CYCLE_3, includeC12 ? 'SUB TOTAL' : undefined)
    : BASICA_RESUMEN_SUBJECTS.map(() => emptyIBAE());

  s6.getCell(r6, 1).value = 'TOTAL';
  styleCell(s6.getCell(r6, 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'left' });
  BASICA_RESUMEN_SUBJECTS.forEach((_, idx) => {
    const val = addIBAE(s6_12[idx], s6_3[idx]);
    const c = 2 + idx * 5;
    s6.getCell(r6, c).value = val.i;
    s6.getCell(r6, c + 1).value = val.b;
    s6.getCell(r6, c + 2).value = val.a;
    s6.getCell(r6, c + 3).value = val.e;
    s6.getCell(r6, c + 4).value = totalIBAE(val);
    for (let k = 0; k < 5; k++) {
      styleCell(s6.getCell(r6, c + k), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    }
  });
  s6.getColumn(1).width = 16;
  for (let c = 2; c <= s6Cols; c++) s6.getColumn(c).width = 4.8;
  addSignatureFooter(s6, r6 + 2, s6Cols, meta);

  downloadWorkbook(workbook, `Cuadros_Basica_${meta.saceCode || 'Distrito_18B'}_${meta.year}.xlsx`);
}

export async function exportMediaExcel(data: MediaAnnualData, meta: ExportMeta) {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Estadístico Final Media
  const s1 = workbook.addWorksheet('1. Estadístico Final Media', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  populateEstadisticoSheet(s1, `REPORTE ESTADÍSTICO FINAL-SACE MEDIA ${meta.year}`, meta, [
    {
      label: 'Nivel Medio',
      rows: MEDIA_GRADES.map((g) => ({
        label: g.label.toUpperCase(),
        data: data.estadisticoFinal[g.key],
      })),
    },
  ]);

  // Sheet 2: Matrícula por Edades Media
  const s2 = workbook.addWorksheet('2. Matrícula Edades Media', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const s2Cols = 1 + (MEDIA_AGES.length + 1) * 3;
  addOfficialBanner(s2, s2Cols, `FORMATO DE MATRÍCULA FINAL POR EDADES NIVEL MEDIO ${meta.year}`, meta);
  s2.mergeCells(8, 1, 9, 1);
  s2.getCell(8, 1).value = 'Grado';
  styleCell(s2.getCell(8, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(s2.getCell(9, 1), { bold: true, fill: HEADER_FILL_GREEN });
  [...MEDIA_AGES.map((a) => a.label), 'TOTAL'].forEach((lbl, idx) => {
    const c = 2 + idx * 3;
    s2.mergeCells(8, c, 8, c + 2);
    s2.getCell(8, c).value = lbl;
    styleCell(s2.getCell(8, c), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s2.getCell(8, c + 1), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s2.getCell(8, c + 2), { bold: true, fill: HEADER_FILL_GREEN });
    ['N', 'V', 'T'].forEach((sub, sIdx) => {
      s2.getCell(9, c + sIdx).value = sub;
      styleCell(s2.getCell(9, c + sIdx), { bold: true, fill: SUBHEADER_FILL_BLUE });
    });
  });

  let r2 = 10;
  const ageColTotals = MEDIA_AGES.map(() => emptyNV());
  for (const g of MEDIA_GRADES) {
    s2.getCell(r2, 1).value = g.label.toUpperCase();
    styleCell(s2.getCell(r2, 1), { align: 'left', bold: true });
    let rowSum = emptyNV();
    MEDIA_AGES.forEach((age, idx) => {
      const nv = data.matriculaEdades[g.key][age.key] || emptyNV();
      rowSum = addNV(rowSum, nv);
      ageColTotals[idx] = addNV(ageColTotals[idx], nv);
      const c = 2 + idx * 3;
      s2.getCell(r2, c).value = nv.n;
      s2.getCell(r2, c + 1).value = nv.v;
      s2.getCell(r2, c + 2).value = totalNV(nv);
      styleCell(s2.getCell(r2, c), { align: 'right', numFmt: '#,##0' });
      styleCell(s2.getCell(r2, c + 1), { align: 'right', numFmt: '#,##0' });
      styleCell(s2.getCell(r2, c + 2), { bold: true, fill: SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });
    });
    const tc = 2 + MEDIA_AGES.length * 3;
    s2.getCell(r2, tc).value = rowSum.n;
    s2.getCell(r2, tc + 1).value = rowSum.v;
    s2.getCell(r2, tc + 2).value = totalNV(rowSum);
    styleCell(s2.getCell(r2, tc), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, tc + 1), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, tc + 2), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
    r2++;
  }
  s2.getCell(r2, 1).value = 'Total';
  styleCell(s2.getCell(r2, 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'left' });
  let grandMediaAge = emptyNV();
  ageColTotals.forEach((nv, idx) => {
    grandMediaAge = addNV(grandMediaAge, nv);
    const c = 2 + idx * 3;
    s2.getCell(r2, c).value = nv.n;
    s2.getCell(r2, c + 1).value = nv.v;
    s2.getCell(r2, c + 2).value = totalNV(nv);
    styleCell(s2.getCell(r2, c), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, c + 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, c + 2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  });
  const tc2 = 2 + MEDIA_AGES.length * 3;
  s2.getCell(r2, tc2).value = grandMediaAge.n;
  s2.getCell(r2, tc2 + 1).value = grandMediaAge.v;
  s2.getCell(r2, tc2 + 2).value = totalNV(grandMediaAge);
  styleCell(s2.getCell(r2, tc2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  styleCell(s2.getCell(r2, tc2 + 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  styleCell(s2.getCell(r2, tc2 + 2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  s2.getColumn(1).width = 16;
  for (let c = 2; c <= s2Cols; c++) s2.getColumn(c).width = 5.5;
  addSignatureFooter(s2, r2 + 2, s2Cols, meta);

  // Sheet 3: Aprobados y No Aprobados por Asignatura (Décimo y Undécimo)
  const s3 = workbook.addWorksheet('3. Aprobados Asignatura', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  addOfficialBanner(
    s3,
    11,
    `REPORTE DE APROBADOS Y NO APROBADOS POR ASIGNATURA Y ÁREAS · AÑO ${meta.year}`,
    meta
  );
  s3.mergeCells(7, 1, 7, 11);
  s3.getCell(7, 1).value = `Modalidad: ${(meta.modality || 'presencial').toUpperCase()}`;
  s3.getCell(7, 1).font = { name: 'Calibri', size: 10, bold: true };

  // Décimo (cols 1..5) and Undécimo (cols 7..11)
  s3.mergeCells(9, 1, 9, 5);
  s3.getCell(9, 1).value = 'DÉCIMO GRADO';
  s3.getCell(9, 1).font = { name: 'Calibri', size: 10, bold: true };
  s3.getCell(9, 1).alignment = { horizontal: 'center' };

  s3.mergeCells(9, 7, 9, 11);
  s3.getCell(9, 7).value = 'UNDÉCIMO GRADO';
  s3.getCell(9, 7).font = { name: 'Calibri', size: 10, bold: true };
  s3.getCell(9, 7).alignment = { horizontal: 'center' };

  ['N°', 'MATERIA', 'A', 'NA', 'T'].forEach((h, i) => {
    s3.getCell(10, i + 1).value = h;
    styleCell(s3.getCell(10, i + 1), { bold: true, fill: HEADER_FILL_GREEN });
    s3.getCell(10, i + 7).value = h;
    styleCell(s3.getCell(10, i + 7), { bold: true, fill: HEADER_FILL_GREEN });
  });

  for (let idx = 0; idx < 11; idx++) {
    const r = 11 + idx;
    const dSubj = MEDIA_DECIMO_SUBJECTS[idx];
    const dVal = data.aprobadosAsignatura.decimo[dSubj.key];
    s3.getCell(r, 1).value = idx + 1;
    s3.getCell(r, 2).value = dSubj.label;
    s3.getCell(r, 3).value = dVal.a;
    s3.getCell(r, 4).value = dVal.na;
    s3.getCell(r, 5).value = totalANA(dVal);
    styleCell(s3.getCell(r, 1), { align: 'center' });
    styleCell(s3.getCell(r, 2), { align: 'left' });
    styleCell(s3.getCell(r, 3), { align: 'right', numFmt: '#,##0' });
    styleCell(s3.getCell(r, 4), { align: 'right', numFmt: '#,##0' });
    styleCell(s3.getCell(r, 5), { bold: true, fill: SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });

    const uSubj = MEDIA_UNDECIMO_SUBJECTS[idx];
    const uVal = data.aprobadosAsignatura.undecimo[uSubj.key];
    s3.getCell(r, 7).value = idx + 1;
    s3.getCell(r, 8).value = uSubj.label;
    s3.getCell(r, 9).value = uVal.a;
    s3.getCell(r, 10).value = uVal.na;
    s3.getCell(r, 11).value = totalANA(uVal);
    styleCell(s3.getCell(r, 7), { align: 'center' });
    styleCell(s3.getCell(r, 8), { align: 'left' });
    styleCell(s3.getCell(r, 9), { align: 'right', numFmt: '#,##0' });
    styleCell(s3.getCell(r, 10), { align: 'right', numFmt: '#,##0' });
    styleCell(s3.getCell(r, 11), { bold: true, fill: SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });
  }
  [5, 28, 7, 7, 7, 3, 5, 30, 7, 7, 7].forEach((w, i) => (s3.getColumn(i + 1).width = w));
  addSignatureFooter(s3, 24, 11, meta);

  // Sheet 4: Evaluación Final Media
  const s4 = workbook.addWorksheet('4. Evaluación Final Media', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const evalCats = [
    'Matrícula inicial',
    'Matrícula Final',
    'Ingresos',
    'Desertores',
    'Traslados',
    'Evaluados',
    'Inicial',
    'Básico',
    'Avanzado',
    'Excelente',
    'Repitentes evaluados',
  ];
  const s4Cols = 1 + evalCats.length * 3;
  addOfficialBanner(s4, s4Cols, `RESULTADOS DE EVALUACIÓN FINAL MEDIA ${meta.year}`, meta);
  s4.mergeCells(8, 1, 9, 1);
  s4.getCell(8, 1).value = 'Grado';
  styleCell(s4.getCell(8, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(s4.getCell(9, 1), { bold: true, fill: HEADER_FILL_GREEN });
  evalCats.forEach((cat, idx) => {
    const c = 2 + idx * 3;
    s4.mergeCells(8, c, 8, c + 2);
    s4.getCell(8, c).value = cat;
    styleCell(s4.getCell(8, c), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s4.getCell(8, c + 1), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s4.getCell(8, c + 2), { bold: true, fill: HEADER_FILL_GREEN });
    ['N', 'V', 'T'].forEach((sub, sIdx) => {
      s4.getCell(9, c + sIdx).value = sub;
      styleCell(s4.getCell(9, c + sIdx), { bold: true, fill: SUBHEADER_FILL_BLUE });
    });
  });

  let r4 = 10;
  const writeMediaEvalRow = (label: string, row: EvaluacionFinalRow, fill?: ExcelJS.Fill, bold = false) => {
    s4.getCell(r4, 1).value = label;
    styleCell(s4.getCell(r4, 1), { bold, fill, align: 'left' });
    const vals = [
      row.matInicial,
      row.matFinal,
      row.ingresos,
      row.desertores,
      row.traslados,
      row.evaluados,
      row.inicial,
      row.basico,
      row.avanzado,
      row.excelente,
      row.repitentesEvaluados,
    ];
    vals.forEach((nv, idx) => {
      const c = 2 + idx * 3;
      s4.getCell(r4, c).value = nv.n;
      s4.getCell(r4, c + 1).value = nv.v;
      s4.getCell(r4, c + 2).value = totalNV(nv);
      styleCell(s4.getCell(r4, c), { bold, fill, align: 'right', numFmt: '#,##0' });
      styleCell(s4.getCell(r4, c + 1), { bold, fill, align: 'right', numFmt: '#,##0' });
      styleCell(s4.getCell(r4, c + 2), { bold: true, fill: fill || SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });
    });
    r4++;
  };
  const mEvalRows = MEDIA_GRADES.map((g) => {
    writeMediaEvalRow(g.label, data.evaluacionFinal[g.key]);
    return data.evaluacionFinal[g.key];
  });
  writeMediaEvalRow('Sub-total', sumEvaluacionFinalRows(mEvalRows), TOTAL_FILL_YELLOW, true);
  s4.getColumn(1).width = 16;
  for (let c = 2; c <= s4Cols; c++) s4.getColumn(c).width = 5.5;
  addSignatureFooter(s4, r4 + 2, s4Cols, meta);

  // Sheet 5: Cuadro Resumen por Denominación de Notas
  const s5 = workbook.addWorksheet('5. Resumen Denominación', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const s5Cols = 1 + MEDIA_RESUMEN_SUBJECTS.length * 5;
  addOfficialBanner(
    s5,
    s5Cols,
    `CUADRO RESUMEN POR ASIGNATURA (POR DENOMINACIÓN DE NOTAS) · AÑO ${meta.year}`,
    meta
  );
  s5.mergeCells(7, 1, 7, s5Cols);
  s5.getCell(7, 1).value = `Sector: ${
    meta.sector === 'no_gubernamental' ? 'NO GUBERNAMENTAL' : 'GUBERNAMENTAL'
  }`;
  s5.getCell(7, 1).font = { name: 'Calibri', size: 10, bold: true };

  s5.mergeCells(8, 1, 9, 1);
  s5.getCell(8, 1).value = 'GRADOS';
  styleCell(s5.getCell(8, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(s5.getCell(9, 1), { bold: true, fill: HEADER_FILL_GREEN });

  MEDIA_RESUMEN_SUBJECTS.forEach((subj, idx) => {
    const c = 2 + idx * 5;
    s5.mergeCells(8, c, 8, c + 4);
    s5.getCell(8, c).value = subj.label;
    for (let k = 0; k < 5; k++) {
      styleCell(s5.getCell(8, c + k), { bold: true, fill: HEADER_FILL_GREEN });
    }
    ['I', 'B', 'A', 'E', 'T'].forEach((sub, sIdx) => {
      s5.getCell(9, c + sIdx).value = sub;
      styleCell(s5.getCell(9, c + sIdx), { bold: true, fill: SUBHEADER_FILL_BLUE });
    });
  });

  let r5 = 10;
  const subjTotals = MEDIA_RESUMEN_SUBJECTS.map(() => emptyIBAE());
  for (const g of MEDIA_GRADES) {
    s5.getCell(r5, 1).value = g.label.toUpperCase();
    styleCell(s5.getCell(r5, 1), { align: 'left', bold: true });
    MEDIA_RESUMEN_SUBJECTS.forEach((subj, idx) => {
      const val = data.resumenDenominacion[g.key][subj.key] || emptyIBAE();
      subjTotals[idx] = addIBAE(subjTotals[idx], val);
      const c = 2 + idx * 5;
      s5.getCell(r5, c).value = val.i;
      s5.getCell(r5, c + 1).value = val.b;
      s5.getCell(r5, c + 2).value = val.a;
      s5.getCell(r5, c + 3).value = val.e;
      s5.getCell(r5, c + 4).value = totalIBAE(val);
      for (let k = 0; k < 4; k++) {
        styleCell(s5.getCell(r5, c + k), { align: 'right', numFmt: '#,##0' });
      }
      styleCell(s5.getCell(r5, c + 4), { bold: true, fill: SUBHEADER_FILL_BLUE, align: 'right', numFmt: '#,##0' });
    });
    r5++;
  }
  s5.getCell(r5, 1).value = 'TOTAL';
  styleCell(s5.getCell(r5, 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'left' });
  subjTotals.forEach((val, idx) => {
    const c = 2 + idx * 5;
    s5.getCell(r5, c).value = val.i;
    s5.getCell(r5, c + 1).value = val.b;
    s5.getCell(r5, c + 2).value = val.a;
    s5.getCell(r5, c + 3).value = val.e;
    s5.getCell(r5, c + 4).value = totalIBAE(val);
    for (let k = 0; k < 5; k++) {
      styleCell(s5.getCell(r5, c + k), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    }
  });
  s5.getColumn(1).width = 16;
  for (let c = 2; c <= s5Cols; c++) s5.getColumn(c).width = 5;
  addSignatureFooter(s5, r5 + 2, s5Cols, meta);

  downloadWorkbook(workbook, `Cuadros_Media_${meta.saceCode || 'Distrito_18B'}_${meta.year}.xlsx`);
}

export async function exportPrebasicaExcel(rawData: PrebasicaAnnualData, meta: ExportMeta) {
  const data = normalizePrebasicaData(rawData);
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Reporte Estadístico Final
  const s1 = workbook.addWorksheet('1. Estadístico Final', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  populateEstadisticoSheet(s1, `REPORTE ESTADÍSTICO FINAL-SACE PREBÁSICA ${meta.year}`, meta, [
    {
      label: 'Prebásica',
      rows: PREBASICA_GRADES.map((g) => ({
        label: g.shortLabel,
        data: data.estadisticoFinal[g.key],
      })),
    },
  ]);

  // Sheet 2: Matrícula Final por Edades
  const s2 = workbook.addWorksheet('2. Matrícula Edades', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const s2Cols = 1 + (PREBASICA_AGES.length + 1) * 3;
  addOfficialBanner(s2, s2Cols, `MATRÍCULA FINAL POR EDADES PREBÁSICA ${meta.year}`, meta);

  s2.mergeCells(8, 1, 9, 1);
  s2.getCell(8, 1).value = 'Grado';
  styleCell(s2.getCell(8, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(s2.getCell(9, 1), { bold: true, fill: HEADER_FILL_GREEN });

  [...PREBASICA_AGES.map((a) => a.label), 'TOTAL'].forEach((lbl, idx) => {
    const c = 2 + idx * 3;
    s2.mergeCells(8, c, 8, c + 2);
    s2.getCell(8, c).value = lbl;
    styleCell(s2.getCell(8, c), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s2.getCell(8, c + 1), { bold: true, fill: HEADER_FILL_GREEN });
    styleCell(s2.getCell(8, c + 2), { bold: true, fill: HEADER_FILL_GREEN });
    ['N', 'V', 'T'].forEach((sub, sIdx) => {
      s2.getCell(9, c + sIdx).value = sub;
      styleCell(s2.getCell(9, c + sIdx), { bold: true, fill: SUBHEADER_FILL_BLUE });
    });
  });

  let r2 = 10;
  const colAgeTotals = PREBASICA_AGES.map(() => emptyNV());
  for (const g of PREBASICA_GRADES) {
    s2.getCell(r2, 1).value = g.edadesLabel;
    styleCell(s2.getCell(r2, 1), { align: 'left', bold: true });
    let rowSum = emptyNV();
    PREBASICA_AGES.forEach((age, idx) => {
      const nv = data.matriculaEdades[g.key][age.key] || emptyNV();
      rowSum = addNV(rowSum, nv);
      colAgeTotals[idx] = addNV(colAgeTotals[idx], nv);
      const c = 2 + idx * 3;
      s2.getCell(r2, c).value = nv.n;
      s2.getCell(r2, c + 1).value = nv.v;
      s2.getCell(r2, c + 2).value = totalNV(nv);
      styleCell(s2.getCell(r2, c), { align: 'right', numFmt: '#,##0' });
      styleCell(s2.getCell(r2, c + 1), { align: 'right', numFmt: '#,##0' });
      styleCell(s2.getCell(r2, c + 2), {
        bold: true,
        fill: SUBHEADER_FILL_BLUE,
        align: 'right',
        numFmt: '#,##0',
      });
    });
    const tc = 2 + PREBASICA_AGES.length * 3;
    s2.getCell(r2, tc).value = rowSum.n;
    s2.getCell(r2, tc + 1).value = rowSum.v;
    s2.getCell(r2, tc + 2).value = totalNV(rowSum);
    styleCell(s2.getCell(r2, tc), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, tc + 1), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, tc + 2), { bold: true, fill: SUBTOTAL_FILL_GRAY, align: 'right', numFmt: '#,##0' });
    r2++;
  }

  s2.getCell(r2, 1).value = 'TOTAL';
  styleCell(s2.getCell(r2, 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'left' });
  let grandAge = emptyNV();
  colAgeTotals.forEach((nv, idx) => {
    grandAge = addNV(grandAge, nv);
    const c = 2 + idx * 3;
    s2.getCell(r2, c).value = nv.n;
    s2.getCell(r2, c + 1).value = nv.v;
    s2.getCell(r2, c + 2).value = totalNV(nv);
    styleCell(s2.getCell(r2, c), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, c + 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
    styleCell(s2.getCell(r2, c + 2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  });
  const tc2 = 2 + PREBASICA_AGES.length * 3;
  s2.getCell(r2, tc2).value = grandAge.n;
  s2.getCell(r2, tc2 + 1).value = grandAge.v;
  s2.getCell(r2, tc2 + 2).value = totalNV(grandAge);
  styleCell(s2.getCell(r2, tc2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  styleCell(s2.getCell(r2, tc2 + 1), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });
  styleCell(s2.getCell(r2, tc2 + 2), { bold: true, fill: TOTAL_FILL_YELLOW, align: 'right', numFmt: '#,##0' });

  s2.getColumn(1).width = 18;
  for (let c = 2; c <= s2Cols; c++) s2.getColumn(c).width = 6.5;
  addSignatureFooter(s2, r2 + 2, s2Cols, meta);

  downloadWorkbook(
    workbook,
    `Cuadros_Prebasica_${meta.saceCode || 'Distrito_18B'}_${meta.year}.xlsx`
  );
}

export async function exportParteMensualExcel(
  byGrade: Record<string, ParteMensualComputedRow>,
  totalRow: ParteMensualComputedRow,
  meta: ExportMeta & { month: number; level: EducationLevel; diasTrabajados: number }
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Parte Mensual', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  const monthLabel = MONTHS.find((m) => m.value === meta.month)?.label || String(meta.month);
  const finalLabel = meta.level === 'prebasica' ? 'MATRÍCULA ACTUAL' : 'MATRÍCULA FINAL';
  const scope = meta.level === 'basica' ? meta.basicaScope || 'c1_2_3' : undefined;
  const grades = getParteMensualGrades(meta.level, scope);
  const levelTitle =
    meta.level === 'basica' && scope && scope !== 'c1_2_3'
      ? `BÁSICA (${BASICA_SCOPE_SHORT_LABELS[scope].toUpperCase()})`
      : LEVEL_LABELS[meta.level].toUpperCase();
  const totalCols = 1 + 8 * 3; // 25 columns: GRADO + 8 blocks * (N, V, T)

  addOfficialBanner(
    sheet,
    totalCols,
    `REPORTE DE PARTE MENSUAL ${meta.year} · ${levelTitle}`,
    meta
  );

  // Extra row for Mes and Días Trabajados
  sheet.mergeCells(7, 1, 7, 12);
  sheet.getCell(7, 1).value = `Mes: ${monthLabel.toUpperCase()} ${meta.year}`;
  sheet.getCell(7, 1).font = { name: 'Calibri', size: 9.5, bold: true };

  sheet.mergeCells(7, 13, 7, totalCols);
  sheet.getCell(7, 13).value = meta.isConsolidated
    ? `Promedio Días Trabajados: ${meta.diasTrabajados}`
    : `Días Trabajados: ${meta.diasTrabajados}`;
  sheet.getCell(7, 13).font = { name: 'Calibri', size: 9.5, bold: true };

  const blocks: { title: string; fill: string }[] = [
    { title: 'MATRÍCULA INICIAL', fill: 'FFFFF2CC' },
    { title: finalLabel, fill: 'FFE2E8F0' },
    { title: 'INASISTENCIAS', fill: 'FFFCE4EC' },
    { title: 'ASISTENCIA MEDIA', fill: 'FFE8F5E9' },
    { title: 'TANTO POR CIENTO', fill: 'FFFDEBD0' },
    { title: 'INGRESOS', fill: 'FFFFF2CC' },
    { title: 'TRASLADOS', fill: 'FFE3F2FD' },
    { title: 'DESERTORES', fill: 'FFFBE9E7' },
  ];

  const h1 = 9;
  const h2 = 10;
  sheet.mergeCells(h1, 1, h2, 1);
  sheet.getCell(h1, 1).value = 'GRADO';
  styleCell(sheet.getCell(h1, 1), { bold: true, fill: HEADER_FILL_GREEN });
  styleCell(sheet.getCell(h2, 1), { bold: true, fill: HEADER_FILL_GREEN });

  blocks.forEach((blk, idx) => {
    const startCol = 2 + idx * 3;
    const blkFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blk.fill } };
    sheet.mergeCells(h1, startCol, h1, startCol + 2);
    sheet.getCell(h1, startCol).value = blk.title;
    for (let k = 0; k < 3; k++) {
      styleCell(sheet.getCell(h1, startCol + k), { bold: true, fill: blkFill, size: 8.5 });
      sheet.getCell(h2, startCol + k).value = ['N', 'V', 'T'][k];
      styleCell(sheet.getCell(h2, startCol + k), { bold: true, fill: blkFill, size: 8.5 });
    }
  });

  const writeComputedRow = (
    rowIdx: number,
    label: string,
    cRow: ParteMensualComputedRow,
    variant: 'normal' | 'subtotal' | 'total' = 'normal'
  ) => {
    const isBoldRow = variant !== 'normal';
    const rowFill: ExcelJS.Fill | undefined =
      variant === 'total'
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5E0B4' } }
        : variant === 'subtotal'
        ? SUBTOTAL_FILL_GRAY
        : undefined;

    sheet.getCell(rowIdx, 1).value = label.toUpperCase();
    styleCell(sheet.getCell(rowIdx, 1), { bold: true, fill: rowFill, align: 'left' });

    const blockFill = (argb: string): ExcelJS.Fill =>
      rowFill || { type: 'pattern', pattern: 'solid', fgColor: { argb } };

    const putIntTriple = (colStart: number, n: number, v: number, t: number, bg: string) => {
      sheet.getCell(rowIdx, colStart).value = n;
      sheet.getCell(rowIdx, colStart + 1).value = v;
      sheet.getCell(rowIdx, colStart + 2).value = t;
      styleCell(sheet.getCell(rowIdx, colStart), { bold: isBoldRow, fill: blockFill(bg), align: 'right', numFmt: '#,##0' });
      styleCell(sheet.getCell(rowIdx, colStart + 1), { bold: isBoldRow, fill: blockFill(bg), align: 'right', numFmt: '#,##0' });
      styleCell(sheet.getCell(rowIdx, colStart + 2), { bold: true, fill: blockFill(bg), align: 'right', numFmt: '#,##0' });
    };

    const putFloatTriple = (colStart: number, n: number, v: number, t: number, bg: string) => {
      sheet.getCell(rowIdx, colStart).value = Number(n.toFixed(2));
      sheet.getCell(rowIdx, colStart + 1).value = Number(v.toFixed(2));
      sheet.getCell(rowIdx, colStart + 2).value = Number(t.toFixed(2));
      styleCell(sheet.getCell(rowIdx, colStart), { bold: isBoldRow, fill: blockFill(bg), align: 'right', numFmt: '0.00' });
      styleCell(sheet.getCell(rowIdx, colStart + 1), { bold: isBoldRow, fill: blockFill(bg), align: 'right', numFmt: '0.00' });
      styleCell(sheet.getCell(rowIdx, colStart + 2), { bold: true, fill: blockFill(bg), align: 'right', numFmt: '0.00' });
    };

    putIntTriple(2, cRow.matInicial.n, cRow.matInicial.v, totalNV(cRow.matInicial), 'FFFFF9E6');
    putIntTriple(5, cRow.matFinal.n, cRow.matFinal.v, totalNV(cRow.matFinal), 'FFF1F5F9');
    putIntTriple(8, cRow.inasistencias.n, cRow.inasistencias.v, totalNV(cRow.inasistencias), 'FFFDF2F8');
    putFloatTriple(11, cRow.asistenciaMedia.n, cRow.asistenciaMedia.v, cRow.asistenciaMedia.t, 'FFF0FDF4');
    putFloatTriple(14, cRow.tantoPorCiento.n, cRow.tantoPorCiento.v, cRow.tantoPorCiento.t, 'FFFFF7ED');
    putIntTriple(17, cRow.ingresos.n, cRow.ingresos.v, totalNV(cRow.ingresos), 'FFFFF9E6');
    putIntTriple(20, cRow.traslados.n, cRow.traslados.v, totalNV(cRow.traslados), 'FFEFF6FF');
    putIntTriple(23, cRow.desertores.n, cRow.desertores.v, totalNV(cRow.desertores), 'FFFFF1F2');
  };

  let cur = 11;
  if (meta.level === 'basica' && scope === 'c1_2_3') {
    const c12Rows: ParteMensualComputedRow[] = [];
    for (const g of BASICA_CYCLE_1_2) {
      const computed = byGrade[g.key];
      if (computed) {
        writeComputedRow(cur, g.label, computed, 'normal');
        c12Rows.push(computed);
        cur++;
      }
    }
    writeComputedRow(cur, 'Subtotal I y II Ciclo', sumParteMensualComputedRows(c12Rows), 'subtotal');
    cur++;

    const c3Rows: ParteMensualComputedRow[] = [];
    for (const g of BASICA_CYCLE_3) {
      const computed = byGrade[g.key];
      if (computed) {
        writeComputedRow(cur, g.label, computed, 'normal');
        c3Rows.push(computed);
        cur++;
      }
    }
    writeComputedRow(cur, 'Subtotal III Ciclo', sumParteMensualComputedRows(c3Rows), 'subtotal');
    cur++;
  } else {
    for (const g of grades) {
      const computed = byGrade[g.key];
      if (computed) {
        writeComputedRow(cur, g.label, computed, 'normal');
        cur++;
      }
    }
  }
  writeComputedRow(cur, 'TOTAL', totalRow, 'total');

  sheet.getColumn(1).width = 20;
  for (let c = 2; c <= totalCols; c++) sheet.getColumn(c).width = 7;

  addSignatureFooter(sheet, cur + 2, totalCols, meta);

  downloadWorkbook(
    workbook,
    `Parte_Mensual_${LEVEL_LABELS[meta.level]}_${monthLabel}_${meta.saceCode || 'Distrito_18B'}_${meta.year}.xlsx`
  );
}


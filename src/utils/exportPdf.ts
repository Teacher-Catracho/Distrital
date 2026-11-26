import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  ReportStatus,
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
import type { ExportMeta } from './exportExcel';

function drawHeader(doc: jsPDF, title: string, meta: ExportMeta): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('GOBIERNO DE LA REPÚBLICA DE HONDURAS · SECRETARÍA DE EDUCACIÓN', pageWidth / 2, 12, {
    align: 'center',
  });
  doc.setFontSize(9);
  doc.text(
    'DIRECCIÓN DEPARTAMENTAL DE EDUCACIÓN DE CORTÉS · DISTRITO EDUCATIVO N° 18-B, OMOA',
    pageWidth / 2,
    17,
    { align: 'center' }
  );
  doc.setFontSize(10.5);
  doc.text(title, pageWidth / 2, 23, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Centro Educativo: ${meta.schoolName}`, 12, 30);
  doc.text(`Código SACE: ${meta.saceCode || 'CONSOLIDADO DISTRITAL'}`, pageWidth - 12, 30, {
    align: 'right',
  });
  doc.text(`Lugar / Comunidad: ${meta.community || 'Omoa, Cortés'}`, 12, 35);
  doc.text(`Año Lectivo: ${meta.year}`, pageWidth - 12, 35, { align: 'right' });

  return 39;
}

function drawSignatures(doc: jsPDF, y: number, meta: ExportMeta) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const safeY = Math.min(y + 12, pageHeight - 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Lugar y fecha: ${meta.placeAndDate || `Omoa, Cortés, ${meta.year}`}`,
    12,
    safeY
  );
  doc.text('Firma y sello: ___________________________________', pageWidth - 12, safeY, {
    align: 'right',
  });
  if (meta.directorName || meta.directorDni) {
    doc.text(
      `Director(a): ${meta.directorName || ''}   Identidad: ${meta.directorDni || ''}`,
      12,
      safeY + 5
    );
  }
}

function buildEstadisticoPdfTable(
  doc: jsPDF,
  startY: number,
  groups: { rows: { label: string; data: EstadisticoRow }[]; subtotalLabel?: string }[]
) {
  const cats = [
    'Mat. Inicial',
    'Mat. Final',
    'Ingresos',
    'Desertores',
    'Traslados',
    'Aprobados',
    'Reprobados',
    'Egresados',
  ];
  const headRow1: any[] = [{ content: 'GRADOS', rowSpan: 2, styles: { valign: 'middle' } }];
  const headRow2: any[] = [];
  cats.forEach((c) => {
    headRow1.push({ content: c, colSpan: 3, styles: { halign: 'center' } });
    headRow2.push('N', 'V', 'T');
  });

  const body: any[] = [];
  const allRows: EstadisticoRow[] = [];

  const pushRow = (label: string, row: EstadisticoRow, isBold = false, fillColor?: number[]) => {
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
    const cells: any[] = [{ content: label, styles: { halign: 'left', fontStyle: isBold ? 'bold' : 'normal' } }];
    vals.forEach((nv) => {
      cells.push(nv.n, nv.v, { content: totalNV(nv), styles: { fontStyle: 'bold' } });
    });
    body.push(
      cells.map((c) =>
        typeof c === 'object'
          ? { ...c, styles: { ...c.styles, ...(fillColor ? { fillColor } : {}) } }
          : { content: c, styles: { ...(isBold ? { fontStyle: 'bold' } : {}), ...(fillColor ? { fillColor } : {}) } }
      )
    );
  };

  for (const grp of groups) {
    const grpRows: EstadisticoRow[] = [];
    for (const r of grp.rows) {
      pushRow(r.label, r.data);
      grpRows.push(r.data);
      allRows.push(r.data);
    }
    if (grp.subtotalLabel) {
      pushRow(grp.subtotalLabel, sumEstadisticoRows(grpRows), true, [226, 239, 218]);
    }
  }
  pushRow('TOTAL', sumEstadisticoRows(allRows), true, [255, 242, 204]);

  autoTable(doc, {
    startY,
    head: [headRow1, headRow2],
    body,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [217, 234, 211], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 10, right: 10 },
  });
}

function buildEvalFinalPdfTable(
  doc: jsPDF,
  startY: number,
  groups: { rows: { label: string; data: EvaluacionFinalRow }[]; subtotalLabel?: string }[],
  totalLabel = 'TOTAL'
) {
  const cats = [
    'Mat. Inicial',
    'Mat. Final',
    'Ingresos',
    'Desertores',
    'Traslados',
    'Evaluados',
    'Inicial',
    'Básico',
    'Avanzado',
    'Excelente',
    'Repitentes',
  ];
  const headRow1: any[] = [{ content: 'GRADO', rowSpan: 2, styles: { valign: 'middle' } }];
  const headRow2: any[] = [];
  cats.forEach((c) => {
    headRow1.push({ content: c, colSpan: 3, styles: { halign: 'center' } });
    headRow2.push('N', 'V', 'T');
  });

  const body: any[] = [];
  const allRows: EvaluacionFinalRow[] = [];

  const pushRow = (label: string, row: EvaluacionFinalRow, isBold = false, fillColor?: number[]) => {
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
    const cells: any[] = [{ content: label, styles: { halign: 'left', fontStyle: isBold ? 'bold' : 'normal' } }];
    vals.forEach((nv) => {
      cells.push(nv.n, nv.v, { content: totalNV(nv), styles: { fontStyle: 'bold' } });
    });
    body.push(
      cells.map((c) =>
        typeof c === 'object'
          ? { ...c, styles: { ...c.styles, ...(fillColor ? { fillColor } : {}) } }
          : { content: c, styles: { ...(isBold ? { fontStyle: 'bold' } : {}), ...(fillColor ? { fillColor } : {}) } }
      )
    );
  };

  for (const grp of groups) {
    const grpRows: EvaluacionFinalRow[] = [];
    for (const r of grp.rows) {
      pushRow(r.label, r.data);
      grpRows.push(r.data);
      allRows.push(r.data);
    }
    if (grp.subtotalLabel) {
      pushRow(grp.subtotalLabel, sumEvaluacionFinalRows(grpRows), true, [226, 239, 218]);
    }
  }
  pushRow(totalLabel, sumEvaluacionFinalRows(allRows), true, [255, 242, 204]);

  autoTable(doc, {
    startY,
    head: [headRow1, headRow2],
    body,
    theme: 'grid',
    styles: { fontSize: 6.2, cellPadding: 1.2, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [217, 234, 211], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 8, right: 8 },
  });
}

export function exportMonthlyReportPdf(
  reports: MonthlyReport[],
  meta: ExportMeta & { month: number; level: EducationLevel }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const monthLabel = MONTHS.find((m) => m.value === meta.month)?.label || String(meta.month);
  const levelTitle =
    meta.level === 'basica' && meta.basicaScope
      ? `BÁSICA (${BASICA_SCOPE_SHORT_LABELS[meta.basicaScope].toUpperCase()})`
      : LEVEL_LABELS[meta.level].toUpperCase();
  let y = drawHeader(
    doc,
    `REPORTE DE MOVIMIENTOS-SACE · ${levelTitle} · ${monthLabel.toUpperCase()} ${meta.year}`,
    meta
  );

  const renderSection = (title: string, rows: (MovementRow & { schoolName?: string })[]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(title, 12, y + 3);
    const head = meta.isConsolidated
      ? [['N°', 'Centro Educativo', 'RNE', 'NOMBRE', 'SEXO', 'ACCIÓN', 'GRADO Y SECCIÓN', 'MES']]
      : [['N°', 'RNE', 'NOMBRE', 'SEXO', 'ACCIÓN', 'GRADO Y SECCIÓN', 'MES']];
    const emptyMsg =
      !meta.isConsolidated && reports.length === 1 && reports[0]?.noMovements
        ? 'Mes reportado sin movimientos SACE.'
        : 'Sin movimientos registrados.';
    const body =
      rows.length === 0
        ? [[{ content: emptyMsg, colSpan: head[0].length, styles: { halign: 'center' as const } }]]
        : rows.map((r, i) =>
            meta.isConsolidated
              ? [i + 1, r.schoolName || '', r.rne, r.nombre, r.sexo, r.accion, r.gradoSeccion, r.mes]
              : [i + 1, r.rne, r.nombre, r.sexo, r.accion, r.gradoSeccion, r.mes]
          );

    autoTable(doc, {
      startY: y + 5,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [30, 41, 59], lineWidth: 0.2 },
      headStyles: { fillColor: [217, 234, 211], textColor: [15, 23, 42], fontStyle: 'bold' },
      margin: { left: 12, right: 12 },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  };

  renderSection(
    'INGRESOS',
    reports.flatMap((rep) => (rep.ingresos || []).map((r) => ({ ...r, schoolName: rep.schoolName })))
  );
  renderSection(
    'TRASLADOS',
    reports.flatMap((rep) => (rep.traslados || []).map((r) => ({ ...r, schoolName: rep.schoolName })))
  );
  renderSection(
    'DESERTORES',
    reports.flatMap((rep) => (rep.desertores || []).map((r) => ({ ...r, schoolName: rep.schoolName })))
  );

  drawSignatures(doc, y, meta);
  doc.save(`Movimientos_SACE_${LEVEL_LABELS[meta.level]}_${monthLabel}_${meta.year}.pdf`);
}

export function exportBasicaPdf(data: BasicaAnnualData, meta: ExportMeta) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'legal' });
  const scope: BasicaScope = meta.basicaScope || 'c1_2_3';
  const includeC12 = scope !== 'c3';
  const includeC3 = scope !== 'c1_2';
  const activeGrades = getBasicaGradesForScope(scope);
  const scopeSuffix =
    scope === 'c1_2_3' ? 'BÁSICA' : `BÁSICA (${BASICA_SCOPE_SHORT_LABELS[scope].toUpperCase()})`;

  // Page 1: Estadístico Final
  let y = drawHeader(doc, `REPORTE ESTADÍSTICO FINAL-SACE ${scopeSuffix} ${meta.year}`, meta);
  const p1Groups: { rows: { label: string; data: EstadisticoRow }[]; subtotalLabel?: string }[] = [];
  if (includeC12) {
    p1Groups.push({
      rows: BASICA_CYCLE_1_2.map((g) => ({ label: g.shortLabel, data: data.estadisticoFinal[g.key] })),
      subtotalLabel: includeC3 ? 'SUBTOTAL I-II' : undefined,
    });
  }
  if (includeC3) {
    p1Groups.push({
      rows: BASICA_CYCLE_3.map((g) => ({ label: g.shortLabel, data: data.estadisticoFinal[g.key] })),
      subtotalLabel: includeC12 ? 'SUBTOTAL III' : undefined,
    });
  }
  buildEstadisticoPdfTable(doc, y, p1Groups);
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  // Page 2: Matrícula por Edades
  doc.addPage('legal', 'landscape');
  y = drawHeader(doc, `MATRÍCULA FINAL POR EDADES ${scopeSuffix} ${meta.year}`, meta);
  const ageHead1: any[] = [{ content: 'Grado', rowSpan: 2, styles: { valign: 'middle' } }];
  const ageHead2: any[] = [];
  [...BASICA_AGES.map((a) => a.label), 'TOTAL'].forEach((lbl) => {
    ageHead1.push({ content: lbl, colSpan: 3, styles: { halign: 'center' } });
    ageHead2.push('N', 'V', 'T');
  });
  const ageBody: any[] = [];
  const colAgeTotals = BASICA_AGES.map(() => emptyNV());
  for (const g of activeGrades) {
    const rowCells: any[] = [{ content: g.label, styles: { halign: 'left', fontStyle: 'bold' } }];
    let rSum = emptyNV();
    BASICA_AGES.forEach((age, i) => {
      const nv = data.matriculaEdades[g.key][age.key] || emptyNV();
      rSum = addNV(rSum, nv);
      colAgeTotals[i] = addNV(colAgeTotals[i], nv);
      rowCells.push(nv.n, nv.v, { content: totalNV(nv), styles: { fontStyle: 'bold' } });
    });
    rowCells.push(rSum.n, rSum.v, { content: totalNV(rSum), styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } });
    ageBody.push(rowCells);
  }
  const ageTotalRow: any[] = [{ content: 'TOTAL', styles: { halign: 'left', fontStyle: 'bold', fillColor: [255, 242, 204] } }];
  let gAgeSum = emptyNV();
  colAgeTotals.forEach((nv) => {
    gAgeSum = addNV(gAgeSum, nv);
    ageTotalRow.push(
      { content: nv.n, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: nv.v, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: totalNV(nv), styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } }
    );
  });
  ageTotalRow.push(
    { content: gAgeSum.n, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
    { content: gAgeSum.v, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
    { content: totalNV(gAgeSum), styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } }
  );
  ageBody.push(ageTotalRow);

  autoTable(doc, {
    startY: y,
    head: [ageHead1, ageHead2],
    body: ageBody,
    theme: 'grid',
    styles: { fontSize: 5.8, cellPadding: 1, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [217, 234, 211], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 6, right: 6 },
  });
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  // Page 3: Aprobados por Área
  doc.addPage('legal', 'landscape');
  y = drawHeader(doc, `REPORTE DE APROBADOS Y NO APROBADOS POR ÁREA ${scopeSuffix} ${meta.year}`, meta);
  const s3Head1: any[] = [{ content: 'Grado', rowSpan: 2, styles: { valign: 'middle' } }];
  const s3Head2: any[] = [];
  BASICA_SUBJECTS.forEach((s) => {
    s3Head1.push({ content: s.label, colSpan: 3, styles: { halign: 'center' } });
    s3Head2.push('A', 'NA', 'T');
  });
  const s3Body: any[] = [];
  const pushS3 = (grades: typeof BASICA_ALL_GRADES, subTitle?: string) => {
    const sums = BASICA_SUBJECTS.map(() => ({ a: 0, na: 0 }));
    for (const g of grades) {
      const cells: any[] = [{ content: g.label, styles: { halign: 'left' } }];
      BASICA_SUBJECTS.forEach((s, i) => {
        const val = data.aprobadosPorArea[g.key][s.key] || { a: 0, na: 0 };
        sums[i].a += val.a;
        sums[i].na += val.na;
        cells.push(val.a, val.na, { content: totalANA(val), styles: { fontStyle: 'bold' } });
      });
      s3Body.push(cells);
    }
    if (subTitle) {
      const subCells: any[] = [{ content: subTitle, styles: { halign: 'left', fontStyle: 'bold', fillColor: [226, 239, 218] } }];
      sums.forEach((tot) => {
        subCells.push(
          { content: tot.a, styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } },
          { content: tot.na, styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } },
          { content: tot.a + tot.na, styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } }
        );
      });
      s3Body.push(subCells);
    }
    return sums;
  };
  const sum12 = includeC12
    ? pushS3(BASICA_CYCLE_1_2, includeC3 ? 'Subtotal I-II' : undefined)
    : BASICA_SUBJECTS.map(() => ({ a: 0, na: 0 }));
  const sum3 = includeC3
    ? pushS3(BASICA_CYCLE_3, includeC12 ? 'Subtotal III' : undefined)
    : BASICA_SUBJECTS.map(() => ({ a: 0, na: 0 }));
  const totS3: any[] = [{ content: 'Total', styles: { halign: 'left', fontStyle: 'bold', fillColor: [255, 242, 204] } }];
  BASICA_SUBJECTS.forEach((_, i) => {
    const a = sum12[i].a + sum3[i].a;
    const na = sum12[i].na + sum3[i].na;
    totS3.push(
      { content: a, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: na, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: a + na, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } }
    );
  });
  s3Body.push(totS3);

  autoTable(doc, {
    startY: y,
    head: [s3Head1, s3Head2],
    body: s3Body,
    theme: 'grid',
    styles: { fontSize: 6.2, cellPadding: 1.2, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [217, 234, 211], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 8, right: 8 },
  });
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  // Page 4: Evaluación Final
  doc.addPage('legal', 'landscape');
  y = drawHeader(doc, `RESULTADOS DE EVALUACIÓN FINAL ${scopeSuffix} ${meta.year}`, meta);
  const p4Groups: { rows: { label: string; data: EvaluacionFinalRow }[]; subtotalLabel?: string }[] = [];
  if (includeC12) {
    p4Groups.push({
      rows: BASICA_CYCLE_1_2.map((g) => ({ label: g.label, data: data.evaluacionFinal[g.key] })),
      subtotalLabel: includeC3 ? 'Subtotal I-II' : undefined,
    });
  }
  if (includeC3) {
    p4Groups.push({
      rows: BASICA_CYCLE_3.map((g) => ({ label: g.label, data: data.evaluacionFinal[g.key] })),
      subtotalLabel: includeC12 ? 'Subtotal III' : undefined,
    });
  }
  buildEvalFinalPdfTable(doc, y, p4Groups);
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  // Page 5: Evaluación por Áreas + Egresados 6°/9°
  doc.addPage('legal', 'landscape');
  const egTitleShort = scope === 'c1_2' ? '6°' : scope === 'c3' ? '9°' : '6°/9°';
  y = drawHeader(doc, `EVALUACIÓN POR ÁREAS Y EGRESADOS ${egTitleShort} · ${scopeSuffix} ${meta.year}`, meta);
  const firstAreasPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
  for (const area of BASICA_EVAL_AREAS) {
    const body: any[] = [];
    let sEv = emptyFM(), sAp = emptyFM(), sRep = emptyFM();
    for (const g of activeGrades) {
      const cell = data.evaluacionPorAreas?.[area.key]?.[g.key] || {
        evaluados: emptyFM(),
        aprobados: emptyFM(),
        reprobados: emptyFM(),
      };
      sEv = addFM(sEv, cell.evaluados);
      sAp = addFM(sAp, cell.aprobados);
      sRep = addFM(sRep, cell.reprobados);
      body.push([
        g.shortLabel,
        cell.evaluados.f, cell.evaluados.m, totalFM(cell.evaluados),
        cell.aprobados.f, cell.aprobados.m, totalFM(cell.aprobados),
        cell.reprobados.f, cell.reprobados.m, totalFM(cell.reprobados),
      ]);
    }
    body.push([
      'Total',
      sEv.f, sEv.m, totalFM(sEv),
      sAp.f, sAp.m, totalFM(sAp),
      sRep.f, sRep.m, totalFM(sRep),
    ]);
    if (y > 145) {
      doc.addPage('legal', 'landscape');
      y = 14;
    }
    autoTable(doc, {
      startY: y,
      head: [
        [{ content: area.label, colSpan: 10, styles: { halign: 'center' } }],
        [
          { content: 'Grado', rowSpan: 2 },
          { content: 'EVALUADOS', colSpan: 3 },
          { content: 'APROBADOS', colSpan: 3 },
          { content: 'REPROBADOS', colSpan: 3 },
        ],
        ['F', 'M', 'T', 'F', 'M', 'T', 'F', 'M', 'T'],
      ],
      body,
      theme: 'grid',
      styles: { fontSize: 6.1, cellPadding: 0.9, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
      headStyles: { fillColor: [253, 230, 138], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
      margin: { left: 10, right: 150 },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  const lastAreasPage = doc.getNumberOfPages();
  doc.setPage(firstAreasPage);

  // Egresados table (right column of first areas page)
  const egBody: any[] = [];
  let egSum = emptyFM();
  for (const age of BASICA_EGRESADOS_AGES) {
    const fm = data.egresadosPorEdad[age.key] || emptyFM();
    egSum = addFM(egSum, fm);
    egBody.push([{ content: age.label, styles: { halign: 'left' } }, fm.f, fm.m, totalFM(fm)]);
  }
  egBody.push([{ content: 'Total', styles: { halign: 'left', fontStyle: 'bold' } }, egSum.f, egSum.m, totalFM(egSum)]);
  const egBoxTitle =
    scope === 'c1_2'
      ? 'EGRESADAS(OS) 6° GRADO POR EDAD Y SEXO'
      : scope === 'c3'
      ? 'EGRESADAS(OS) 9° GRADO POR EDAD Y SEXO'
      : 'EGRESADAS(OS) 6° O 9° GRADO POR EDAD Y SEXO';
  autoTable(doc, {
    startY: 39,
    head: [
      [{ content: egBoxTitle, colSpan: 4 }],
      ['EDAD', 'F', 'M', 'TOTAL'],
    ],
    body: egBody,
    theme: 'grid',
    styles: { fontSize: 6.8, cellPadding: 1.3, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [191, 219, 254], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 220, right: 10 },
  });
  const egresadosFinalY = (doc as any).lastAutoTable.finalY;
  doc.setPage(lastAreasPage);
  drawSignatures(doc, lastAreasPage === firstAreasPage ? Math.max(y, egresadosFinalY) : y, meta);

  // Page 6: Cuadro Resumen por Asignatura (por Denominación de Notas)
  doc.addPage('legal', 'landscape');
  y = drawHeader(
    doc,
    `CUADRO RESUMEN POR ASIGNATURA (POR DENOMINACIÓN DE NOTAS) · ${scopeSuffix} · ${
      meta.sector === 'no_gubernamental' ? 'NO GUBERNAMENTAL' : 'GUBERNAMENTAL'
    } · ${meta.year}`,
    meta
  );
  const resHead1: any[] = [{ content: 'GRADOS', rowSpan: 2, styles: { valign: 'middle' } }];
  const resHead2: any[] = [];
  BASICA_RESUMEN_SUBJECTS.forEach((s) => {
    resHead1.push({ content: s.label, colSpan: 5, styles: { halign: 'center' } });
    resHead2.push('I', 'B', 'A', 'E', 'T');
  });
  const resBody: any[] = [];
  const pushResGroup = (grades: typeof BASICA_CYCLE_1_2, subTitle?: string) => {
    const sums = BASICA_RESUMEN_SUBJECTS.map(() => emptyIBAE());
    for (const g of grades) {
      const cells: any[] = [{ content: g.label.toUpperCase(), styles: { halign: 'left', fontStyle: 'bold' } }];
      BASICA_RESUMEN_SUBJECTS.forEach((s, i) => {
        const val = data.resumenDenominacion?.[g.key]?.[s.key] || emptyIBAE();
        sums[i] = addIBAE(sums[i], val);
        cells.push(val.i, val.b, val.a, val.e, { content: totalIBAE(val), styles: { fontStyle: 'bold' } });
      });
      resBody.push(cells);
    }
    if (subTitle) {
      const subCells: any[] = [{ content: subTitle, styles: { halign: 'left', fontStyle: 'bold', fillColor: [226, 239, 218] } }];
      sums.forEach((val) => {
        subCells.push(
          { content: val.i, styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } },
          { content: val.b, styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } },
          { content: val.a, styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } },
          { content: val.e, styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } },
          { content: totalIBAE(val), styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } }
        );
      });
      resBody.push(subCells);
    }
    return sums;
  };
  const r12 = includeC12
    ? pushResGroup(BASICA_CYCLE_1_2, includeC3 ? 'SUB TOTAL' : undefined)
    : BASICA_RESUMEN_SUBJECTS.map(() => emptyIBAE());
  const r3 = includeC3
    ? pushResGroup(BASICA_CYCLE_3, includeC12 ? 'SUB TOTAL' : undefined)
    : BASICA_RESUMEN_SUBJECTS.map(() => emptyIBAE());
  const resTotRow: any[] = [{ content: 'TOTAL', styles: { halign: 'left', fontStyle: 'bold', fillColor: [255, 242, 204] } }];
  BASICA_RESUMEN_SUBJECTS.forEach((_, i) => {
    const val = addIBAE(r12[i], r3[i]);
    resTotRow.push(
      { content: val.i, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: val.b, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: val.a, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: val.e, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: totalIBAE(val), styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } }
    );
  });
  resBody.push(resTotRow);

  autoTable(doc, {
    startY: y,
    head: [resHead1, resHead2],
    body: resBody,
    theme: 'grid',
    styles: { fontSize: 5.0, cellPadding: 0.75, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [226, 215, 236], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 6, right: 6 },
  });
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  doc.save(`Cuadros_Basica_${meta.saceCode || 'Distrito_18B'}_${meta.year}.pdf`);
}

export function exportMediaPdf(data: MediaAnnualData, meta: ExportMeta) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'legal' });

  // Page 1: Estadístico Final Media
  let y = drawHeader(doc, `REPORTE ESTADÍSTICO FINAL-SACE MEDIA ${meta.year}`, meta);
  buildEstadisticoPdfTable(doc, y, [
    {
      rows: MEDIA_GRADES.map((g) => ({ label: g.label.toUpperCase(), data: data.estadisticoFinal[g.key] })),
    },
  ]);
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  // Page 2: Matrícula por Edades Media
  doc.addPage('legal', 'landscape');
  y = drawHeader(doc, `FORMATO DE MATRÍCULA FINAL POR EDADES NIVEL MEDIO ${meta.year}`, meta);
  const ageHead1: any[] = [{ content: 'Grado', rowSpan: 2, styles: { valign: 'middle' } }];
  const ageHead2: any[] = [];
  [...MEDIA_AGES.map((a) => a.label), 'TOTAL'].forEach((lbl) => {
    ageHead1.push({ content: lbl, colSpan: 3, styles: { halign: 'center' } });
    ageHead2.push('N', 'V', 'T');
  });
  const ageBody: any[] = [];
  const colTotals = MEDIA_AGES.map(() => emptyNV());
  for (const g of MEDIA_GRADES) {
    const cells: any[] = [{ content: g.label.toUpperCase(), styles: { halign: 'left', fontStyle: 'bold' } }];
    let rSum = emptyNV();
    MEDIA_AGES.forEach((age, i) => {
      const nv = data.matriculaEdades[g.key][age.key] || emptyNV();
      rSum = addNV(rSum, nv);
      colTotals[i] = addNV(colTotals[i], nv);
      cells.push(nv.n, nv.v, { content: totalNV(nv), styles: { fontStyle: 'bold' } });
    });
    cells.push(rSum.n, rSum.v, { content: totalNV(rSum), styles: { fontStyle: 'bold', fillColor: [226, 239, 218] } });
    ageBody.push(cells);
  }
  const totRow: any[] = [{ content: 'Total', styles: { halign: 'left', fontStyle: 'bold', fillColor: [255, 242, 204] } }];
  let gSum = emptyNV();
  colTotals.forEach((nv) => {
    gSum = addNV(gSum, nv);
    totRow.push(
      { content: nv.n, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: nv.v, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: totalNV(nv), styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } }
    );
  });
  totRow.push(
    { content: gSum.n, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
    { content: gSum.v, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
    { content: totalNV(gSum), styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } }
  );
  ageBody.push(totRow);

  autoTable(doc, {
    startY: y,
    head: [ageHead1, ageHead2],
    body: ageBody,
    theme: 'grid',
    styles: { fontSize: 5.8, cellPadding: 1, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [217, 234, 211], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 6, right: 6 },
  });
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  // Page 3: Aprobados y No Aprobados por Asignatura (Décimo & Undécimo)
  doc.addPage('legal', 'landscape');
  y = drawHeader(
    doc,
    `REPORTE DE APROBADOS Y NO APROBADOS POR ASIGNATURA (${(meta.modality || 'presencial').toUpperCase()}) · ${meta.year}`,
    meta
  );
  const decBody = MEDIA_DECIMO_SUBJECTS.map((s, i) => {
    const val = data.aprobadosAsignatura.decimo[s.key];
    return [i + 1, { content: s.label, styles: { halign: 'left' } }, val.a, val.na, totalANA(val)];
  });
  const undBody = MEDIA_UNDECIMO_SUBJECTS.map((s, i) => {
    const val = data.aprobadosAsignatura.undecimo[s.key];
    return [i + 1, { content: s.label, styles: { halign: 'left' } }, val.a, val.na, totalANA(val)];
  });

  autoTable(doc, {
    startY: y,
    head: [
      [{ content: 'DÉCIMO GRADO', colSpan: 5 }],
      ['N°', 'MATERIA', 'A', 'NA', 'T'],
    ],
    body: decBody as any,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [217, 234, 211], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 10, right: 185 },
  });
  autoTable(doc, {
    startY: y,
    head: [
      [{ content: 'UNDÉCIMO GRADO', colSpan: 5 }],
      ['N°', 'MATERIA', 'A', 'NA', 'T'],
    ],
    body: undBody as any,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [217, 234, 211], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 185, right: 10 },
  });
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  // Page 4: Evaluación Final Media
  doc.addPage('legal', 'landscape');
  y = drawHeader(doc, `RESULTADOS DE EVALUACIÓN FINAL MEDIA ${meta.year}`, meta);
  buildEvalFinalPdfTable(
    doc,
    y,
    [{ rows: MEDIA_GRADES.map((g) => ({ label: g.label, data: data.evaluacionFinal[g.key] })) }],
    'Sub-total'
  );
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  // Page 5: Cuadro Resumen por Denominación de Notas
  doc.addPage('legal', 'landscape');
  y = drawHeader(
    doc,
    `CUADRO RESUMEN POR ASIGNATURA (DENOMINACIÓN DE NOTAS) · ${
      meta.sector === 'no_gubernamental' ? 'NO GUBERNAMENTAL' : 'GUBERNAMENTAL'
    } · ${meta.year}`,
    meta
  );
  const resHead1: any[] = [{ content: 'GRADOS', rowSpan: 2, styles: { valign: 'middle' } }];
  const resHead2: any[] = [];
  MEDIA_RESUMEN_SUBJECTS.forEach((s) => {
    resHead1.push({ content: s.label, colSpan: 5, styles: { halign: 'center' } });
    resHead2.push('I', 'B', 'A', 'E', 'T');
  });
  const resBody: any[] = [];
  const subjTotals = MEDIA_RESUMEN_SUBJECTS.map(() => emptyIBAE());
  for (const g of MEDIA_GRADES) {
    const cells: any[] = [{ content: g.label.toUpperCase(), styles: { halign: 'left', fontStyle: 'bold' } }];
    MEDIA_RESUMEN_SUBJECTS.forEach((s, i) => {
      const val = data.resumenDenominacion[g.key][s.key] || emptyIBAE();
      subjTotals[i] = addIBAE(subjTotals[i], val);
      cells.push(val.i, val.b, val.a, val.e, { content: totalIBAE(val), styles: { fontStyle: 'bold' } });
    });
    resBody.push(cells);
  }
  const resTotRow: any[] = [{ content: 'TOTAL', styles: { halign: 'left', fontStyle: 'bold', fillColor: [255, 242, 204] } }];
  subjTotals.forEach((val) => {
    resTotRow.push(
      { content: val.i, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: val.b, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: val.a, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: val.e, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: totalIBAE(val), styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } }
    );
  });
  resBody.push(resTotRow);

  autoTable(doc, {
    startY: y,
    head: [resHead1, resHead2],
    body: resBody,
    theme: 'grid',
    styles: { fontSize: 5.2, cellPadding: 0.9, halign: 'right', lineColor: [30, 41, 59], lineWidth: 0.2 },
    headStyles: { fillColor: [226, 215, 236], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    margin: { left: 6, right: 6 },
  });
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  doc.save(`Cuadros_Media_${meta.saceCode || 'Distrito_18B'}_${meta.year}.pdf`);
}

export function exportPrebasicaPdf(rawData: PrebasicaAnnualData, meta: ExportMeta) {
  const data = normalizePrebasicaData(rawData);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  // Page 1: Reporte Estadístico Final
  let y = drawHeader(doc, `REPORTE ESTADÍSTICO FINAL-SACE PREBÁSICA ${meta.year}`, meta);
  buildEstadisticoPdfTable(doc, y, [
    {
      rows: PREBASICA_GRADES.map((g) => ({
        label: g.shortLabel,
        data: data.estadisticoFinal[g.key],
      })),
    },
  ]);
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  // Page 2: Matrícula Final por Edades
  doc.addPage('letter', 'landscape');
  y = drawHeader(doc, `MATRÍCULA FINAL POR EDADES PREBÁSICA ${meta.year}`, meta);
  const ageHead1: any[] = [{ content: 'Grado', rowSpan: 2, styles: { valign: 'middle' } }];
  const ageHead2: any[] = [];
  [...PREBASICA_AGES.map((a) => a.label), 'TOTAL'].forEach((lbl) => {
    ageHead1.push({ content: lbl, colSpan: 3, styles: { halign: 'center' } });
    ageHead2.push('N', 'V', 'T');
  });

  const ageBody: any[] = [];
  const colAgeTotals = PREBASICA_AGES.map(() => emptyNV());
  for (const g of PREBASICA_GRADES) {
    const rowCells: any[] = [
      { content: g.edadesLabel, styles: { halign: 'left', fontStyle: 'bold' } },
    ];
    let rSum = emptyNV();
    PREBASICA_AGES.forEach((age, i) => {
      const nv = data.matriculaEdades[g.key][age.key] || emptyNV();
      rSum = addNV(rSum, nv);
      colAgeTotals[i] = addNV(colAgeTotals[i], nv);
      rowCells.push(nv.n, nv.v, { content: totalNV(nv), styles: { fontStyle: 'bold' } });
    });
    rowCells.push(rSum.n, rSum.v, {
      content: totalNV(rSum),
      styles: { fontStyle: 'bold', fillColor: [226, 239, 218] },
    });
    ageBody.push(rowCells);
  }

  const ageTotalRow: any[] = [
    {
      content: 'TOTAL',
      styles: { halign: 'left', fontStyle: 'bold', fillColor: [255, 242, 204] },
    },
  ];
  let gAgeSum = emptyNV();
  colAgeTotals.forEach((nv) => {
    gAgeSum = addNV(gAgeSum, nv);
    ageTotalRow.push(
      { content: nv.n, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: nv.v, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
      { content: totalNV(nv), styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } }
    );
  });
  ageTotalRow.push(
    { content: gAgeSum.n, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
    { content: gAgeSum.v, styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } },
    { content: totalNV(gAgeSum), styles: { fontStyle: 'bold', fillColor: [255, 242, 204] } }
  );
  ageBody.push(ageTotalRow);

  autoTable(doc, {
    startY: y,
    head: [ageHead1, ageHead2],
    body: ageBody,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      halign: 'right',
      lineColor: [30, 41, 59],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [217, 234, 211],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
    },
    margin: { left: 10, right: 10 },
  });
  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);

  doc.save(`Cuadros_Prebasica_${meta.saceCode || 'Distrito_18B'}_${meta.year}.pdf`);
}

export function exportParteMensualPdf(
  byGrade: Record<string, ParteMensualComputedRow>,
  totalRow: ParteMensualComputedRow,
  meta: ExportMeta & { month: number; level: EducationLevel; diasTrabajados: number }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'legal' });
  const monthLabel = MONTHS.find((m) => m.value === meta.month)?.label || String(meta.month);
  const finalLabel = meta.level === 'prebasica' ? 'MATRÍCULA ACTUAL' : 'MATRÍCULA FINAL';
  const scope = meta.level === 'basica' ? meta.basicaScope || 'c1_2_3' : undefined;
  const grades = getParteMensualGrades(meta.level, scope);
  const levelTitle =
    meta.level === 'basica' && scope && scope !== 'c1_2_3'
      ? `BÁSICA (${BASICA_SCOPE_SHORT_LABELS[scope].toUpperCase()})`
      : LEVEL_LABELS[meta.level].toUpperCase();

  let y = drawHeader(
    doc,
    `REPORTE DE PARTE MENSUAL ${meta.year} · ${levelTitle}`,
    meta
  );

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`Mes: ${monthLabel.toUpperCase()} ${meta.year}`, 12, y + 1);
  doc.text(
    meta.isConsolidated
      ? `Promedio Días Trabajados: ${meta.diasTrabajados}`
      : `Días Trabajados: ${meta.diasTrabajados}`,
    pageWidth - 12,
    y + 1,
    { align: 'right' }
  );
  y += 5;

  const blocks = [
    { title: 'MATRÍCULA INICIAL', fill: [255, 242, 204] },
    { title: finalLabel, fill: [226, 232, 240] },
    { title: 'INASISTENCIAS', fill: [252, 228, 236] },
    { title: 'ASISTENCIA MEDIA', fill: [232, 245, 233] },
    { title: 'TANTO POR CIENTO', fill: [253, 235, 208] },
    { title: 'INGRESOS', fill: [255, 242, 204] },
    { title: 'TRASLADOS', fill: [227, 242, 253] },
    { title: 'DESERTORES', fill: [251, 233, 231] },
  ];

  const headRow1: any[] = [
    { content: 'GRADO', rowSpan: 2, styles: { valign: 'middle', fillColor: [217, 234, 211] } },
  ];
  const headRow2: any[] = [];
  blocks.forEach((b) => {
    headRow1.push({
      content: b.title,
      colSpan: 3,
      styles: { halign: 'center' as const, fillColor: b.fill },
    });
    headRow2.push(
      { content: 'N', styles: { halign: 'center' as const, fillColor: b.fill } },
      { content: 'V', styles: { halign: 'center' as const, fillColor: b.fill } },
      { content: 'T', styles: { halign: 'center' as const, fillColor: b.fill } }
    );
  });

  const makeCells = (
    label: string,
    r: ParteMensualComputedRow,
    variant: 'normal' | 'subtotal' | 'total' = 'normal'
  ) => {
    const totStyle =
      variant === 'total'
        ? { fontStyle: 'bold' as const, fillColor: [197, 224, 180] }
        : variant === 'subtotal'
        ? { fontStyle: 'bold' as const, fillColor: [226, 239, 218] }
        : {};
    const fmt2 = (val: number) => val.toFixed(2);
    const cells: any[] = [
      { content: label.toUpperCase(), styles: { halign: 'left' as const, fontStyle: 'bold' as const, ...totStyle } },
    ];
    const pushInt = (n: number, v: number, t: number) => {
      cells.push(
        { content: n, styles: { ...totStyle } },
        { content: v, styles: { ...totStyle } },
        { content: t, styles: { fontStyle: 'bold' as const, ...totStyle } }
      );
    };
    const pushFloat = (n: number, v: number, t: number) => {
      cells.push(
        { content: fmt2(n), styles: { ...totStyle } },
        { content: fmt2(v), styles: { ...totStyle } },
        { content: fmt2(t), styles: { fontStyle: 'bold' as const, ...totStyle } }
      );
    };
    pushInt(r.matInicial.n, r.matInicial.v, totalNV(r.matInicial));
    pushInt(r.matFinal.n, r.matFinal.v, totalNV(r.matFinal));
    pushInt(r.inasistencias.n, r.inasistencias.v, totalNV(r.inasistencias));
    pushFloat(r.asistenciaMedia.n, r.asistenciaMedia.v, r.asistenciaMedia.t);
    pushFloat(r.tantoPorCiento.n, r.tantoPorCiento.v, r.tantoPorCiento.t);
    pushInt(r.ingresos.n, r.ingresos.v, totalNV(r.ingresos));
    pushInt(r.traslados.n, r.traslados.v, totalNV(r.traslados));
    pushInt(r.desertores.n, r.desertores.v, totalNV(r.desertores));
    return cells;
  };

  const body: any[] = [];
  if (meta.level === 'basica' && scope === 'c1_2_3') {
    const c12Rows: ParteMensualComputedRow[] = [];
    for (const g of BASICA_CYCLE_1_2) {
      if (byGrade[g.key]) {
        body.push(makeCells(g.label, byGrade[g.key], 'normal'));
        c12Rows.push(byGrade[g.key]);
      }
    }
    body.push(makeCells('Subtotal I-II Ciclo', sumParteMensualComputedRows(c12Rows), 'subtotal'));

    const c3Rows: ParteMensualComputedRow[] = [];
    for (const g of BASICA_CYCLE_3) {
      if (byGrade[g.key]) {
        body.push(makeCells(g.label, byGrade[g.key], 'normal'));
        c3Rows.push(byGrade[g.key]);
      }
    }
    body.push(makeCells('Subtotal III Ciclo', sumParteMensualComputedRows(c3Rows), 'subtotal'));
  } else {
    for (const g of grades) {
      if (byGrade[g.key]) {
        body.push(makeCells(g.label, byGrade[g.key], 'normal'));
      }
    }
  }
  body.push(makeCells('TOTAL', totalRow, 'total'));

  autoTable(doc, {
    startY: y,
    head: [headRow1, headRow2],
    body,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: 1.4,
      halign: 'right',
      lineColor: [30, 41, 59],
      lineWidth: 0.2,
    },
    headStyles: {
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 6.5,
    },
    margin: { left: 8, right: 8 },
  });

  drawSignatures(doc, (doc as any).lastAutoTable.finalY, meta);
  doc.save(
    `Parte_Mensual_${LEVEL_LABELS[meta.level]}_${monthLabel}_${meta.saceCode || 'Distrito_18B'}_${meta.year}.pdf`
  );
}

export interface ReportHistoryPdfRow {
  monthLabel: string;
  kindLabel: string;
  levelLabel: string;
  status: ReportStatus | 'missing';
  summaryText: string;
  reviewComment: string;
  updatedAtLabel: string;
}

const HISTORY_STATUS_LABELS: Record<ReportStatus | 'missing', string> = {
  approved: 'Aprobado',
  submitted: 'Enviado a revisión',
  returned: 'Devuelto con observaciones',
  draft: 'Borrador',
  missing: 'Sin entrega',
};

export function exportReportHistoryPdf(
  rows: ReportHistoryPdfRow[],
  meta: ExportMeta & { periodLabel?: string; filterSummary?: string }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let y = drawHeader(doc, `HISTORIAL DE ENVÍOS DE REPORTES SACE · ${meta.year}`, meta);

  const approvedCount = rows.filter((r) => r.status === 'approved').length;
  const submittedCount = rows.filter((r) => r.status === 'submitted').length;
  const returnedCount = rows.filter((r) => r.status === 'returned').length;
  const pendingCount = rows.filter((r) => r.status === 'draft' || r.status === 'missing').length;
  const sentTotal = approvedCount + submittedCount + returnedCount;

  const generatedAt = new Date().toLocaleString('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Período: ${meta.periodLabel || `Año ${meta.year}`}`, 12, y + 1);
  doc.text(`Generado: ${generatedAt}`, pageWidth - 12, y + 1, { align: 'right' });
  y += 5;

  if (meta.filterSummary) {
    doc.text(`Filtros aplicados: ${meta.filterSummary}`, 12, y + 1);
    y += 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.text(
    `Total listado: ${rows.length}   |   Envíos realizados: ${sentTotal} (Aprobados: ${approvedCount} · En revisión: ${submittedCount} · Devueltos: ${returnedCount})   |   Borrador / Sin entrega: ${pendingCount}`,
    12,
    y + 1
  );
  y += 5;

  const body =
    rows.length === 0
      ? [
          [
            {
              content: 'No hay registros para los filtros seleccionados.',
              colSpan: 8,
              styles: { halign: 'center' as const },
            },
          ],
        ]
      : rows.map((r, idx) => [
          idx + 1,
          `${r.monthLabel} ${meta.year}`,
          r.kindLabel,
          r.levelLabel,
          {
            content: HISTORY_STATUS_LABELS[r.status],
            styles: {
              fontStyle: 'bold' as const,
              textColor:
                r.status === 'approved'
                  ? [4, 120, 87]
                  : r.status === 'submitted'
                  ? [29, 78, 216]
                  : r.status === 'returned'
                  ? [180, 83, 9]
                  : r.status === 'missing'
                  ? [185, 28, 28]
                  : [71, 85, 105],
            },
          },
          r.summaryText,
          r.reviewComment || '—',
          r.updatedAtLabel,
        ]);

  autoTable(doc, {
    startY: y,
    head: [
      [
        'N°',
        'Mes',
        'Tipo de Reporte',
        'Nivel',
        'Estado de Envío',
        'Resumen',
        'Observaciones Distritales',
        'Última Actualización',
      ],
    ],
    body: body as any,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      lineColor: [30, 41, 59],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [217, 234, 211],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 28 },
      2: { cellWidth: 34 },
      3: { cellWidth: 34 },
      4: { cellWidth: 34 },
      5: { cellWidth: 46 },
      6: { cellWidth: 38 },
      7: { cellWidth: 31, halign: 'center' },
    },
    margin: { left: 12, right: 12 },
  });

  const finalY = (doc as any).lastAutoTable.finalY as number;
  if (finalY + 24 > pageHeight) {
    doc.addPage('letter', 'landscape');
    drawSignatures(doc, 16, meta);
  } else {
    drawSignatures(doc, finalY, meta);
  }

  const safeCode = (meta.saceCode || meta.schoolName || 'Centro').replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`Historial_Reportes_${safeCode}_${meta.year}.pdf`);
}



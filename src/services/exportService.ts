import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Schedule, MinistryAssignment, getAssignmentMembers } from '../types';
import { formatDateDisplayManila } from '../utils/dateUtils';
import { resolveScheduleSongTitles } from '../utils/songResolveUtils';

function formatRoleLabel(role: string): string {
  const r = (role || '').trim();
  const lower = r.toLowerCase();
  if (lower.includes('audio') || lower.includes('sound') || (lower.includes('live') && lower.includes('tech'))) {
    return 'Audio / Live Technician';
  }
  if (lower === 'backup singer/s' || lower === 'backup singers' || lower === 'backup singer' || lower === 'back-up singer' || lower === 'back-up singer/s') {
    return 'Backup Singers';
  }
  if (lower === 'song leader/s' || lower === 'song leader' || lower === 'worship leader') {
    return 'Song Leader';
  }
  return r;
}

/**
 * Creates an offscreen DOM element containing the clean, minimal lineup template.
 */
function createExportElement(schedule: Schedule): HTMLElement {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a'; // slate-900
  container.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  container.style.padding = '32px 36px';
  container.style.boxSizing = 'border-box';

  const resolved = resolveScheduleSongTitles(schedule);
  const praiseSongs = (resolved.praiseSongs || []).map((s) => s.trim()).filter(Boolean);
  const worshipSongs = (resolved.worshipSongs || []).map((s) => s.trim()).filter(Boolean);
  const assignments = schedule.ministryAssignments || [];

  // Extract Song Leaders and Backup Singers
  let praiseLeaders: string[] = [];
  let worshipLeaders: string[] = [];
  let genericLeaders: string[] = [];

  let praiseBackups: string[] = [];
  let worshipBackups: string[] = [];
  let genericBackups: string[] = [];

  let otherAssignments: MinistryAssignment[] = [];

  assignments.forEach((assignment) => {
    const roleLower = (assignment.role || '').toLowerCase().trim();
    const rawMembers = getAssignmentMembers(assignment);
    const names = rawMembers
      .map((m) => (m.memberName || '').trim())
      .filter((n) => Boolean(n) && n !== 'Unassigned' && n !== '—' && n !== 'N/A');

    const isSongLeader =
      roleLower.includes('song leader') ||
      roleLower.includes('worship leader') ||
      roleLower.includes('praise leader');

    const isBackupSinger =
      roleLower.includes('backup') || roleLower.includes('vocalist') || roleLower.includes('singer');

    if (isSongLeader) {
      if (roleLower.includes('praise') && roleLower.includes('worship')) {
        genericLeaders.push(...names);
      } else if (roleLower.includes('praise')) {
        praiseLeaders.push(...names);
      } else if (roleLower.includes('worship')) {
        worshipLeaders.push(...names);
      } else {
        genericLeaders.push(...names);
      }
    } else if (isBackupSinger) {
      if (roleLower.includes('praise') && roleLower.includes('worship')) {
        genericBackups.push(...names);
      } else if (roleLower.includes('praise')) {
        praiseBackups.push(...names);
      } else if (roleLower.includes('worship')) {
        worshipBackups.push(...names);
      } else {
        genericBackups.push(...names);
      }
    } else {
      otherAssignments.push(assignment);
    }
  });

  const allLeaderNames = [
    ...praiseLeaders,
    ...worshipLeaders,
    ...genericLeaders
  ].filter((v, i, a) => a.indexOf(v) === i);

  const hasTwoSeparateLeaders =
    (praiseLeaders.length > 0 && worshipLeaders.length > 0) ||
    praiseLeaders.length >= 2 ||
    worshipLeaders.length >= 2 ||
    (praiseLeaders.length > 0 && genericLeaders.length > 0) ||
    (worshipLeaders.length > 0 && genericLeaders.length > 0) ||
    genericLeaders.length >= 2 ||
    (praiseBackups.length > 0 && worshipBackups.length > 0);

  let mainBodyHTML = '';

  const formatSongKey = (key?: string) => {
    if (!key || !key.trim()) return '';
    const cleanKey = key.trim();
    return `<span style="font-size: 11px; font-weight: 600; color: #475569; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1px 6px; margin-left: 6px; white-space: nowrap;">Key: ${escapeHtml(cleanKey)}</span>`;
  };

  const praiseItems = praiseSongs.length > 0
    ? praiseSongs.map((s, i) => {
        const keyTag = formatSongKey(schedule.praiseSongKeys?.[i]);
        return `
          <li style="font-size: 13.5px; font-weight: 500; color: #1e293b; line-height: 1.5; word-break: break-word; overflow-wrap: anywhere; display: flex; align-items: baseline; flex-wrap: wrap;">
            <span><strong style="color: #1b75bc; margin-right: 6px;">${i + 1}.</strong>${escapeHtml(s)}</span>
            ${keyTag}
          </li>
        `;
      }).join('')
    : '<div style="font-size: 13px; color: #94a3b8; font-style: italic;">N/A</div>';

  const worshipItems = worshipSongs.length > 0
    ? worshipSongs.map((s, i) => {
        const keyTag = formatSongKey(schedule.worshipSongKeys?.[i]);
        return `
          <li style="font-size: 13.5px; font-weight: 500; color: #1e293b; line-height: 1.5; word-break: break-word; overflow-wrap: anywhere; display: flex; align-items: baseline; flex-wrap: wrap;">
            <span><strong style="color: #1b75bc; margin-right: 6px;">${i + 1}.</strong>${escapeHtml(s)}</span>
            ${keyTag}
          </li>
        `;
      }).join('')
    : '<div style="font-size: 13px; color: #94a3b8; font-style: italic;">N/A</div>';

  const renderVerticalMemberList = (names: string[]) => {
    if (names.length === 0) {
      return '<div style="font-size: 13px; font-weight: 500; color: #94a3b8; font-style: italic;">N/A</div>';
    }
    return `
      <div style="display: flex; flex-direction: column; gap: 4px;">
        ${names.map((n) => `
          <div style="font-size: 13.5px; font-weight: 600; color: #0f172a; line-height: 1.45; word-break: break-word; overflow-wrap: anywhere; display: flex; align-items: center; gap: 6px;">
            <span style="color: #64748b; font-size: 10px; line-height: 1;">&bull;</span>
            <span>${escapeHtml(n)}</span>
          </div>
        `).join('')}
      </div>
    `;
  };

  if (hasTwoSeparateLeaders) {
    // TWO SONG LEADERS: 2-column layout (Left: Praise, Right: Worship)
    const pLeaders = praiseLeaders.length > 0 ? praiseLeaders : (genericLeaders[0] ? [genericLeaders[0]] : []);
    const wLeaders = worshipLeaders.length > 0 ? worshipLeaders : (genericLeaders[1] ? [genericLeaders[1]] : []);

    const praiseLeaderLines = renderVerticalMemberList(pLeaders);
    const worshipLeaderLines = renderVerticalMemberList(wLeaders);

    const praiseBackupLines = renderVerticalMemberList(
      praiseBackups.length > 0 ? praiseBackups : (genericBackups.length > 0 ? genericBackups : [])
    );

    const worshipBackupLines = renderVerticalMemberList(
      worshipBackups.length > 0 ? worshipBackups : (genericBackups.length > 0 ? genericBackups : [])
    );

    mainBodyHTML = `
      <div style="display: flex; gap: 20px; margin-bottom: 24px; align-items: stretch; break-inside: avoid; page-break-inside: avoid;">
        <!-- Left Column: Praise -->
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-sizing: border-box;">
          <div>
            <h2 style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #1b75bc; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
              Praise Songs
            </h2>
            <ol style="list-style: none; padding: 0; margin: 0; text-align: left; display: flex; flex-direction: column; gap: 6px;">
              ${praiseItems}
            </ol>
          </div>
          <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid #e2e8f0; text-align: left; display: flex; flex-direction: column; gap: 14px;">
            <div>
              <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #1b75bc; margin-bottom: 6px;">
                Song Leader (Praise)
              </div>
              ${praiseLeaderLines}
            </div>
            <div>
              <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #1b75bc; margin-bottom: 6px;">
                Backup Singers (Praise)
              </div>
              ${praiseBackupLines}
            </div>
          </div>
        </div>

        <!-- Right Column: Worship -->
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-sizing: border-box;">
          <div>
            <h2 style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #1b75bc; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
              Worship Songs
            </h2>
            <ol style="list-style: none; padding: 0; margin: 0; text-align: left; display: flex; flex-direction: column; gap: 6px;">
              ${worshipItems}
            </ol>
          </div>
          <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid #e2e8f0; text-align: left; display: flex; flex-direction: column; gap: 14px;">
            <div>
              <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #1b75bc; margin-bottom: 6px;">
                Song Leader (Worship)
              </div>
              ${worshipLeaderLines}
            </div>
            <div>
              <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #1b75bc; margin-bottom: 6px;">
                Backup Singers (Worship)
              </div>
              ${worshipBackupLines}
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    // ONE SONG LEADER: Praise & Worship songs side by side, with shared Vocalists section below
    const singleLeaderNames = allLeaderNames.length > 0 ? allLeaderNames : [];
    const leaderLines = renderVerticalMemberList(singleLeaderNames);

    const allBackupNames = [...genericBackups, ...praiseBackups, ...worshipBackups].filter((v, i, a) => a.indexOf(v) === i);
    const backupLines = renderVerticalMemberList(allBackupNames);

    mainBodyHTML = `
      <div style="display: flex; gap: 20px; margin-bottom: 20px; align-items: stretch; break-inside: avoid; page-break-inside: avoid;">
        <!-- Left Column: Praise Songs -->
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-sizing: border-box;">
          <h2 style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #1b75bc; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
            Praise Songs
          </h2>
          <ol style="list-style: none; padding: 0; margin: 0; text-align: left; display: flex; flex-direction: column; gap: 6px;">
            ${praiseItems}
          </ol>
        </div>

        <!-- Right Column: Worship Songs -->
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; box-sizing: border-box;">
          <h2 style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #1b75bc; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
            Worship Songs
          </h2>
          <ol style="list-style: none; padding: 0; margin: 0; text-align: left; display: flex; flex-direction: column; gap: 6px;">
            ${worshipItems}
          </ol>
        </div>
      </div>

      <!-- Single Vocalists Box -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; margin-bottom: 24px; box-sizing: border-box; text-align: left; break-inside: avoid; page-break-inside: avoid;">
        <div>
          <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #1b75bc; margin-bottom: 6px;">
            Song Leader
          </div>
          ${leaderLines}
        </div>
        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
          <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #1b75bc; margin-bottom: 6px;">
            Backup Singers
          </div>
          ${backupLines}
        </div>
      </div>
    `;
  }

  // Worship Team Assignments section
  let teamHTML = '';
  if (otherAssignments.length > 0) {
    const exportRoleKeywords = [
      'guitarist',
      'keyboardist',
      'bassist',
      'drummer',
      'audio',
      'tech',
      'sound',
      'lyricist'
    ];

    otherAssignments.sort((a, b) => {
      const rA = (a.role || '').toLowerCase().trim();
      const rB = (b.role || '').toLowerCase().trim();

      const getRank = (r: string) => {
        const idx = exportRoleKeywords.findIndex((kw) => r.includes(kw));
        return idx !== -1 ? idx : 999;
      };

      const rankA = getRank(rA);
      const rankB = getRank(rB);

      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return rA.localeCompare(rB);
    });

    const items = otherAssignments.map((assignment) => {
      const rawMembers = getAssignmentMembers(assignment);
      const memberNames = rawMembers
        .map((m) => (m.memberName || '').trim())
        .filter((n) => Boolean(n) && n !== 'Unassigned' && n !== '—' && n !== 'N/A');

      const membersLines = renderVerticalMemberList(memberNames);
      const roleDisplayName = formatRoleLabel(assignment.role);

      const notesHTML = assignment.notes ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 6px; text-align: left;">Note: ${escapeHtml(assignment.notes)}</div>` : '';

      return `
        <div style="text-align: left; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid;">
          <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #1b75bc; margin-bottom: 6px; text-align: left;">
            ${escapeHtml(roleDisplayName)}
          </div>
          ${membersLines}
          ${notesHTML}
        </div>
      `;
    }).join('');

    teamHTML = `
      <div style="break-inside: avoid; page-break-inside: avoid;">
        <h2 style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #1b75bc; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
          Worship Team
        </h2>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; text-align: left;">
          ${items}
        </div>
      </div>
    `;
  }

  const formattedDate = schedule.serviceDate
    ? formatDateDisplayManila(schedule.serviceDate, { month: 'long', day: 'numeric', year: 'numeric' })
    : 'N/A';

  container.innerHTML = `
    <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 32px 36px; background: #ffffff;">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 4px;">
          Word for the World Christian Fellowship &ndash; Santa Cruz
        </div>
        <h1 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; letter-spacing: -0.01em; text-transform: uppercase;">
          Worship Team Line-Up
        </h1>
        <div style="font-size: 13.5px; font-weight: 600; color: #334155;">
          ${escapeHtml((schedule.serviceType || 'Sunday Service').toUpperCase())} &nbsp;&bull;&nbsp; ${escapeHtml(formattedDate.toUpperCase())}
        </div>
      </div>

      <!-- Content -->
      ${mainBodyHTML}
      ${teamHTML}
    </div>
  `;

  return container;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function renderCanvas(schedule: Schedule): Promise<HTMLCanvasElement> {
  const element = createExportElement(schedule);
  document.body.appendChild(element);

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    const canvas = await html2canvas(element, {
      scale: 3, // High resolution for mobile sharing & printing
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    return canvas;
  } finally {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }
}

/**
 * Generates dynamic filename based on service type and scheduled date (MM-DD-YYYY).
 */
export function getExportFilename(schedule: Schedule, extension: 'pdf' | 'png'): string {
  const serviceType = (schedule.serviceType || 'Sunday Service').trim();
  const serviceDate = schedule.serviceDate || '';

  // Format date as MM-DD-YYYY
  let formattedDate = 'MM-DD-YYYY';
  if (serviceDate) {
    const parts = serviceDate.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      formattedDate = `${month}-${day}-${year}`;
    }
  }

  let prefix = '';
  if (serviceType === 'Sunday Service') {
    prefix = 'Sunday_Service_Line-up';
  } else if (serviceType === 'Midweek Prayer Service') {
    prefix = 'Midweek_Prayer_Service_Line-up';
  } else if (serviceType === 'Youth Fellowship' || serviceType === 'Youth Service') {
    prefix = 'Youth_Fellowship';
  } else if (serviceType === 'Worship Event' || serviceType === 'Special Worship Event') {
    prefix = 'Worship_Event';
  } else {
    // Fallback: replace spaces with underscores
    prefix = serviceType.replace(/\s+/g, '_');
  }

  return `${prefix}_(${formattedDate}).${extension}`;
}

/**
 * Export lineup as PNG image cropped dynamically to visible content.
 */
export async function exportLineupAsPNG(schedule: Schedule): Promise<void> {
  const canvas = await renderCanvas(schedule);
  const dataUrl = canvas.toDataURL('image/png');

  const link = document.createElement('a');
  link.download = getExportFilename(schedule, 'png');
  link.href = dataUrl;
  link.click();
}

/**
 * Export lineup as PDF document formatted for standard A4 printable layout.
 * Uses smart whitespace canvas slicing to prevent text line splitting across pages.
 */
export async function exportLineupAsPDF(schedule: Schedule): Promise<void> {
  const canvas = await renderCanvas(schedule);

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

  const margin = 10; // 10mm margins
  const printableWidth = pdfWidth - margin * 2; // 190mm
  const printableHeight = pdfHeight - margin * 2; // 277mm

  // Convert printable width to canvas pixels scale factor
  const scale = printableWidth / canvas.width; // mm per canvas pixel
  const maxPageCanvasHeight = Math.floor(printableHeight / scale);

  const canvasWidth = canvas.width;
  const totalCanvasHeight = canvas.height;

  if (totalCanvasHeight <= maxPageCanvasHeight) {
    // Fits on a single A4 page
    const imgData = canvas.toDataURL('image/png');
    const imgHeight = totalCanvasHeight * scale;
    pdf.addImage(imgData, 'PNG', margin, margin, printableWidth, imgHeight);
  } else {
    // Multi-page PDF: slice canvas cleanly at white space boundaries
    const ctx = canvas.getContext('2d');
    let currentY = 0;
    let pageIndex = 0;

    while (currentY < totalCanvasHeight) {
      const remainingHeight = totalCanvasHeight - currentY;
      let sliceHeight = Math.min(maxPageCanvasHeight, remainingHeight);

      if (remainingHeight > maxPageCanvasHeight) {
        // Find a safe cut point by searching upward for a white pixel row
        let bestCutY = currentY + sliceHeight;
        if (ctx) {
          const searchStart = currentY + sliceHeight;
          const searchEnd = Math.max(currentY + Math.floor(maxPageCanvasHeight * 0.6), currentY + sliceHeight - 150);

          for (let y = searchStart; y >= searchEnd; y--) {
            const rowData = ctx.getImageData(0, y, canvasWidth, 1).data;
            let isWhiteRow = true;
            for (let x = 0; x < rowData.length; x += 16) {
              const r = rowData[x];
              const g = rowData[x + 1];
              const b = rowData[x + 2];
              const a = rowData[x + 3];
              if (a > 10 && (r < 245 || g < 245 || b < 245)) {
                isWhiteRow = false;
                break;
              }
            }
            if (isWhiteRow) {
              bestCutY = y;
              break;
            }
          }
        }
        sliceHeight = bestCutY - currentY;
      }

      // Render page slice onto temporary canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasWidth;
      tempCanvas.height = sliceHeight;
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, canvasWidth, sliceHeight);
        tempCtx.drawImage(
          canvas,
          0, currentY, canvasWidth, sliceHeight,
          0, 0, canvasWidth, sliceHeight
        );
      }

      const sliceDataUrl = tempCanvas.toDataURL('image/png');
      const sliceImgHeight = sliceHeight * scale;

      if (pageIndex > 0) {
        pdf.addPage('a4', 'portrait');
      }

      pdf.addImage(sliceDataUrl, 'PNG', margin, margin, printableWidth, sliceImgHeight);

      currentY += sliceHeight;
      pageIndex++;
    }
  }

  pdf.save(getExportFilename(schedule, 'pdf'));
}

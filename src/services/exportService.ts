import { Schedule, MinistryAssignment, getAssignmentMembers, Song } from '../types';
import { formatDateDisplayManila } from '../utils/dateUtils';
import { resolveScheduleSongTitles, resolveSlotSong } from '../utils/songResolveUtils';
import { resolveTransitionNote } from '../utils/songReferenceUtils';
import { isNoServiceSchedule } from '../utils/scheduleUtils';
import { SongService } from './songService';

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
function createExportElement(schedule: Schedule, allSongs: Song[] = []): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-wwcf-export-surface', 'true');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a'; // slate-900
  container.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  container.style.padding = '32px 36px';
  container.style.boxSizing = 'border-box';

  const formattedDate = schedule.serviceDate
    ? formatDateDisplayManila(schedule.serviceDate, { month: 'long', day: 'numeric', year: 'numeric' })
    : 'N/A';

  if (isNoServiceSchedule(schedule)) {
    const reasonText = schedule.noServiceReason?.trim() || '';
    const notesHTML = schedule.notes && schedule.notes.trim()
      ? `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-top: 18px; text-align: left; box-sizing: border-box;">
          <h2 style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #1b75bc; margin: 0 0 6px 0; padding-bottom: 4px; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
            Service Notes & Instructions
          </h2>
          <div style="font-size: 12.5px; font-weight: 500; color: #334155; line-height: 1.55; white-space: pre-wrap;">${escapeHtml(schedule.notes.trim())}</div>
        </div>
      `
      : '';

    container.innerHTML = `
      <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 32px 36px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 4px;">
            Word for the World Christian Fellowship &ndash; Santa Cruz
          </div>
          <h1 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; letter-spacing: -0.01em; text-transform: uppercase;">
            Worship Service Notice
          </h1>
          <div style="font-size: 13.5px; font-weight: 600; color: #334155;">
            ${escapeHtml((schedule.serviceType || 'Sunday Service').toUpperCase())} &nbsp;&bull;&nbsp; ${escapeHtml(formattedDate.toUpperCase())}
          </div>
        </div>

        <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 24px 22px; text-align: center;">
          <div style="display: inline-block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #be123c; background: #ffe4e6; border: 1px solid #fda4af; border-radius: 6px; padding: 4px 10px; margin-bottom: 10px;">
            NO SERVICE SCHEDULED
          </div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
            No worship service will be held on this date.
          </div>
          ${reasonText ? `<div style="font-size: 13.5px; font-weight: 500; color: #334155; line-height: 1.5;">Reason: ${escapeHtml(reasonText)}</div>` : ''}
        </div>
        ${notesHTML}
      </div>
    `;
    return container;
  }

  const resolved = resolveScheduleSongTitles(schedule, allSongs);
  const praiseEntries = (resolved.praiseSongs || [])
    .map((s, idx) => ({ title: s.trim(), key: schedule.praiseSongKeys?.[idx] }))
    .filter((entry) => Boolean(entry.title));
  const worshipEntries = (resolved.worshipSongs || [])
    .map((s, idx) => ({ title: s.trim(), key: schedule.worshipSongKeys?.[idx] }))
    .filter((entry) => Boolean(entry.title));
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

  const praiseItems = praiseEntries.length > 0
    ? praiseEntries.map((entry, i) => {
        const keyTag = formatSongKey(entry.key);
        return `
          <li style="font-size: 13.5px; font-weight: 500; color: #1e293b; line-height: 1.5; word-break: break-word; overflow-wrap: anywhere; display: flex; align-items: baseline; flex-wrap: wrap;">
            <span><strong style="color: #1b75bc; margin-right: 6px;">${i + 1}.</strong>${escapeHtml(entry.title)}</span>
            ${keyTag}
          </li>
        `;
      }).join('')
    : '<div style="font-size: 13px; color: #94a3b8; font-style: italic;">N/A</div>';

  const worshipItems = worshipEntries.length > 0
    ? worshipEntries.map((entry, i) => {
        const keyTag = formatSongKey(entry.key);
        return `
          <li style="font-size: 13.5px; font-weight: 500; color: #1e293b; line-height: 1.5; word-break: break-word; overflow-wrap: anywhere; display: flex; align-items: baseline; flex-wrap: wrap;">
            <span><strong style="color: #1b75bc; margin-right: 6px;">${i + 1}.</strong>${escapeHtml(entry.title)}</span>
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

  let notesHTML = '';
  if (schedule.notes && schedule.notes.trim()) {
    notesHTML = `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-top: 18px; text-align: left; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid;">
        <h2 style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #1b75bc; margin: 0 0 6px 0; padding-bottom: 4px; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
          Service Notes & Instructions
        </h2>
        <div style="font-size: 12.5px; font-weight: 500; color: #334155; line-height: 1.55; white-space: pre-wrap;">${escapeHtml(schedule.notes.trim())}</div>
      </div>
    `;
  }

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
      ${notesHTML}
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

async function renderCanvas(schedule: Schedule, allSongs?: Song[]): Promise<HTMLCanvasElement> {
  const songsToUse = allSongs ?? SongService.getSongsSync();
  const element = createExportElement(schedule, songsToUse);
  document.body.appendChild(element);

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    const html2canvasModule = await import('html2canvas');
    const html2canvas = (html2canvasModule as any).default || html2canvasModule;

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
    prefix = 'Youth_Fellowship_Line-up';
  } else if (serviceType === 'Worship Event' || serviceType === 'Special Worship Event') {
    prefix = 'Worship_Event_Line-up';
  } else {
    // Fallback: replace spaces with underscores and ensure Line-up suffix
    const cleanType = serviceType.replace(/\s+/g, '_');
    prefix = cleanType.endsWith('_Line-up') ? cleanType : `${cleanType}_Line-up`;
  }

  return `${prefix}_(${formattedDate}).${extension}`;
}

/**
 * Export lineup as PNG image cropped dynamically to visible content.
 */
export async function exportLineupAsPNG(schedule: Schedule, allSongs?: Song[]): Promise<void> {
  const canvas = await renderCanvas(schedule, allSongs);
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
export async function exportLineupAsPDF(schedule: Schedule, allSongs?: Song[]): Promise<void> {
  const canvas = await renderCanvas(schedule, allSongs);

  const jsPdfModule = await import('jspdf');
  const jsPDF = (jsPdfModule as any).default || jsPdfModule.jsPDF;

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

/**
 * Creates offscreen DOM element formatted specifically as a print-ready A4 Rehearsal Sheet.
 */
function createRehearsalSheetElement(schedule: Schedule, allSongs: Song[]): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-wwcf-export-surface', 'true');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  container.style.padding = '36px 40px';
  container.style.boxSizing = 'border-box';

  const resolved = resolveScheduleSongTitles(schedule, allSongs);
  const praiseKeys = schedule.praiseSongKeys || [];
  const worshipKeys = schedule.worshipSongKeys || [];
  const praiseIds = resolved.praiseSongIds || [];
  const worshipIds = resolved.worshipSongIds || [];
  const transitions = schedule.transitionNotes || {};

  const praiseEntries = (resolved.praiseSongs || [])
    .map((title, idx) => ({
      title: title.trim(),
      songId: praiseIds[idx],
      perfKey: (praiseKeys[idx] || '').trim()
    }))
    .filter((e) => Boolean(e.title));

  const worshipEntries = (resolved.worshipSongs || [])
    .map((title, idx) => ({
      title: title.trim(),
      songId: worshipIds[idx],
      perfKey: (worshipKeys[idx] || '').trim()
    }))
    .filter((e) => Boolean(e.title));

  const formattedDate = schedule.serviceDate
    ? formatDateDisplayManila(schedule.serviceDate, { month: 'long', day: 'numeric', year: 'numeric', weekday: 'long' })
    : 'Date Not Set';

  if (isNoServiceSchedule(schedule)) {
    const reasonText = schedule.noServiceReason?.trim() || '';
    const notesHtml = schedule.notes && schedule.notes.trim() ? `
      <div style="margin-top: 18px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #fffbeb;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #b45309; margin-bottom: 4px;">Service Notes & Pastoral Cues</div>
        <div style="font-size: 11px; color: #78350f; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(schedule.notes.trim())}</div>
      </div>
    ` : '';

    container.innerHTML = `
      <div>
        <div style="border-bottom: 2px solid #1b75bc; padding-bottom: 16px; margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #1b75bc; margin-bottom: 4px;">Word for the World Christian Fellowship • Santa Cruz</div>
          <div style="display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
              <h1 style="font-size: 24px; font-weight: 900; margin: 0; color: #0f172a; letter-spacing: -0.02em;">Service Notice — No Service</h1>
              <div style="font-size: 13px; font-weight: 600; color: #475569; margin-top: 4px;">${escapeHtml(schedule.serviceType)} • ${escapeHtml(formattedDate)}</div>
            </div>
            <div style="text-align: right; font-size: 11px; color: #94a3b8;">
              Generated on ${formatDateDisplayManila(new Date().toISOString(), { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>
        <div style="padding: 20px; border: 1px solid #fecdd3; border-radius: 8px; background-color: #fff1f2;">
          <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #be123c; margin-bottom: 6px;">No Service Scheduled</div>
          <div style="font-size: 13px; color: #334155; font-weight: 500;">This date is marked as No Service. No songs or team assignments are scheduled.</div>
          ${reasonText ? `<div style="margin-top: 8px; font-size: 12.5px; color: #0f172a;"><strong>Reason:</strong> ${escapeHtml(reasonText)}</div>` : ''}
        </div>
        ${notesHtml}
      </div>
    `;
    return container;
  }

  // Build Song Rows using strictly ID-authoritative resolution and explicit performed keys
  const praiseRowsHtml = praiseEntries.map((entry, idx) => {
    const song = resolveSlotSong(entry.title, entry.songId, allSongs).song;
    const keyDisplay = entry.perfKey || 'Performed key not set';
    const keyColor = entry.perfKey ? '#1b75bc' : '#64748b';
    const origKey = song?.originalKey || song?.key || '—';
    const bpm = song?.bpm ? `${song.bpm} BPM` : '—';
    const duration = song?.duration || '—';
    const nextEntry = idx < praiseEntries.length - 1 ? praiseEntries[idx + 1] : undefined;
    const tCue = nextEntry
      ? resolveTransitionNote(transitions, 'praise', idx, idx + 1, entry.title, nextEntry.title, entry.songId, nextEntry.songId)
      : (worshipEntries.length > 0 ? resolveTransitionNote(transitions, 'cross_section', 0, 0) : '');

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px;">
        <td style="padding: 8px 10px; font-weight: 700; color: #d97706;">Praise ${idx + 1}</td>
        <td style="padding: 8px 10px; font-weight: 700; color: #0f172a;">${escapeHtml(entry.title)}</td>
        <td style="padding: 8px 10px; font-weight: ${entry.perfKey ? '700' : '500'}; color: ${keyColor};">${escapeHtml(keyDisplay)}</td>
        <td style="padding: 8px 10px; color: #64748b;">${escapeHtml(origKey)}</td>
        <td style="padding: 8px 10px; color: #334155;">${escapeHtml(bpm)}</td>
        <td style="padding: 8px 10px; color: #64748b;">${escapeHtml(duration)}</td>
        <td style="padding: 8px 10px; color: #0f172a; font-style: italic;">${tCue ? escapeHtml(tCue) : '—'}</td>
      </tr>
    `;
  }).join('');

  const worshipRowsHtml = worshipEntries.map((entry, idx) => {
    const song = resolveSlotSong(entry.title, entry.songId, allSongs).song;
    const keyDisplay = entry.perfKey || 'Performed key not set';
    const keyColor = entry.perfKey ? '#1b75bc' : '#64748b';
    const origKey = song?.originalKey || song?.key || '—';
    const bpm = song?.bpm ? `${song.bpm} BPM` : '—';
    const duration = song?.duration || '—';
    const nextEntry = idx < worshipEntries.length - 1 ? worshipEntries[idx + 1] : undefined;
    const tCue = nextEntry
      ? resolveTransitionNote(transitions, 'worship', idx, idx + 1, entry.title, nextEntry.title, entry.songId, nextEntry.songId)
      : '';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px;">
        <td style="padding: 8px 10px; font-weight: 700; color: #6366f1;">Worship ${idx + 1}</td>
        <td style="padding: 8px 10px; font-weight: 700; color: #0f172a;">${escapeHtml(entry.title)}</td>
        <td style="padding: 8px 10px; font-weight: ${entry.perfKey ? '700' : '500'}; color: ${keyColor};">${escapeHtml(keyDisplay)}</td>
        <td style="padding: 8px 10px; color: #64748b;">${escapeHtml(origKey)}</td>
        <td style="padding: 8px 10px; color: #334155;">${escapeHtml(bpm)}</td>
        <td style="padding: 8px 10px; color: #64748b;">${escapeHtml(duration)}</td>
        <td style="padding: 8px 10px; color: #0f172a; font-style: italic;">${tCue ? escapeHtml(tCue) : '—'}</td>
      </tr>
    `;
  }).join('');

  // Build Roster Rows
  const assignmentsHtml = (schedule.ministryAssignments || []).map((a) => {
    const membersList = getAssignmentMembers(a);
    const names = membersList
      .map((m) => m.memberName)
      .filter((n) => Boolean(n) && n !== 'Unassigned' && n !== '—' && n !== 'N/A')
      .join(', ') || '—';

    return `
      <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #e2e8f0; font-size: 12px;">
        <span style="font-weight: 700; color: #334155; width: 40%;">${escapeHtml(a.role)}</span>
        <span style="color: #0f172a; font-weight: 600; width: 35%;">${escapeHtml(names)}</span>
        <span style="color: #64748b; font-style: italic; width: 25%; text-align: right;">${a.notes ? escapeHtml(a.notes) : ''}</span>
      </div>
    `;
  }).join('');

  // Checklist Block
  const checklist = schedule.rehearsalChecklist;
  const checklistHtml = checklist ? `
    <div style="margin-top: 24px; padding: 14px; border: 1px solid #cbd5e1; border-radius: 8px; background-color: #f8fafc;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-bottom: 8px;">Rehearsal Readiness Checklist</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; color: #334155;">
        <div>${checklist.songSelectionFinalized ? '☑' : '☐'} Song Selection Finalized</div>
        <div>${checklist.performedKeysChecked ? '☑' : '☐'} Performed Keys Checked</div>
        <div>${checklist.lyricsReviewed ? '☑' : '☐'} Lyrics Reviewed</div>
        <div>${checklist.referencesChecked ? '☑' : '☐'} Audio References Checked</div>
        <div>${checklist.teamAssignmentsFinalized ? '☑' : '☐'} Team Assignments Finalized</div>
        <div>${checklist.transitionsPrepared ? '☑' : '☐'} Modulation / Transitions Prepared</div>
      </div>
    </div>
  ` : '';

  // Service Notes Block
  const notesHtml = schedule.notes && schedule.notes.trim() ? `
    <div style="margin-top: 18px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #fffbeb;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #b45309; margin-bottom: 4px;">Service Notes & Pastoral Cues</div>
      <div style="font-size: 11px; color: #78350f; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(schedule.notes.trim())}</div>
    </div>
  ` : '';

  container.innerHTML = `
    <div>
      <!-- Header -->
      <div style="border-bottom: 2px solid #1b75bc; padding-bottom: 16px; margin-bottom: 20px;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #1b75bc; margin-bottom: 4px;">Word for the World Christian Fellowship • Santa Cruz</div>
        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <h1 style="font-size: 24px; font-weight: 900; margin: 0; color: #0f172a; letter-spacing: -0.02em;">Rehearsal & Ministry Run Sheet</h1>
            <div style="font-size: 13px; font-weight: 600; color: #475569; margin-top: 4px;">${escapeHtml(schedule.serviceType)} • ${escapeHtml(formattedDate)}</div>
          </div>
          <div style="text-align: right; font-size: 11px; color: #94a3b8;">
            Generated on ${formatDateDisplayManila(new Date().toISOString(), { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      <!-- Songs Table -->
      <div style="margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; margin-bottom: 8px;">Order of Worship & Music Details</div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #64748b; background-color: #f1f5f9;">
              <th style="padding: 6px 10px;">Part</th>
              <th style="padding: 6px 10px;">Song Title</th>
              <th style="padding: 6px 10px;">Key</th>
              <th style="padding: 6px 10px;">Orig</th>
              <th style="padding: 6px 10px;">Tempo</th>
              <th style="padding: 6px 10px;">Duration</th>
              <th style="padding: 6px 10px;">Transition Cue</th>
            </tr>
          </thead>
          <tbody>
            ${praiseRowsHtml}
            ${worshipRowsHtml}
          </tbody>
        </table>
      </div>

      <!-- Ministry Roster -->
      <div style="margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; margin-bottom: 6px;">Ministry Team Roster</div>
        <div style="border-top: 1px solid #cbd5e1;">
          ${assignmentsHtml}
        </div>
      </div>

      ${notesHtml}
      ${checklistHtml}
    </div>
  `;

  return container;
}

/**
 * Renders the rehearsal sheet offscreen DOM element into a canvas.
 */
async function renderRehearsalSheetCanvas(schedule: Schedule, allSongs: Song[]): Promise<HTMLCanvasElement> {
  const element = createRehearsalSheetElement(schedule, allSongs);
  document.body.appendChild(element);

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    const html2canvasModule = await import('html2canvas');
    const html2canvas = (html2canvasModule as any).default || html2canvasModule;

    const canvas = await html2canvas(element, {
      scale: 3,
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
 * Export dedicated print-ready A4 Rehearsal Sheet PDF with songs, keys, transitions, and team roster.
 */
export async function exportRehearsalSheetAsPDF(schedule: Schedule, allSongs: Song[]): Promise<void> {
  const canvas = await renderRehearsalSheetCanvas(schedule, allSongs);

  const jsPdfModule = await import('jspdf');
  const jsPDF = (jsPdfModule as any).default || jsPdfModule.jsPDF;

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const margin = 10;
  const printableWidth = pdfWidth - margin * 2;
  const printableHeight = pdfHeight - margin * 2;

  const scale = printableWidth / canvas.width;
  const maxPageCanvasHeight = Math.floor(printableHeight / scale);

  const canvasWidth = canvas.width;
  const totalCanvasHeight = canvas.height;

  if (totalCanvasHeight <= maxPageCanvasHeight) {
    const imgData = canvas.toDataURL('image/png');
    const imgHeight = totalCanvasHeight * scale;
    pdf.addImage(imgData, 'PNG', margin, margin, printableWidth, imgHeight);
  } else {
    let currentY = 0;
    let pageIndex = 0;

    while (currentY < totalCanvasHeight) {
      const remainingHeight = totalCanvasHeight - currentY;
      let sliceHeight = Math.min(maxPageCanvasHeight, remainingHeight);

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

  const serviceType = (schedule.serviceType || 'Sunday Service').replace(/\s+/g, '_');
  const serviceDate = (schedule.serviceDate || '').replace(/-/g, '_');
  pdf.save(`WWCF_Rehearsal_Sheet_${serviceType}_${serviceDate}.pdf`);
}


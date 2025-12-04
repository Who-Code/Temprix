const { invoke } = window.__TAURI__.core;

const calendarWrapper = document.getElementById('calendar');
const eventsLayer = document.getElementById('events-layer');
const calendarBackground = document.getElementById('calendar-background');
const eventsColumn = document.querySelector('.events-column');
const timeColumn = document.getElementById('time-column');
const reportDate = document.getElementById('report-date');
const emptyState = document.getElementById('empty-state');
const activityList = document.getElementById('activity-list');
const activityCards = document.getElementById('activity-cards');
const eventTooltip = document.getElementById('event-tooltip');

const MINIMUM_BLOCK_MINUTES = 5;
const MINUTE_HEIGHT = 3.2; // pixels per minute (aligns 15-minute grid to 48px)
const MIN_BLOCK_HEIGHT = 100; // px minimum height for event blocks

document.documentElement.style.setProperty('--minute-height', String(MINUTE_HEIGHT));

let activeTooltipTarget = null;

function parseDateTime(str) {
  const [datePart, timePart] = str.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = (timePart || '').split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, second, 0);
}

function minutesSinceMidnight(date) {
  return (
    date.getHours() * 60 +
    date.getMinutes() +
    date.getSeconds() / 60 +
    date.getMilliseconds() / 60000
  );
}

function formatTimeRange(start, end) {
  const opts = { hour: '2-digit', minute: '2-digit' };
  return `${start.toLocaleTimeString([], opts)} – ${end.toLocaleTimeString([], opts)}`;
}

function formatDuration(start, end) {
  const diffMs = Math.max(end.getTime() - start.getTime(), 0);
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length ? parts.join(' ') : '<1m';
}

function deriveActivityInitial(activity) {
  const candidates = [
    activity.application_name,
    activity.application_window_title,
    activity.window_title,
    activity.domain,
    activity.type,
  ];

  const label = candidates.find((value) => typeof value === 'string' && value.trim().length);
  if (!label) {
    return '⋯';
  }

  const [firstChar] = Array.from(label.trim());
  return firstChar ? firstChar.toUpperCase() : '⋯';
}

function updateTooltipPosition(coords) {
  if (!eventTooltip || !activeTooltipTarget || !coords) {
    return;
  }

  const margin = 16;
  const tooltipRect = eventTooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let x = coords.x + margin;
  let y = coords.y + margin;

  if (x + tooltipRect.width > viewportWidth - margin) {
    x = viewportWidth - tooltipRect.width - margin;
  }
  if (y + tooltipRect.height > viewportHeight - margin) {
    y = viewportHeight - tooltipRect.height - margin;
  }

  eventTooltip.style.left = `${Math.max(margin, x)}px`;
  eventTooltip.style.top = `${Math.max(margin, y)}px`;
  eventTooltip.style.transform = 'translate3d(0, 0, 0)';
}

function displayTooltip(target, coords) {
  if (!eventTooltip || !target?.dataset?.tooltip) {
    return;
  }

  activeTooltipTarget = target;
  eventTooltip.textContent = target.dataset.tooltip;
  eventTooltip.classList.add('visible');
  eventTooltip.setAttribute('aria-hidden', 'false');

  const fallback = () => {
    const rect = target.getBoundingClientRect();
    return { x: rect.right, y: rect.top + rect.height / 2 };
  };

  const coordinates = coords || fallback();
  requestAnimationFrame(() => updateTooltipPosition(coordinates));
}

function hideTooltip() {
  if (!eventTooltip) {
    return;
  }
  eventTooltip.classList.remove('visible');
  eventTooltip.setAttribute('aria-hidden', 'true');
  eventTooltip.style.left = '-9999px';
  eventTooltip.style.top = '-9999px';
  eventTooltip.style.transform = 'translate(-9999px, -9999px)';
  activeTooltipTarget = null;
}

function bindEventTooltipInteractions(block) {
  if (!eventTooltip) {
    return;
  }

  block.addEventListener('pointerenter', (event) => {
    displayTooltip(block, { x: event.clientX, y: event.clientY });
  });

  block.addEventListener('pointermove', (event) => {
    if (activeTooltipTarget === block) {
      updateTooltipPosition({ x: event.clientX, y: event.clientY });
    }
  });

  block.addEventListener('pointerleave', hideTooltip);
  block.addEventListener('focus', () => displayTooltip(block));
  block.addEventListener('blur', hideTooltip);
}

function buildTimeColumn(startMinute, endMinute) {
  timeColumn.innerHTML = '';
  const increment = 15; // minutes
  const startTick = Math.floor(startMinute / increment) * increment;
  const endTick = Math.ceil(endMinute / increment) * increment;

  for (let minute = startTick; minute <= endTick; minute += increment) {
    const slot = document.createElement('div');
    slot.className = 'time-slot';
    const span = document.createElement('span');
    const normalized = ((minute / 60) % 24 + 24) % 24;
    const displayHour = Math.floor(normalized);
    const displayMinute = Math.round((normalized - displayHour) * 60);
    span.textContent = `${String(displayHour).padStart(2, '0')}:${String(displayMinute).padStart(2, '0')}`;
    slot.appendChild(span);
    timeColumn.appendChild(slot);
  }
}

function createEventBlock(activity, startMinute, chartStartMinute) {
  const block = document.createElement('div');
  const isIssue = Boolean(activity.related_issue_id && activity.related_issue_id.trim());
  block.className = `event-block ${isIssue ? 'issue' : 'general'}`;
  block.tabIndex = 0;

  const fromDate = parseDateTime(activity.from);
  const toDate = parseDateTime(activity.to);
  const topOffset = (startMinute - chartStartMinute) * MINUTE_HEIGHT;
  const durationMinutes = Math.max((toDate.getTime() - fromDate.getTime()) / 60000, MINIMUM_BLOCK_MINUTES);
  const height = Math.max(durationMinutes * MINUTE_HEIGHT, MIN_BLOCK_HEIGHT);

  block.style.top = `${topOffset}px`;
  block.style.height = `${height}px`;

  const marker = document.createElement('span');
  marker.className = 'event-marker';
  marker.textContent = deriveActivityInitial(activity);

  const title = document.createElement('p');
  title.className = 'event-title';
  title.textContent = activity.application_name || 'Application';

  const windowTitleText = activity.application_window_title || activity.window_title;
  let windowTitle;
  if (windowTitleText) {
    windowTitle = document.createElement('p');
    windowTitle.className = 'event-window';
    windowTitle.textContent = windowTitleText;
  }

  const content = document.createElement('div');
  content.className = 'event-content';
  const header = document.createElement('div');
  header.className = 'event-header';

  const primary = document.createElement('div');
  primary.className = 'event-primary';
  primary.appendChild(title);
  if (windowTitle) {
    primary.appendChild(windowTitle);
  }

  const meta = document.createElement('div');
  meta.className = 'event-meta';

  const timeRange = document.createElement('span');
  timeRange.className = 'event-time-range';
  timeRange.textContent = formatTimeRange(fromDate, toDate);
  meta.appendChild(timeRange);

  const ticket = document.createElement('span');
  ticket.className = `event-ticket ${isIssue ? 'issue' : 'general'}`;
  ticket.textContent = isIssue ? `Ticket #${activity.related_issue_id}` : 'General Activity';
  meta.appendChild(ticket);

  const duration = document.createElement('span');
  duration.className = 'event-duration';
  duration.textContent = formatDuration(fromDate, toDate);
  meta.appendChild(duration);

  header.append(primary, meta);
  content.appendChild(header);

  const tooltipTicket = isIssue ? `Ticket #${activity.related_issue_id}` : 'No ticket detected';
  const tooltip = `${formatTimeRange(fromDate, toDate)} • ${tooltipTicket}`;
  block.dataset.tooltip = tooltip;
  block.setAttribute('aria-label', tooltip);

  block.append(marker, content);
  bindEventTooltipInteractions(block);

  return block;
}

function createActivityCard(activity) {
  const card = document.createElement('div');
  const isIssue = Boolean(activity.related_issue_id && activity.related_issue_id.trim());
  card.className = `activity-card ${isIssue ? 'issue' : 'general'}`;

  const fromDate = parseDateTime(activity.from);
  const toDate = parseDateTime(activity.to);

  const header = document.createElement('div');
  header.className = 'card-header';

  const icon = document.createElement('span');
  icon.className = `card-icon ${isIssue ? 'issue' : 'general'}`;
  icon.textContent = deriveActivityInitial(activity);

  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = activity.application_name || 'Application';

  const windowTitleText = activity.application_window_title || activity.window_title;
  let windowInfo;
  if (windowTitleText) {
    windowInfo = document.createElement('p');
    windowInfo.className = 'card-window';
    windowInfo.textContent = windowTitleText;
  }

  const time = document.createElement('p');
  time.className = 'card-time';
  time.textContent = `${formatTimeRange(fromDate, toDate)} • ${formatDuration(fromDate, toDate)}`;

  const info = document.createElement('div');
  info.className = 'card-info';
  info.append(title);
  if (windowInfo) {
    info.append(windowInfo);
  }
  info.append(time);

  header.append(icon, info);

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  meta.textContent = isIssue ? `Ticket #${activity.related_issue_id}` : 'No ticket detected';

  card.append(header, meta);
  return card;
}

async function loadReport() {
  try {
    const activities = await invoke('get_todays_activities');
    const parsed = activities
      .map((activity) => ({
        ...activity,
        fromDate: parseDateTime(activity.from),
        toDate: parseDateTime(activity.to),
      }))
      .filter((activity) => Number.isFinite(activity.fromDate.getTime()) && Number.isFinite(activity.toDate.getTime()))
      .sort((a, b) => a.fromDate.getTime() - b.fromDate.getTime());

    const today = new Date();
    reportDate.textContent = today.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    if (!parsed.length) {
      emptyState.classList.remove('hidden');
      calendarWrapper.classList.add('hidden');
      activityList.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    calendarWrapper.classList.remove('hidden');
    activityList.classList.remove('hidden');

    const startMinute = Math.min(...parsed.map((a) => minutesSinceMidnight(a.fromDate)));
    const endMinute = Math.max(...parsed.map((a) => minutesSinceMidnight(a.toDate)));
    const padding = 30; // minutes
    const chartStartMinute = Math.max(0, startMinute - padding);
    const chartEndMinute = Math.min(24 * 60, endMinute + padding);
    const totalMinutes = Math.max(chartEndMinute - chartStartMinute, 60);
    const estimatedMinimum = parsed.length * (MIN_BLOCK_HEIGHT + 24);
    const calendarHeight = Math.max(totalMinutes * MINUTE_HEIGHT, estimatedMinimum, MIN_BLOCK_HEIGHT, 600);

    eventsLayer.style.height = `${calendarHeight}px`;
    calendarBackground.style.height = `${calendarHeight}px`;
    if (eventsColumn) {
      eventsColumn.style.height = `${calendarHeight}px`;
    }
    timeColumn.style.height = `${calendarHeight}px`;

    buildTimeColumn(chartStartMinute, chartEndMinute);
    hideTooltip();
    eventsLayer.innerHTML = '';

    parsed.forEach((activity) => {
      const fromMinute = minutesSinceMidnight(activity.fromDate);
      const block = createEventBlock(activity, fromMinute, chartStartMinute);
      eventsLayer.appendChild(block);
    });

    activityCards.innerHTML = '';
    parsed.forEach((activity) => {
      activityCards.appendChild(createActivityCard(activity));
    });
  } catch (err) {
    console.error('Failed to load report', err);
    reportDate.textContent = 'Unable to load activity report. See console for details.';
    emptyState.classList.remove('hidden');
  }
}

const init = () => {
  loadReport();
  setInterval(() => {
    loadReport();
  }, 60 * 1000)
}

document.addEventListener('DOMContentLoaded', init);

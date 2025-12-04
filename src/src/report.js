const { invoke } = window.__TAURI__.core;

const calendarWrapper = document.getElementById('calendar');
const eventsLayer = document.getElementById('events-layer');
const calendarBackground = document.getElementById('calendar-background');
const timeColumn = document.getElementById('time-column');
const reportDate = document.getElementById('report-date');
const emptyState = document.getElementById('empty-state');
const activityList = document.getElementById('activity-list');
const activityCards = document.getElementById('activity-cards');

const MINIMUM_BLOCK_MINUTES = 5;
const MINUTE_HEIGHT = 1.5; // pixels per minute

function parseDateTime(str) {
  const [datePart, timePart] = str.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = (timePart || '').split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, second, 0);
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
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

function buildTimeColumn(startMinute, endMinute) {
  timeColumn.innerHTML = '';
  const startHour = Math.floor(startMinute / 60);
  const endHour = Math.ceil(endMinute / 60);

  for (let hour = startHour; hour <= endHour; hour += 1) {
    const slot = document.createElement('div');
    slot.className = 'time-slot';
    const span = document.createElement('span');
    const normalized = ((hour % 24) + 24) % 24;
    span.textContent = `${String(normalized).padStart(2, '0')}:00`;
    slot.appendChild(span);
    timeColumn.appendChild(slot);
  }
}

function createEventBlock(activity, startMinute, chartStartMinute) {
  const block = document.createElement('div');
  const isIssue = Boolean(activity.related_issue_id && activity.related_issue_id.trim());
  block.className = `event-block ${isIssue ? 'issue' : 'general'}`;

  const fromDate = parseDateTime(activity.from);
  const toDate = parseDateTime(activity.to);
  const topOffset = (startMinute - chartStartMinute) * MINUTE_HEIGHT;
  const durationMinutes = Math.max(minutesSinceMidnight(toDate) - minutesSinceMidnight(fromDate), MINIMUM_BLOCK_MINUTES);
  const height = Math.max(durationMinutes * MINUTE_HEIGHT, MINIMUM_BLOCK_MINUTES * MINUTE_HEIGHT);

  block.style.top = `${topOffset}px`;
  block.style.height = `${height}px`;

  const title = document.createElement('p');
  title.className = 'event-title';
  title.textContent = activity.application_name || 'Application';

  const time = document.createElement('p');
  time.className = 'event-time';
  time.textContent = formatTimeRange(fromDate, toDate);

  if (isIssue) {
    const id = document.createElement('p');
    id.className = 'event-id';
    id.textContent = `Ticket #${activity.related_issue_id}`;
    block.append(title, time, id);
  } else {
    block.append(title, time);
  }

  return block;
}

function createActivityCard(activity) {
  const card = document.createElement('div');
  const isIssue = Boolean(activity.related_issue_id && activity.related_issue_id.trim());
  card.className = `activity-card ${isIssue ? 'issue' : 'general'}`;

  const fromDate = parseDateTime(activity.from);
  const toDate = parseDateTime(activity.to);

  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = activity.application_name || 'Application';

  const time = document.createElement('p');
  time.className = 'card-time';
  time.textContent = `${formatTimeRange(fromDate, toDate)} • ${formatDuration(fromDate, toDate)}`;

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  meta.textContent = isIssue ? `Ticket #${activity.related_issue_id}` : 'No ticket detected';

  card.append(title, time, meta);
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
    const calendarHeight = Math.max(totalMinutes * MINUTE_HEIGHT, 600);

    eventsLayer.style.height = `${calendarHeight}px`;
    calendarBackground.style.height = `${calendarHeight}px`;

    buildTimeColumn(chartStartMinute, chartEndMinute);
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

document.addEventListener('DOMContentLoaded', loadReport);

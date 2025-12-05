<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { CalendarEvent, CalendarEventInterval } from 'vuetify/components';

interface ActivityItem {
  from: string;
  to: string;
  application_name: string;
  application_window_title: string;
  related_issue_id: string | null;
  category: string;
  issue_identified_by: string;
}

interface EventMeta extends ActivityItem {
  durationMinutes: number;
  durationLabel: string;
  avatarInitial: string;
  startLabel: string;
  endLabel: string;
  startDate: Date;
  endDate: Date;
}

const INTERVAL_MINUTES = 15;
const INTERVAL_HEIGHT = 60;
const DAY_INTERVAL_COUNT = (24 * 60) / INTERVAL_MINUTES;

const events = ref<CalendarEvent[]>([]);
const loading = ref(true);
const selectedDate = ref(new Date());
const errorMessage = ref<string | null>(null);

const normalizeDateInput = (value: string) => {
  if (!value) {
    return '';
  }
  return value.includes('T') ? value : value.replace(' ', 'T');
};

const safeDate = (value: string) => {
  const normalized = normalizeDateInput(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const fallbackInitial = (value: string | undefined | null) => {
  const initial = value?.trim().charAt(0) ?? '';
  return initial ? initial.toUpperCase() : '·';
};

const formatDuration = (minutes: number) => {
  const safeMinutes = Math.max(1, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remaining = safeMinutes % 60;

  if (hours > 0 && remaining > 0) {
    return `${hours}h ${remaining}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remaining}m`;
};

const formatTimeLabel = (date: Date | null) => {
  if (!date) {
    return '—';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const buildMeta = (activity: ActivityItem): EventMeta => {
  const start = safeDate(activity.from);
  const end = safeDate(activity.to) ?? start;

  const startMs = start?.getTime() ?? Date.now();
  const endMs = end?.getTime() ?? startMs + INTERVAL_MINUTES * 60_000;
  const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60_000));

  return {
    ...activity,
    durationMinutes,
    durationLabel: formatDuration(durationMinutes),
    avatarInitial: fallbackInitial(activity.application_name),
    startLabel: formatTimeLabel(start ?? new Date(startMs)),
    endLabel: formatTimeLabel(end ?? new Date(endMs)),
    startDate: start ?? new Date(startMs),
    endDate: end ?? new Date(endMs),
  };
};

const resolveMeta = (event: CalendarEvent) => event.data as EventMeta;

const getDayBounds = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const clampEventToDay = (meta: EventMeta, dayStart: Date, dayEnd: Date) => {
  const start = new Date(Math.max(meta.startDate.getTime(), dayStart.getTime()));
  const end = new Date(Math.min(meta.endDate.getTime(), dayEnd.getTime()));
  if (end.getTime() <= start.getTime()) {
    return null;
  }
  return { start, end } as const;
};

const fetchActivities = async () => {
  loading.value = true;
  errorMessage.value = null;
  try {
    const date_string = selectedDate.value.toISOString().split('T')[0];
    const data = await invoke<ActivityItem[]>('get_days_activities', { dateInput: date_string });
    const { start: dayStart, end: dayEnd } = getDayBounds(selectedDate.value);

    const mapped: CalendarEvent[] = [];
    data.forEach((activity) => {
      const meta = buildMeta(activity);
      const span = clampEventToDay(meta, dayStart, dayEnd);
      if (!span) {
        return;
      }
      const nameLayout = meta.application_name + ' ' + meta.application_window_title;
      mapped.push({
        name: nameLayout,
        category: meta.application_window_title,
        start: span.start,
        end: span.end,
        color: activity.related_issue_id ? '#ED6A5A' : '#7DA59E',
        timed: true,
        allDay: false,
        data: meta,
      } satisfies CalendarEvent);
    });

    events.value = mapped;
  } catch (error) {
    console.error('Failed to fetch activities', error);
    errorMessage.value = 'Unable to load activity data.';
  } finally {
    loading.value = false;
  }
};

const calendarTitle = computed(() => {
  return selectedDate.value.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

const formatTooltip = (interval: CalendarEventInterval) => {
  const meta = resolveMeta(interval.event);
  if (!meta) {
    return `${interval.start.toLocaleTimeString()} – ${interval.end.toLocaleTimeString()}`;
  }

  const lines = [
    `${meta.startLabel} – ${meta.endLabel}`,
    meta.application_name,
    meta.application_window_title,
    `Duration: ${meta.durationLabel}`,
  ];

  if (meta.related_issue_id) {
    lines.push(`Ticket: ${meta.related_issue_id}`);
  }

  return lines.filter(Boolean).join('\n');
};

const refresh = () => fetchActivities();

onMounted(async () => {
  await fetchActivities();
  setInterval(fetchActivities, 60_000);
});
</script>

<template>
  <v-app>
    <v-main class="pa-6">
      <v-container max-width="1100">
        <v-row class="mb-6">
          <v-col cols="12" class="d-flex align-center justify-space-between gap-4 flex-wrap">
            <div>
              <h1 class="text-h4 font-weight-bold mb-2">Today's Activity Overview</h1>
              <p class="text-body-2 opacity-80 mb-0">{{ calendarTitle }}</p>
            </div>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="refresh">
              Refresh
            </v-btn>
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12">
            <v-alert v-if="errorMessage" type="error" class="mb-4" variant="tonal" border="start">
              {{ errorMessage }}
            </v-alert>
            <v-skeleton-loader v-if="loading" type="table" class="mt-4"></v-skeleton-loader>

            <v-card v-else elevation="8" rounded="xl" class="overflow-hidden">
              <v-calendar
                type="day"
                :model-value="selectedDate"
                :events="events"
                :interval-count="DAY_INTERVAL_COUNT"
                :first-interval="0"
                :interval-minutes="INTERVAL_MINUTES"
                :interval-height="INTERVAL_HEIGHT"
                event-overlap-mode="column"
                color="primary"
              >
                <template #event-tooltip="{ event, interval }">
                  <div class="py-2 px-3">
                    <pre>{{event}}</pre>
                    <strong>{{ event.title }}</strong>
                    <div>{{ formatTooltip(interval) }}</div>
                  </div>
                </template>
              </v-calendar>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

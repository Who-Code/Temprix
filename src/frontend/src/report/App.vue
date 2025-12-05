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
}

const INTERVAL_MINUTES = 15;
const INTERVAL_HEIGHT = 60;
const PADDING_MINUTES = 60;
const DAY_MINUTES = 24 * 60;
const DEFAULT_INTERVAL_COUNT = DAY_MINUTES / INTERVAL_MINUTES;

const events = ref<CalendarEvent[]>([]);
const loading = ref(true);
const selectedDate = ref(new Date());
const errorMessage = ref<string | null>(null);

const safeDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toMillis = (value: unknown) => {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  const date = new Date(value as string | number);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const clampMinutes = (minutes: number) => {
  if (!Number.isFinite(minutes)) {
    return 0;
  }
  return Math.min(Math.max(minutes, 0), DAY_MINUTES);
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
  };
};

const resolveMeta = (event: CalendarEvent) => event.data as EventMeta;

const eventBounds = computed(() => {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;

  events.value.forEach((event) => {
    const start = toMillis(event.start);
    if (start !== null && start < earliest) {
      earliest = start;
    }
    const end = toMillis(event.end ?? event.start);
    if (end !== null && end > latest) {
      latest = end;
    }
  });

  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    return null;
  }

  return { earliest, latest } as const;
});

const firstVisibleInterval = computed(() => {
  if (!eventBounds.value) {
    return 0;
  }

  const { earliest } = eventBounds.value;
  const padded = earliest - PADDING_MINUTES * 60_000;
  const reference = new Date(earliest);
  reference.setHours(0, 0, 0, 0);
  const startMinutes = clampMinutes(Math.round((padded - reference.getTime()) / 60_000));
  return Math.floor(startMinutes / INTERVAL_MINUTES);
});

const visibleIntervalCount = computed(() => {
  if (!eventBounds.value) {
    return DEFAULT_INTERVAL_COUNT;
  }

  const reference = new Date(eventBounds.value.earliest);
  reference.setHours(0, 0, 0, 0);
  const dayStartMs = reference.getTime();

  const intervalStartMinutes = firstVisibleInterval.value * INTERVAL_MINUTES;
  const paddedEnd = eventBounds.value.latest + PADDING_MINUTES * 60_000;
  const endMinutes = clampMinutes(Math.round((paddedEnd - dayStartMs) / 60_000));
  const spanMinutes = Math.max(INTERVAL_MINUTES, endMinutes - intervalStartMinutes);

  const intervals = Math.ceil(spanMinutes / INTERVAL_MINUTES);
  return Math.min(intervals, DEFAULT_INTERVAL_COUNT);
});

const fetchActivities = async () => {
  loading.value = true;
  errorMessage.value = null;
  try {
    const date_string = selectedDate.value.toISOString().split('T')[0];
    const data = await invoke<ActivityItem[]>('get_days_activities', {dateInput: date_string});
    console.dir(data);
    events.value = data.map((activity) => {
      const meta = buildMeta(activity);
      return {
        title: meta.application_name || 'Unknown Activity',
        details: meta.application_window_title,
        start: activity.from,
        end: activity.to,
        color: activity.related_issue_id ? '#ED6A5A' : '#7DA59E',
        allDay: false,
        data: meta,
      } satisfies CalendarEvent;
    });
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
              {{ events }}
              <v-calendar
                type="day"
                :model-value="selectedDate"
                :events="events"
                :interval-count="visibleIntervalCount"
                :first-interval="firstVisibleInterval"
                :interval-minutes="INTERVAL_MINUTES"
                :interval-height="INTERVAL_HEIGHT"
                color="primary"
                :event-text-props="{ class: 'text-body-2 font-weight-medium' }"
                :event-more="false"
                :event-overlap-mode="'column'"
                :event-overlap-threshold="30"
              >
                <template #event="{ event }">
                  <div class="entry">
                    <div class="entry__avatar">
                      <span>{{ resolveMeta(event).avatarInitial }}</span>
                    </div>
                    <div class="entry__details">
                      <div class="entry__title" :title="resolveMeta(event).application_window_title">
                        {{ resolveMeta(event).application_window_title || resolveMeta(event).application_name }}
                      </div>
                      <div class="entry__meta">
                        <span>{{ resolveMeta(event).durationLabel }}</span>
                        <span v-if="resolveMeta(event).related_issue_id">· Ticket {{ resolveMeta(event).related_issue_id }}</span>
                      </div>
                    </div>
                  </div>
                </template>
                <template #event-tooltip="{ event, interval }">
                  <div class="py-2 px-3">
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

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { CalendarEvent, CalendarEventInterval } from "vuetify/components";

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
const INTERVAL_HEIGHT = 200;
const FIRST_HOUR = 7;
const LAST_HOUR = 19;
const WORK_HOURS = LAST_HOUR - FIRST_HOUR;
const DAY_INTERVAL_COUNT = (WORK_HOURS * 60) / INTERVAL_MINUTES;

const events = ref<CalendarEvent[]>([]);
const loading = ref(true);
const selectedDate = ref(new Date());
const errorMessage = ref<string | null>(null);
const showDatePicker = ref(false);

const maxDate = computed(() => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
});

const datePickerValue = computed({
  get: () => selectedDate.value.toISOString().split("T")[0],
  set: (value: string) => {
    const newDate = new Date(value);
    if (newDate <= maxDate.value) {
      selectedDate.value = newDate;
      fetchActivities();
    }
    showDatePicker.value = false;
  },
});

const canGoForward = computed(() => {
  const tomorrow = new Date(selectedDate.value);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return tomorrow <= today;
});

const goToPreviousDay = () => {
  const newDate = new Date(selectedDate.value);
  newDate.setDate(newDate.getDate() - 1);
  selectedDate.value = newDate;
  fetchActivities();
};

const goToNextDay = () => {
  if (canGoForward.value) {
    const newDate = new Date(selectedDate.value);
    newDate.setDate(newDate.getDate() + 1);
    selectedDate.value = newDate;
    fetchActivities();
  }
};

const toggleDatePicker = () => {
  showDatePicker.value = !showDatePicker.value;
};

const normalizeDateInput = (value: string) => {
  if (!value) {
    return "";
  }
  return value.includes("T") ? value : value.replace(" ", "T");
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
  const initial = value?.trim().charAt(0) ?? "";
  return initial ? initial.toUpperCase() : "·";
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
    return "—";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  const start = new Date(
    Math.max(meta.startDate.getTime(), dayStart.getTime())
  );
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
    const date_string = selectedDate.value.toISOString().split("T")[0];
    const data = await invoke<ActivityItem[]>("get_days_activities", {
      dateInput: date_string,
    });
    const { start: dayStart, end: dayEnd } = getDayBounds(selectedDate.value);

    const mapped: CalendarEvent[] = [];
    data.forEach((activity) => {
      const meta = buildMeta(activity);
      const span = clampEventToDay(meta, dayStart, dayEnd);
      if (!span) {
        return;
      }
      const nameLayout =
        meta.application_name + " " + meta.application_window_title;
      mapped.push({
        name: nameLayout,
        category: meta.application_window_title,
        start: span.start,
        end: span.end,
        color: activity.related_issue_id ? "#ED6A5A" : "#7DA59E",
        timed: true,
        allDay: false,
        data: meta,
      } satisfies CalendarEvent);
    });

    events.value = mapped;
  } catch (error) {
    console.error("Failed to fetch activities", error);
    errorMessage.value = "Unable to load activity data.";
  } finally {
    loading.value = false;
  }
};

const calendarTitle = computed(() => {
  return selectedDate.value.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
  });
});

const dayNumber = computed(() => {
  return selectedDate.value.getDate();
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

  return lines.filter(Boolean).join("\n");
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
          <v-col
            cols="12"
            class="d-flex align-center justify-space-between gap-4 flex-wrap"
          >
            <div class="d-flex align-center gap-4">
              <div>
                <h1 class="text-h4 font-weight-bold mb-2">Activity Overview</h1>
              </div>
            </div>
            <v-btn
              color="primary"
              variant="flat"
              prepend-icon="mdi-refresh"
              @click="refresh"
            >
              Refresh
            </v-btn>
          </v-col>
        </v-row>
        <v-row class="mb-6">
          <v-col cols="12" class="d-flex align-center justify-center">
            <div class="d-flex align-center gap-2">
              <v-btn
                icon="mdi-chevron-left"
                variant="text"
                size="small"
                @click="goToPreviousDay"
                aria-label="Previous day"
              ></v-btn>
              <v-menu v-model="showDatePicker" :close-on-content-click="false">
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    variant="outlined"
                    size="large"
                    class="text-h5 font-weight-bold px-4"
                    @click="toggleDatePicker"
                  >
                    {{ dayNumber }}
                  </v-btn>
                </template>
                <v-date-picker
                  v-model="datePickerValue"
                  :max="maxDate.toISOString().split('T')[0]"
                  hide-header
                ></v-date-picker>
              </v-menu>
              <v-btn
                icon="mdi-chevron-right"
                variant="text"
                size="small"
                :disabled="!canGoForward"
                @click="goToNextDay"
                aria-label="Next day"
              ></v-btn>
            </div>
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12">
            <v-alert
              v-if="errorMessage"
              type="error"
              class="mb-4"
              variant="tonal"
              border="start"
            >
              {{ errorMessage }}
            </v-alert>
            <v-skeleton-loader
              v-if="loading"
              type="table"
              class="mt-4"
            ></v-skeleton-loader>

            <v-card v-else elevation="8" rounded="xl" class="overflow-hidden">
              <v-calendar
                type="day"
                :model-value="selectedDate"
                :events="events"
                :interval-count="DAY_INTERVAL_COUNT"
                :first-interval="FIRST_HOUR * (60 / INTERVAL_MINUTES)"
                :interval-minutes="INTERVAL_MINUTES"
                :interval-height="INTERVAL_HEIGHT"
                event-overlap-mode="column"
                color="primary"
              >
                <template #day-header> </template>
                <template #day-label-header> </template>
                <template #event="{ event }">
                  <div class="event-entry justify-start">
                    <v-row class="justify-space-between flex-shrink-1">
                      <v-col class="event-avatar">
                        <v-avatar>
                          {{ event.data.application_name[0].toUpperCase() }}
                        </v-avatar>
                        {{ event.data.application_name }}
                      </v-col>
                      <v-col class="event-detail-info"> {{ event.data.application_window_title }}</v-col>
                      <v-col class="event-ticket">
                        <v-chip size="xs" color="primary" variant="flat" v-if="event.data.related_issue_id"> {{ event.data.related_issue_id }} </v-chip>
                        <v-chip size="xs" v-else>Smart assign</v-chip>
                      </v-col>
                      <v-col class="event-duration">
                        {{ event.data.startLabel }} - {{ event.data.endLabel }}
                      </v-col>
                    </v-row>
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
<style lang="scss">
.v-event-timed {
  min-height: 32px;
  transition: all 1s ease;
  transform: scale(1);
  overflow: hidden;
  &:hover {
    z-index: 999;
    transform: scale(1.02);
  }
}
.event-entry {
  max-height: 100%;
  padding: 4px;
  gap: 5px;
  .event-ticket {
    flex-grow: 0;
    .v-chip {
      padding: 0 6px;
    }
  }
  .v-avatar {
    height: 20px;
    width: 20px;
  }
  .event-detail-info {
    max-width: 80%;
    flex-grow: 1;
    flex-shrink: 1;
    line-break:anywhere;
    height: 3rem;
    overflow: hidden;
  }
  .event-duration {
    flex-shrink: 1;
    flex-grow: 0;
  }
  .event-avatar {
    flex-grow: 0;
  }
}
</style>

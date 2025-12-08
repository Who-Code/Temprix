<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';

interface PatternEntry {
  id: string;
  value: string;
}

const patternTemplates = {
  'Redmine': '#{0,1}([1-9]{1,1}[0-9]{5,5})',
  'JIRA': '([A-Z][A-Z_0-9]+-[0-9]+)(?=.*::)'
};

const patterns = ref<PatternEntry[]>([]);
const saving = ref(false);
const loading = ref(true);
const snackbar = reactive({ show: false, message: '', color: 'success' as 'success' | 'error' });

const createPatternEntry = (value = ''): PatternEntry => ({
  id: crypto.randomUUID(),
  value,
});

const showMessage = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.message = message;
  snackbar.color = color;
  snackbar.show = true;
};

const loadPatterns = async () => {
  loading.value = true;
  try {
    const loaded = await invoke<string[]>('get_patterns');
    patterns.value = Array.isArray(loaded) ? loaded.map((value) => createPatternEntry(value)) : [];
  } catch (error) {
    console.error('Failed to load patterns', error);
    showMessage('Failed to load patterns', 'error');
  } finally {
    loading.value = false;
  }
};

const addPatternFromTemplate = (templateRegex: string) => {
  patterns.value.push(createPatternEntry(templateRegex));
};

const addPattern = () => {
  patterns.value.push(createPatternEntry(''));
};

const removePattern = (index: number) => {
  patterns.value.splice(index, 1);
};

const savePatterns = async () => {
  const cleaned = patterns.value
    .map((pattern) => pattern.value.trim())
    .filter((value) => value.length > 0);

  saving.value = true;
  try {
    await invoke('update_patterns', { patterns: cleaned });
    showMessage('Patterns saved successfully.');
    patterns.value = cleaned.map((value) => createPatternEntry(value));
  } catch (error) {
    console.error('Failed to save patterns', error);
    showMessage('Failed to save patterns', 'error');
  } finally {
    saving.value = false;
  }
};

onMounted(loadPatterns);
</script>

<template>
  <v-app>
    <v-main class="pa-6">
      <v-container max-width="840">
        <v-card elevation="8" rounded="xl">
          <v-card-title class="d-flex align-center justify-space-between flex-wrap gap-4">
            <div class="d-flex align-center gap-3">
              <v-icon color="primary">mdi-pound</v-icon>
              <span class="text-h6 font-weight-bold">ID Detection Patterns</span>
            </div>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="addPattern">
              Add Pattern
            </v-btn>
          </v-card-title>
          <v-divider></v-divider>

          <v-card-text>
            <p class="text-body-2 mb-4">
              We use standard regular expressions. Capture group 1 will be stored as the ticket identifier.
              For example, <code>#(\d+)</code> captures IDs like <em>#1234</em>.
            </p>

            <v-divider></v-divider>

            <div class="mb-4 mtß4">
              <h3>Issue Tracking Templates</h3>
              <p>Use the presets for ready to use Regex for common issue tracking systems</p>
              <v-btn @click="addPatternFromTemplate(template)" v-for="(template, templateKey) of patternTemplates" :key="templateKey+template">
                {{ templateKey }}
              </v-btn>
            </div>

            <v-divider></v-divider>
            

            <v-skeleton-loader
              v-if="loading"
              type="article"
              class="mt-4"
              color="rgb(231, 236, 228)"
            ></v-skeleton-loader>

            <v-alert
              v-else-if="!patterns.length"
              type="info"
              variant="tonal"
              border="start"
              class="mb-4"
            >
              No patterns configured yet. Add at least one regex to detect ticket IDs automatically.
            </v-alert>

            <v-expand-transition group>
              <div v-for="(pattern, index) in patterns" :key="pattern.id" class="mb-6">
                <v-text-field
                  v-model="pattern.value"
                  :label="`Pattern #${index + 1}`"
                  variant="outlined"
                  placeholder="#(\\d+)"
                  hide-details="auto"
                  clearable
                  autofocus
                ></v-text-field>
                <div class="d-flex justify-end mt-2">
                  <v-btn color="error" variant="text" prepend-icon="mdi-delete" @click="removePattern(index)">
                    Remove
                  </v-btn>
                </div>
                <v-divider v-if="index < patterns.length - 1" class="my-6"></v-divider>
              </div>
            </v-expand-transition>
          </v-card-text>

          <v-divider></v-divider>
          <v-card-actions class="justify-end">
            <v-btn
              color="primary"
              variant="flat"
              size="large"
              :loading="saving"
              :disabled="saving || loading"
              prepend-icon="mdi-content-save"
              @click="savePatterns"
            >
              Save Changes
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-container>

      <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">
        {{ snackbar.message }}
        <template #actions>
          <v-btn variant="text" @click="snackbar.show = false">Close</v-btn>
        </template>
      </v-snackbar>
    </v-main>
  </v-app>
</template>

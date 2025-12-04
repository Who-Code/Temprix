const { invoke } = window.__TAURI__.core;

const patternListEl = document.getElementById('pattern-list');
const addBtn = document.getElementById('add-pattern');
const saveBtn = document.getElementById('save-patterns');


function createPatternItem(value = '') {
    const div = document.createElement('div');
    div.className = 'pattern-item';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = 'e.g. #(\\d+)';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => div.remove();

    div.appendChild(input);
    div.appendChild(removeBtn);
    return div;
}

async function loadPatterns() {
    try {
        const patterns = await invoke('get_patterns');
        patternListEl.innerHTML = '';
        patterns.forEach(p => {
            patternListEl.appendChild(createPatternItem(p));
        });
    } catch (e) {
        console.error('Failed to load patterns', e);
        alert('Failed to load patterns: ' + e);
    }
}

async function savePatterns() {
    const inputs = patternListEl.querySelectorAll('input');
    const patterns = Array.from(inputs).map(input => input.value).filter(v => v.trim() !== '');

    try {
        await invoke('update_patterns', { patterns });
        alert('Settings saved successfully!');
    } catch (e) {
        console.error('Failed to save patterns', e);
        alert('Failed to save settings: ' + e);
    }
}

addBtn.onclick = () => {
    // patternListEl.appendChild(createPatternItem());
};

saveBtn.onclick = savePatterns;

// Initial load
loadPatterns();
const vscode = acquireVsCodeApi();

const listEl = document.getElementById('set-list');
const previewEl = document.getElementById('preview');
const previewTitleEl = document.getElementById('preview-title');
const statusModeEl = document.getElementById('status-mode');
const statusMessageEl = document.getElementById('status-message');
const promptMetaEl = document.getElementById('prompt-meta');

// pending g is used to handle gg and G keybinds for jump first/last
let pendingG = false;
let pendingGTimer;

// Search state is kept local in the webview. simple filter
let searchActive = false;
let searchQuery = '';
let lastSelectedSet = 'default';

// UI state comes from extension host. webview gets a single view model on every refresh
let state = {
    sets: ['default'],
    activeSet: 'default',
    selectedSet: 'default',
    previewJson: '{}',
    statusMessage: ''
};

// Send actions to extension host
function post(type, setName) {
    vscode.postMessage({ type, setName });
}

function setPendingG(value) {
    pendingG = value;
    if (pendingGTimer) {
        clearTimeout(pendingGTimer);
        pendingGTimer = undefined;
    }

    if (value) {
        pendingGTimer = setTimeout(() => {
            pendingG = false;
        }, 280);
    }
}

function getVisibleSets() {
    // Basic search. case insensitive substring filter
    if (!searchActive || searchQuery.length === 0) {
        return state.sets;
    }

    const query = searchQuery.toLowerCase();
    return state.sets.filter((setName) => setName.toLowerCase().includes(query));
}

function ensureSelectedInVisible(visibleSets) {
    if (visibleSets.length === 0) {
        return;
    }

    if (!visibleSets.includes(state.selectedSet)) {
        post('selectSet', visibleSets[0]);
    }
}

function render() {
    // Render both panes from derived UI state
    const visibleSets = getVisibleSets();
    ensureSelectedInVisible(visibleSets);

    if (state.selectedSet) {
        lastSelectedSet = state.selectedSet;
    }

    listEl.innerHTML = '';

    if (visibleSets.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'set-item-empty';
        empty.textContent = 'no matches';
        listEl.appendChild(empty);
    } else {
        for (const setName of visibleSets) {
            const li = document.createElement('li');
            li.className = 'set-item';
            if (setName === state.selectedSet) {
                li.classList.add('selected');
            }

            const isActive = setName === state.activeSet;
            const isSelected = setName === state.selectedSet;

            const selectedMarker = document.createElement('span');
            selectedMarker.className = 'set-item-marker select';
            selectedMarker.textContent = isSelected ? 's' : ' ';

            const activeMarker = document.createElement('span');
            activeMarker.className = 'set-item-marker active';
            activeMarker.textContent = isActive ? '>' : ' ';

            const label = document.createElement('span');
            label.className = 'set-item-label';
            label.textContent = setName;

            if (setName === 'default') {
                const tag = document.createElement('span');
                tag.className = 'set-item-tag';
                tag.textContent = ' [default]';
                label.appendChild(tag);
            }

            li.appendChild(selectedMarker);
            li.appendChild(activeMarker);
            li.appendChild(label);
            li.onclick = () => post('selectSet', setName);
            listEl.appendChild(li);
        }
    }

    const previewSet = state.selectedSet || lastSelectedSet;
    previewTitleEl.textContent = previewSet === 'default' ? '/slots.json' : `/sets/${previewSet}/slots.json`;
    previewEl.innerHTML = renderJson(state.previewJson);

    if (searchActive) {
        statusModeEl.textContent = 'SEARCH';
        promptMetaEl.textContent = `/${searchQuery}  (${visibleSets.length} match${visibleSets.length === 1 ? '' : 'es'})`;
    } else {
        statusModeEl.textContent = 'NAV';
        promptMetaEl.textContent = `selected ${state.selectedSet} | active ${state.activeSet}`;
    }

    statusMessageEl.textContent = state.statusMessage;
}

function renderJson(text) {
    // Preview uses parsed JSON for syntax coloring
    try {
        const value = JSON.parse(text);
        return renderJsonValue(value, 0);
    } catch {
        return escapeHtml(text);
    }
}

function renderJsonValue(value, depth) {
    const indent = '    '.repeat(depth);
    const nextIndent = '    '.repeat(depth + 1);

    if (value === null) {
        return '<span class="json-null">null</span>';
    }

    if (typeof value === 'string') {
        return `<span class="json-string">&quot;${escapeHtml(value)}&quot;</span>`;
    }

    if (typeof value === 'number') {
        return `<span class="json-number">${String(value)}</span>`;
    }

    if (typeof value === 'boolean') {
        return `<span class="json-boolean">${String(value)}</span>`;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[]';
        }

        const lines = value.map((entry) => nextIndent + renderJsonValue(entry, depth + 1));
        return `[\n${lines.join(',\n')}\n${indent}]`;
    }

    const entries = Object.entries(value);
    if (entries.length === 0) {
        return '{}';
    }

    const lines = entries.map(([key, entryValue]) => {
        const keyHtml = `<span class="json-key">&quot;${escapeHtml(key)}&quot;</span>`;
        return `${nextIndent}${keyHtml}: ${renderJsonValue(entryValue, depth + 1)}`;
    });

    return `{\n${lines.join(',\n')}\n${indent}}`;
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function move(delta) {
    const visibleSets = getVisibleSets();
    if (visibleSets.length === 0) {
        return;
    }

    const index = visibleSets.indexOf(state.selectedSet);
    const safeIndex = index < 0 ? 0 : index;
    const next = Math.max(0, Math.min(visibleSets.length - 1, safeIndex + delta));
    post('selectSet', visibleSets[next]);
}

function jumpFirst() {
    const visibleSets = getVisibleSets();
    if (visibleSets.length > 0) {
        post('selectSet', visibleSets[0]);
    }
}

function jumpLast() {
    const visibleSets = getVisibleSets();
    if (visibleSets.length > 0) {
        post('selectSet', visibleSets[visibleSets.length - 1]);
    }
}

function updateSearch(nextQuery) {
    searchQuery = nextQuery;
    render();
}

function isPrintableKey(event) {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'refresh') {
        state = event.data.state;
        render();
    }
});

document.addEventListener('keydown', (event) => {
    // Keyboard flow with nav/search modes
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
    }

    if (searchActive) {
        if (event.key === 'Escape') {
            event.preventDefault();
            setPendingG(false);
            searchActive = false;
            updateSearch('');
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            setPendingG(false);
            searchActive = false;
            render();
            return;
        }

        if (event.key === 'Backspace') {
            event.preventDefault();
            setPendingG(false);
            updateSearch(searchQuery.slice(0, -1));
            return;
        }

        if (event.key === 'j' || event.key === 'ArrowDown') {
            event.preventDefault();
            setPendingG(false);
            move(1);
            return;
        }

        if (event.key === 'k' || event.key === 'ArrowUp') {
            event.preventDefault();
            setPendingG(false);
            move(-1);
            return;
        }

        if (isPrintableKey(event)) {
            event.preventDefault();
            setPendingG(false);
            updateSearch(searchQuery + event.key);
            return;
        }
    }

    if (event.key === '/') {
        event.preventDefault();
        setPendingG(false);
        searchActive = true;
        updateSearch('');
        return;
    }

    if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        setPendingG(false);
        move(1);
        return;
    }

    if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        setPendingG(false);
        move(-1);
        return;
    }

    if (event.key === 'Enter' || event.key === 'l' || event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        setPendingG(false);
        post('openSetFile', state.selectedSet);
        return;
    }

    if (event.key === 's') {
        event.preventDefault();
        setPendingG(false);
        post('switchSet', state.selectedSet);
        return;
    }

    if (event.key === 'a') {
        event.preventDefault();
        setPendingG(false);
        post('createSet');
        return;
    }

    if (event.key === 'r') {
        event.preventDefault();
        setPendingG(false);
        post('renameSet', state.selectedSet);
        return;
    }

    if (event.key === 'd') {
        event.preventDefault();
        setPendingG(false);
        post('deleteSet', state.selectedSet);
        return;
    }

    if (event.key === 'G') {
        event.preventDefault();
        setPendingG(false);
        jumpLast();
        return;
    }

    if (event.key === 'g') {
        event.preventDefault();
        if (pendingG) {
            setPendingG(false);
            jumpFirst();
            return;
        }

        setPendingG(true);
        return;
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        setPendingG(false);
        post('closePanel');
    }
});

document.body.tabIndex = 0;
document.body.focus();
post('ready');
render();

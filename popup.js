// Cookie Manager - Main JavaScript

class CookieManager {
    constructor() {
        this.cookies = [];
        this.filteredCookies = [];
        this.selectedCookies = new Set();
        this.currentUrl = null;
        this.currentDomain = null;
        this.editingCookie = null;
        this.isDarkTheme = false;

        this.init();
    }

    async init() {
        this.loadThemePreference();
        await this.getCurrentTab();
        this.bindEvents();
        await this.loadCookies();
    }

    // Theme Management
    loadThemePreference() {
        const savedTheme = localStorage.getItem('cookieManagerTheme');
        if (savedTheme === 'dark') {
            this.isDarkTheme = true;
            document.body.classList.add('dark-theme');
            this.updateThemeLabel();
        }
    }

    toggleTheme() {
        this.isDarkTheme = !this.isDarkTheme;

        if (this.isDarkTheme) {
            document.body.classList.add('dark-theme');
            localStorage.setItem('cookieManagerTheme', 'dark');
        } else {
            document.body.classList.remove('dark-theme');
            localStorage.setItem('cookieManagerTheme', 'light');
        }

        this.updateThemeLabel();
        this.showToast(this.isDarkTheme ? 'Tema oscuro activado 🌙' : 'Tema claro activado ☀️');
    }

    updateThemeLabel() {
        const label = document.getElementById('themeLabel');
        if (label) {
            label.textContent = this.isDarkTheme ? 'Oscuro' : 'Claro';
        }
    }

    async getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url) {
                this.currentUrl = new URL(tab.url);
                this.currentDomain = this.currentUrl.hostname;
                document.getElementById('currentSite').textContent = this.currentUrl.hostname;
            }
        } catch (error) {
            console.error('Error getting current tab:', error);
            document.getElementById('currentSite').textContent = 'No se pudo obtener el sitio';
        }
    }

    bindEvents() {
        // Theme Toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filterCookies(e.target.value);
        });

        // Refresh
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadCookies();
        });

        // Select All Button
        document.getElementById('selectAllBtn').addEventListener('click', () => {
            this.toggleSelectAll();
        });

        // Select All Checkbox
        document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
            this.selectAll(e.target.checked);
        });

        // Delete Selected
        document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
            this.deleteSelected();
        });

        // Export Selected
        document.getElementById('exportSelectedBtn').addEventListener('click', () => {
            this.exportCookies();
        });

        // Copy Selected
        document.getElementById('copySelectedBtn').addEventListener('click', () => {
            this.copySelected();
        });

        // Modal Events
        document.getElementById('closeModalBtn').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('saveEditBtn').addEventListener('click', () => {
            this.saveCookie();
        });

        document.querySelector('.modal-backdrop').addEventListener('click', () => {
            this.closeModal();
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    async loadCookies() {
        this.showLoading(true);
        this.selectedCookies.clear();
        this.updateSelectedCount();

        try {
            if (!this.currentDomain) {
                throw new Error('No domain available');
            }

            // Get cookies for the current domain and all parent domains
            const allCookies = await chrome.cookies.getAll({ domain: this.currentDomain });

            // Also get cookies without domain restriction for the current URL
            const urlCookies = await chrome.cookies.getAll({ url: this.currentUrl.origin });

            // Merge and deduplicate
            const cookieMap = new Map();
            [...allCookies, ...urlCookies].forEach(cookie => {
                const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
                cookieMap.set(key, cookie);
            });

            this.cookies = Array.from(cookieMap.values());
            this.filteredCookies = [...this.cookies];

            this.renderCookies();
            this.updateCookieCount();
        } catch (error) {
            console.error('Error loading cookies:', error);
            this.showToast('Error al cargar las cookies', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    filterCookies(searchTerm) {
        const term = searchTerm.toLowerCase().trim();

        if (!term) {
            this.filteredCookies = [...this.cookies];
        } else {
            this.filteredCookies = this.cookies.filter(cookie =>
                cookie.name.toLowerCase().includes(term) ||
                cookie.domain.toLowerCase().includes(term) ||
                cookie.value.toLowerCase().includes(term)
            );
        }

        this.renderCookies();
        this.updateCookieCount();
    }

    renderCookies() {
        const tbody = document.getElementById('cookieTableBody');
        const emptyState = document.getElementById('emptyState');

        tbody.innerHTML = '';

        if (this.filteredCookies.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        this.filteredCookies.forEach(cookie => {
            const row = this.createCookieRow(cookie);
            tbody.appendChild(row);
        });
    }

    createCookieRow(cookie) {
        const tr = document.createElement('tr');
        const cookieKey = this.getCookieKey(cookie);

        if (this.selectedCookies.has(cookieKey)) {
            tr.classList.add('selected');
        }

        // Checkbox
        const tdCheckbox = document.createElement('td');
        tdCheckbox.className = 'col-checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.selectedCookies.has(cookieKey);
        checkbox.addEventListener('change', () => {
            this.toggleCookieSelection(cookie, checkbox.checked);
            tr.classList.toggle('selected', checkbox.checked);
        });
        tdCheckbox.appendChild(checkbox);
        tr.appendChild(tdCheckbox);

        // Name
        const tdName = document.createElement('td');
        tdName.className = 'col-name';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'cell-content';
        nameSpan.textContent = cookie.name;
        nameSpan.title = cookie.name;
        tdName.appendChild(nameSpan);
        tr.appendChild(tdName);

        // Value
        const tdValue = document.createElement('td');
        tdValue.className = 'col-value';
        const valueSpan = document.createElement('span');
        valueSpan.className = 'cell-content cell-value';
        valueSpan.textContent = this.truncateValue(cookie.value, 30);
        valueSpan.title = cookie.value;
        tdValue.appendChild(valueSpan);
        tr.appendChild(tdValue);

        // Domain
        const tdDomain = document.createElement('td');
        tdDomain.className = 'col-domain';
        const domainSpan = document.createElement('span');
        domainSpan.className = 'cell-content';
        domainSpan.textContent = cookie.domain;
        domainSpan.title = cookie.domain;
        tdDomain.appendChild(domainSpan);
        tr.appendChild(tdDomain);

        // Expires
        const tdExpires = document.createElement('td');
        tdExpires.className = 'col-expires';
        const expiresSpan = document.createElement('span');
        expiresSpan.className = 'cell-content cell-expires';

        if (cookie.session) {
            expiresSpan.textContent = 'Sesión';
            expiresSpan.classList.add('session');
        } else if (cookie.expirationDate) {
            const expDate = new Date(cookie.expirationDate * 1000);
            const now = new Date();
            expiresSpan.textContent = this.formatDate(expDate);
            expiresSpan.title = expDate.toLocaleString();
            if (expDate < now) {
                expiresSpan.classList.add('expired');
            }
        } else {
            expiresSpan.textContent = 'N/A';
        }

        tdExpires.appendChild(expiresSpan);
        tr.appendChild(tdExpires);

        // Actions
        const tdActions = document.createElement('td');
        tdActions.className = 'col-actions';
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'actions-cell';

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-icon';
        editBtn.title = 'Editar';
        editBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>`;
        editBtn.addEventListener('click', () => this.openEditModal(cookie));
        actionsDiv.appendChild(editBtn);

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon btn-danger-icon';
        deleteBtn.title = 'Eliminar';
        deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>`;
        deleteBtn.addEventListener('click', () => this.deleteCookie(cookie));
        actionsDiv.appendChild(deleteBtn);

        tdActions.appendChild(actionsDiv);
        tr.appendChild(tdActions);

        return tr;
    }

    getCookieKey(cookie) {
        return `${cookie.name}|${cookie.domain}|${cookie.path}`;
    }

    truncateValue(value, maxLength) {
        if (value.length <= maxLength) return value;
        return value.substring(0, maxLength) + '...';
    }

    formatDate(date) {
        const now = new Date();
        const diff = date - now;

        if (diff < 0) return 'Expirada';

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days > 365) return `${Math.floor(days / 365)}a`;
        if (days > 30) return `${Math.floor(days / 30)}m`;
        if (days > 0) return `${days}d`;

        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours > 0) return `${hours}h`;

        const minutes = Math.floor(diff / (1000 * 60));
        return `${minutes}min`;
    }

    toggleCookieSelection(cookie, selected) {
        const key = this.getCookieKey(cookie);
        if (selected) {
            this.selectedCookies.add(key);
        } else {
            this.selectedCookies.delete(key);
        }
        this.updateSelectedCount();
    }

    toggleSelectAll() {
        const allSelected = this.selectedCookies.size === this.filteredCookies.length;
        this.selectAll(!allSelected);
    }

    selectAll(selected) {
        this.selectedCookies.clear();

        if (selected) {
            this.filteredCookies.forEach(cookie => {
                this.selectedCookies.add(this.getCookieKey(cookie));
            });
        }

        document.getElementById('selectAllCheckbox').checked = selected;
        this.renderCookies();
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const count = this.selectedCookies.size;
        document.getElementById('selectedCount').textContent = `${count} seleccionadas`;
        document.getElementById('deleteSelectedBtn').disabled = count === 0;
    }

    updateCookieCount() {
        const total = this.cookies.length;
        const filtered = this.filteredCookies.length;

        if (total === filtered) {
            document.getElementById('cookieCount').textContent = `${total} cookies`;
        } else {
            document.getElementById('cookieCount').textContent = `${filtered} de ${total} cookies`;
        }
    }

    showLoading(show) {
        const loadingState = document.getElementById('loadingState');
        const tableBody = document.getElementById('cookieTableBody');
        const emptyState = document.getElementById('emptyState');

        if (show) {
            loadingState.classList.remove('hidden');
            tableBody.innerHTML = '';
            emptyState.classList.add('hidden');
        } else {
            loadingState.classList.add('hidden');
        }
    }

    // Edit Cookie
    openEditModal(cookie) {
        this.editingCookie = cookie;

        document.getElementById('editName').value = cookie.name;
        document.getElementById('editValue').value = cookie.value;
        document.getElementById('editDomain').value = cookie.domain;
        document.getElementById('editPath').value = cookie.path;
        document.getElementById('editSecure').checked = cookie.secure;
        document.getElementById('editHttpOnly').checked = cookie.httpOnly;
        document.getElementById('editSameSite').value = cookie.sameSite || 'no_restriction';

        if (cookie.expirationDate) {
            const date = new Date(cookie.expirationDate * 1000);
            const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
            document.getElementById('editExpires').value = localDate.toISOString().slice(0, 16);
        } else {
            document.getElementById('editExpires').value = '';
        }

        document.getElementById('editModal').classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('editModal').classList.add('hidden');
        this.editingCookie = null;
    }

    async saveCookie() {
        if (!this.editingCookie) return;

        const oldCookie = this.editingCookie;

        // First, remove the old cookie
        try {
            const protocol = oldCookie.secure ? 'https://' : 'http://';
            const url = `${protocol}${oldCookie.domain.startsWith('.') ? oldCookie.domain.substring(1) : oldCookie.domain}${oldCookie.path}`;

            await chrome.cookies.remove({
                url: url,
                name: oldCookie.name
            });
        } catch (error) {
            console.error('Error removing old cookie:', error);
        }

        // Create new cookie with updated values
        const newCookie = {
            url: this.currentUrl.origin,
            name: document.getElementById('editName').value,
            value: document.getElementById('editValue').value,
            domain: document.getElementById('editDomain').value,
            path: document.getElementById('editPath').value,
            secure: document.getElementById('editSecure').checked,
            httpOnly: document.getElementById('editHttpOnly').checked,
            sameSite: document.getElementById('editSameSite').value
        };

        const expiresValue = document.getElementById('editExpires').value;
        if (expiresValue) {
            newCookie.expirationDate = new Date(expiresValue).getTime() / 1000;
        }

        try {
            await chrome.cookies.set(newCookie);
            this.showToast('Cookie actualizada correctamente', 'success');
            this.closeModal();
            await this.loadCookies();
        } catch (error) {
            console.error('Error saving cookie:', error);
            this.showToast('Error al guardar la cookie: ' + error.message, 'error');
        }
    }

    // Delete Cookie
    async deleteCookie(cookie) {
        try {
            const protocol = cookie.secure ? 'https://' : 'http://';
            const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
            const url = `${protocol}${domain}${cookie.path}`;

            await chrome.cookies.remove({
                url: url,
                name: cookie.name
            });

            this.showToast('Cookie eliminada', 'success');
            await this.loadCookies();
        } catch (error) {
            console.error('Error deleting cookie:', error);
            this.showToast('Error al eliminar la cookie', 'error');
        }
    }

    async deleteSelected() {
        if (this.selectedCookies.size === 0) return;

        const count = this.selectedCookies.size;

        try {
            for (const cookie of this.filteredCookies) {
                const key = this.getCookieKey(cookie);
                if (this.selectedCookies.has(key)) {
                    const protocol = cookie.secure ? 'https://' : 'http://';
                    const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
                    const url = `${protocol}${domain}${cookie.path}`;

                    await chrome.cookies.remove({
                        url: url,
                        name: cookie.name
                    });
                }
            }

            this.selectedCookies.clear();
            this.showToast(`${count} cookies eliminadas`, 'success');
            await this.loadCookies();
        } catch (error) {
            console.error('Error deleting cookies:', error);
            this.showToast('Error al eliminar las cookies', 'error');
        }
    }

    // Export Cookies
    exportCookies() {
        let cookiesToExport;

        if (this.selectedCookies.size > 0) {
            cookiesToExport = this.filteredCookies.filter(cookie =>
                this.selectedCookies.has(this.getCookieKey(cookie))
            );
        } else {
            cookiesToExport = this.filteredCookies;
        }

        if (cookiesToExport.length === 0) {
            this.showToast('No hay cookies para exportar', 'error');
            return;
        }

        const exportData = {
            exportDate: new Date().toISOString(),
            domain: this.currentDomain,
            cookieCount: cookiesToExport.length,
            cookies: cookiesToExport.map(cookie => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                sameSite: cookie.sameSite,
                expirationDate: cookie.expirationDate,
                session: cookie.session
            }))
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `cookies_${this.currentDomain}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast(`${cookiesToExport.length} cookies exportadas`, 'success');
    }

    // Copy Selected
    async copySelected() {
        if (this.selectedCookies.size === 0) {
            this.showToast('No hay cookies para copiar', 'error');
            return;
        }

        const cookiesToCopy = this.filteredCookies.filter(cookie =>
            this.selectedCookies.has(this.getCookieKey(cookie))
        );

        if (cookiesToCopy.length === 0) {
            this.showToast('No hay cookies para copiar', 'error');
            return;
        }

        // Create a string of the selected cookies
        const cookieString = cookiesToCopy.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

        try {
            await navigator.clipboard.writeText(cookieString);
            this.showToast(`${cookiesToCopy.length} cookies copiadas al portapapeles`, 'success');
        } catch (err) {
            console.error('Failed to copy cookies:', err);
            this.showToast('Error al copiar cookies', 'error');
        }
    }

    // Toast Notification
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');

        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new CookieManager();
});
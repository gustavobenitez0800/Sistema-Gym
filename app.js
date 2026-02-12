
import { supabase } from './src/supabaseClient.js';
import { whatsappService } from './src/whatsappService.js';
import { log, validators, ui, formatCurrency, formatDate, transformDate, getMonthName, getPreviousMonth } from './src/utils.js';
const { ipcRenderer } = window.require('electron');

// Global update function for the button
window.checkForUpdates = () => ipcRenderer.send('manual-check-for-updates');

// ===== GLOBAL STATE & CONFIGURATION =====
let currentDate = new Date(); // Today's real date
let currentMembers = [];
let currentFilter = 'all';
let currentSortOrder = 'last_name_asc';
let ITEMS_PER_PAGE = 20;
let currentPage = 1;
let filteredMembersCache = [];
let activeMemberIds = new Set();
let whatsappConnected = false;

// ===== WHATSAPP AUTO CONFIG FUNCTIONS =====
window.openWhatsAppConfig = function () {
    document.getElementById('whatsapp-modal').classList.remove('hidden');
    // Check current status
    ipcRenderer.invoke('whatsapp-status').then(status => {
        updateWhatsAppUI(status);
    });
};

window.closeWhatsAppModal = function () {
    document.getElementById('whatsapp-modal').classList.add('hidden');
    // Reset sections visibility for next open
    document.getElementById('whatsapp-qr-section')?.classList.add('hidden');
    document.getElementById('whatsapp-connected-section')?.classList.add('hidden');
    const connectBtn = document.getElementById('whatsapp-connect-btn');
    if (connectBtn) connectBtn.disabled = false;
};

window.initWhatsApp = async function () {
    const qrSection = document.getElementById('whatsapp-qr-section');
    const qrContainer = document.getElementById('whatsapp-qr-container');
    const statusDot = document.getElementById('whatsapp-status-dot');
    const statusText = document.getElementById('whatsapp-status-text');
    const connectBtn = document.getElementById('whatsapp-connect-btn');

    // Show loading
    qrSection.classList.remove('hidden');
    qrContainer.innerHTML = '<div class="spinner"></div>';
    statusDot.className = 'status-dot connecting';
    statusText.textContent = 'Conectando...';
    connectBtn.disabled = true;

    try {
        await ipcRenderer.invoke('whatsapp-init');
    } catch (error) {
        console.error('[WhatsApp] Init error:', error);
        statusText.textContent = 'Error al conectar';
        statusDot.className = 'status-dot disconnected';
        connectBtn.disabled = false;
    }
};

window.disconnectWhatsApp = async function () {
    try {
        await ipcRenderer.invoke('whatsapp-logout');
        whatsappConnected = false;
        updateWhatsAppUI({ status: 'disconnected' });
    } catch (error) {
        console.error('[WhatsApp] Disconnect error:', error);
    }
};

function updateWhatsAppUI(status) {
    const statusDot = document.getElementById('whatsapp-status-dot');
    const statusText = document.getElementById('whatsapp-status-text');
    const qrSection = document.getElementById('whatsapp-qr-section');
    const qrContainer = document.getElementById('whatsapp-qr-container');
    const connectedSection = document.getElementById('whatsapp-connected-section');
    const connectBtn = document.getElementById('whatsapp-connect-btn');
    const disconnectBtn = document.getElementById('whatsapp-disconnect-btn');

    if (!statusDot) return;

    switch (status.status) {
        case 'ready':
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Conectado';
            qrSection.classList.add('hidden');
            connectedSection.classList.remove('hidden');
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
            whatsappConnected = true;
            break;
        case 'qr':
            statusDot.className = 'status-dot connecting';
            statusText.textContent = 'Escanea el QR';
            qrSection.classList.remove('hidden');
            connectedSection.classList.add('hidden');
            if (status.qr) {
                qrContainer.innerHTML = `<img src="${status.qr}" alt="QR Code">`;
            }
            connectBtn.disabled = true;
            break;
        case 'authenticated':
            statusText.textContent = 'Autenticado, cargando...';
            break;
        case 'disconnected':
        case 'not_initialized':
        default:
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Desconectado';
            qrSection.classList.add('hidden');
            connectedSection.classList.add('hidden');
            connectBtn.classList.remove('hidden');
            connectBtn.disabled = false;
            disconnectBtn.classList.add('hidden');
            whatsappConnected = false;
            break;
    }
}

// Listen for WhatsApp status updates from main process
ipcRenderer.on('whatsapp-status', (event, status) => {
    updateWhatsAppUI(status);
});

// Auto-send WhatsApp message function
async function autoSendWhatsApp(phone, message, type = 'payment') {
    if (!whatsappConnected) return false;

    const toggle = document.getElementById(`auto-send-${type}`);
    if (toggle && !toggle.checked) return false;

    try {
        const result = await ipcRenderer.invoke('whatsapp-send', phone, message);
        return result.success || false;
    } catch (error) {
        console.error('[WhatsApp] Send error:', error);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        log('[APP] DOMContentLoaded - supabase:', !!supabase);

        if (!supabase) {
            document.body.innerHTML = `
                <div style="display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column; background:#121212; color:white;">
                    <h1 style="color:#ff4444;">Configuración Faltante</h1>
                    <div style="margin-top:20px; padding:10px; background:#333; border-radius:4px;">
                        src/config.js
                    </div>
                </div>
            `;
            return;
        }
        checkSession();
        setupEventListeners();

        // Set initial display
        updateMonthDisplays();
        initializeDatePicker();

        // Setup keyboard shortcuts
        setupKeyboardShortcuts();

        // Show App Version
        ipcRenderer.invoke('get-app-version').then(version => {
            const versionEl = document.getElementById('app-version');
            if (versionEl) versionEl.textContent = 'v' + version;
        }).catch(err => console.error(err));

        // --- Custom Update Notification Logic ---
        const notification = document.getElementById('update-notification');
        const title = document.getElementById('update-title');
        const message = document.getElementById('update-message');
        const actions = document.getElementById('update-actions');

        // Professional SVGs
        const ICONS = {
            search: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
            download: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
            check: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
            error: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
            install: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`
        };

        function showNotification(text, titleText = 'Actualización', type = 'search') {
            if (!notification) return;

            // Icon
            const icon = ICONS[type] || ICONS.search;
            title.innerHTML = `<span style="display:flex;align-items:center;gap:10px;">${icon} ${titleText}</span>`;
            message.textContent = text;

            // Styles based on type
            if (type === 'error') {
                notification.style.borderLeftColor = '#ef4444';
                title.style.color = '#ef4444';
            } else if (type === 'check') {
                notification.style.borderLeftColor = '#4caf50';
                title.style.color = '#4caf50';
            } else {
                notification.style.borderLeftColor = 'var(--primary)';
                title.style.color = 'var(--primary)';
            }

            // Display logic
            notification.style.display = 'block';
            // Slight delay to allow display:block to apply before adding class for transition
            requestAnimationFrame(() => {
                notification.classList.add('show');
            });
        }

        function hideNotification() {
            if (!notification) return;
            notification.classList.remove('show');
            // Wait for animation to finish before hiding
            setTimeout(() => {
                notification.style.display = 'none';
            }, 400);
        }

        // Event Delegation for Notification Buttons
        if (actions) {
            actions.addEventListener('click', (e) => {
                const dismissBtn = e.target.closest('.btn-dismiss');
                const updateBtn = e.target.closest('.btn-update');

                if (dismissBtn) {
                    hideNotification();
                } else if (updateBtn) {
                    ipcRenderer.send('restart_app');
                }
            });
        }

        ipcRenderer.on('checking_for_update', () => {
            showNotification('Buscando actualizaciones...', 'Buscando', 'search');
            if (actions) actions.innerHTML = ``;
        });

        ipcRenderer.on('update_available', (event, info) => {
            const versionInfo = info && info.version ? ` v${info.version}` : '';
            showNotification(`Nueva versión${versionInfo} disponible. Descargando...`, 'Actualizando', 'download');
            if (actions) actions.innerHTML = `<button class="btn-dismiss">Ocultar</button>`;
        });

        ipcRenderer.on('update_not_available', () => {
            // Success State
            showNotification('Tu sistema está actualizado.', 'Todo al día', 'check');
            if (actions) actions.innerHTML = `<button class="btn-dismiss" style="background:var(--primary); color:black; border:none; font-weight:bold;">Entendido</button>`;

            // Auto hide after 4s
            setTimeout(() => {
                // Only hide if it's still the "up to date" message
                if (notification && notification.classList.contains('show') && message && message.textContent.includes('actualizado')) {
                    hideNotification();
                }
            }, 4000);
        });

        ipcRenderer.on('update_downloaded', (event, info) => {
            const versionInfo = info && info.version ? ` v${info.version}` : '';
            showNotification(`¡Actualización${versionInfo} descargada! Lista para instalar.`, 'Actualización Lista', 'install');
            if (actions) {
                actions.innerHTML = `
                    <button class="btn-update" style="background:var(--primary);color:#000;font-weight:bold;">🚀 Reiniciar Ahora</button>
                    <button class="btn-dismiss">Más tarde</button>
                `;
            }
        });

        ipcRenderer.on('update_error', (event, err) => {
            // User-friendly error messages based on error type
            let userMessage = 'Error al actualizar';
            let errorType = 'error';

            if (err.includes('404') || err.includes('Cannot download')) {
                userMessage = 'La actualización aún se está compilando. Intenta de nuevo en 5 minutos.';
                errorType = 'search'; // Use search icon (less alarming)
            } else if (err.includes('net::') || err.includes('ENOTFOUND') || err.includes('ETIMEDOUT')) {
                userMessage = 'Sin conexión a internet. Verifica tu red e intenta nuevamente.';
            } else if (err.includes('ENOENT') || err.includes('path')) {
                userMessage = 'Error de instalación. Reinicia la aplicación e intenta de nuevo.';
            } else {
                userMessage = 'Error al actualizar. Intenta más tarde.';
                console.error('[UPDATE] Error:', err);
            }

            showNotification(userMessage, 'Aviso', errorType);
            if (actions) actions.innerHTML = `<button class="btn-dismiss">Cerrar</button>`;
        });
    } catch (err) {
        showDebugError('Error en inicialización', err);
    }
});

function setupEventListeners() {
    // Auth
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Member Management
    document.getElementById('add-member-form').addEventListener('submit', handleAddMember);
    document.getElementById('edit-member-form').addEventListener('submit', handleEditMember);

    document.getElementById('payment-form').addEventListener('submit', handleAddPayment);
    document.getElementById('edit-payment-form').addEventListener('submit', handleEditPayment);
    // Notes
    document.getElementById('notes-form').addEventListener('submit', handleSaveNotes);

    // Date Picker
    const datePicker = document.getElementById('operation-date-picker');
    if (datePicker) {
        datePicker.addEventListener('change', handleDatePickerChange);
    }

    // Search (Debounced)
    const searchInput = document.getElementById('search-member-input');
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const term = e.target.value.toLowerCase();
            applyMemberFilters(term);
        }, 300); // 300ms delay
    });


    // Payment History Table Actions (Delegation)
    const paymentsBody = document.getElementById('payments-history-body');
    if (paymentsBody) {
        paymentsBody.addEventListener('click', (e) => {
            // Edit Payment
            const editBtn = e.target.closest('.edit-payment-btn');
            if (editBtn) {
                const id = editBtn.dataset.id;
                const date = editBtn.dataset.date;
                const expiration = editBtn.dataset.expiration;
                const member = editBtn.dataset.member;
                const month = editBtn.dataset.month;
                const amount = editBtn.dataset.amount;
                openEditPaymentModal(id, date, expiration, member, month, amount);
                return;
            }

            // Delete Payment
            const deleteBtn = e.target.closest('.delete-payment-btn');
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                const member = deleteBtn.dataset.member;
                const month = deleteBtn.dataset.month;
                deletePayment(id, member, month);
            }
        });
    }

    // Payment Search Input (debounced)
    const paymentSearchInput = document.getElementById('search-payment-input');
    if (paymentSearchInput) {
        let paymentSearchTimer;
        paymentSearchInput.addEventListener('input', () => {
            clearTimeout(paymentSearchTimer);
            paymentSearchTimer = setTimeout(() => {
                filterPayments(paymentSearchInput.value);
            }, 300);
        });
    }
}

// --- Date Picker Functions ---
function initializeDatePicker() {
    const datePicker = document.getElementById('operation-date-picker');
    if (datePicker) {
        // Set to current date
        const yyyy = currentDate.getFullYear();
        const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentDate.getDate()).padStart(2, '0');
        datePicker.value = `${yyyy}-${mm}-${dd}`;
    }
}

function handleDatePickerChange(e) {
    const selectedDate = new Date(e.target.value + 'T12:00:00'); // Noon to avoid timezone issues
    if (!isNaN(selectedDate.getTime())) {
        currentDate = selectedDate;
        updateMonthDisplays();
        refreshCurrentView();
    }
}

window.setToday = function () {
    currentDate = new Date();
    updateMonthDisplays();
    initializeDatePicker();
    refreshCurrentView();
}

window.setCurrentMonth = function () {
    const now = new Date();
    currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
    updateMonthDisplays();
    initializeDatePicker();
    refreshCurrentView();
}

function refreshCurrentView() {
    const dashboardActive = document.getElementById('dashboard').classList.contains('active-section');
    const membersActive = document.getElementById('members').classList.contains('active-section');
    const paymentsActive = document.getElementById('payments').classList.contains('active-section');

    if (dashboardActive) loadDashboard();
    if (membersActive) loadMembers();
    if (paymentsActive) loadPaymentsHistory();
}

// --- Global Month Logic ---
window.changeGlobalMonth = function (offset) {
    // Set day to 1 before changing month to avoid overflow (e.g., Jan 31 → Feb 31 = Mar 3)
    currentDate.setDate(1);
    currentDate.setMonth(currentDate.getMonth() + offset);
    updateMonthDisplays();
    initializeDatePicker();
    refreshCurrentView();
}

// Helpers - getCurrentMonthISO uses imported transformDate
function getCurrentMonthISO() {
    return transformDate(currentDate);
}

function getFullDateDisplay() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    const dayName = days[currentDate.getDay()];
    const day = currentDate.getDate();
    const monthName = months[currentDate.getMonth()];
    const year = currentDate.getFullYear();

    return `${dayName}, ${day} de ${monthName} ${year}`;
}

function updateMonthDisplays() {
    const isoDate = getCurrentMonthISO();
    const monthName = getMonthName(isoDate);
    const fullDate = getFullDateDisplay();

    // Sidebar Label - Show full date
    document.getElementById('global-month-label').textContent = fullDate;

    // Headers - Show month/year
    document.getElementById('current-month-display').textContent = monthName;
    document.getElementById('members-month-display').textContent = monthName;
    document.getElementById('th-month-display').textContent = monthName;
    // Check if element exists before setting (safe check)
    if (document.getElementById('payments-month-display'))
        document.getElementById('payments-month-display').textContent = monthName;
}

// --- Auth ---
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        showApp();
    } else {
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');

    errorMsg.textContent = 'Iniciando sesión...';

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        errorMsg.textContent = 'Error: ' + error.message;
    } else {
        errorMsg.textContent = '';
        showApp();
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
    showLogin();
}

// --- Navigation ---
function showLogin() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('app-layout').classList.remove('active');
    document.getElementById('app-layout').classList.add('hidden');
}

function showApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-layout').classList.add('active');
    document.getElementById('app-layout').classList.remove('hidden');

    loadDashboard();
}

window.showSection = (sectionId, event) => {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active-section');
        sec.classList.add('hidden-section');
    });

    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active-section');
        targetSection.classList.remove('hidden-section');
    }

    // Update active nav
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active-nav'));
    if (event && event.target) { // Check if event is passed and has a target
        // Find the closest <li> parent to the clicked element
        const listItem = event.target.closest('li');
        if (listItem) {
            listItem.classList.add('active-nav');
        }
    } else {
        // Fallback for direct calls or initial load if event is not available
        if (sectionId === 'dashboard') document.querySelector('.sidebar li:nth-child(1)').classList.add('active-nav');
        if (sectionId === 'members') document.querySelector('.sidebar li:nth-child(2)').classList.add('active-nav');
        if (sectionId === 'payments') document.querySelector('.sidebar li:nth-child(3)').classList.add('active-nav');
    }

    // Load data for specific sections
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'members') loadMembers();
    if (sectionId === 'payments') loadPaymentsHistory();
};

// --- Dashboard ---
let dbRepaired = false; // Track if repair was already done this session

async function loadDashboard() {
    console.log('[DASHBOARD] Iniciando carga del dashboard (Optimized)...');

    // ===== AUTO-REPAIR (Non-blocking) =====
    if (!dbRepaired) {
        dbRepaired = true;
        repairDatabaseAsync();
    }

    // Get DOM elements
    const totalMembersEl = document.getElementById('total-members');
    const balanceEl = document.getElementById('monthly-balance');
    const growthEl = document.getElementById('growth-stat');
    const overdueEl = document.getElementById('overdue-count');

    // Show spinners
    if (totalMembersEl) totalMembersEl.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div>';
    if (balanceEl) balanceEl.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div>';

    try {
        const currentMonthISO = getCurrentMonthISO();
        const todayISO = new Date().toISOString();
        const prevMonth = getPreviousMonth(currentMonthISO);

        // ========== PARALLEL EXECUTION ==========
        // We run independent tasks in parallel:
        // 1. Dashboard Sub-modules (Charts, Stats, Notifications)
        // 2. Main Dashboard Queries (Balance, Active, Growth, Overdue)

        const dashboardQueriesPromise = Promise.all([
            // Query A: Current Month Payments (Balance)
            supabase.from('payments').select('amount, member_id').eq('month_year', currentMonthISO),

            // Query B: Active Payments (Active Count)
            supabase.from('payments').select('member_id').gte('expiration_date', todayISO),

            // Query C: Previous Month Payments (Growth)
            supabase.from('payments').select('member_id').eq('month_year', prevMonth),

            // Query D: Total Active Members (Overdue Calc)
            supabase.from('members').select('id', { count: 'exact', head: true }).eq('active', true)
        ]);

        // Trigger Sub-modules concurrently (don't await yet if we want UI to update piecemeal, 
        // but Promise.all is cleaner for "Dashboard Ready" state. 
        // However, these functions update the DOM directly, so we can just fire them.)
        const subModulesPromise = Promise.all([
            loadMembers(), // Critical: updates global cache
            loadAnnualSummary(),
            loadPaymentMethodsChart(),
            loadRetentionStats(),
            loadExpiringSoonCount(),
            checkAndShowNotifications()
        ]);

        // Await specific data needed for the TOP CARDS
        const [
            currMonthRes,
            activeRes,
            prevMonthRes,
            totalActiveRes
        ] = await dashboardQueriesPromise;

        // ========== PROCESS TOP CARDS ==========

        // 1. Balance
        const currentPayments = currMonthRes.data || [];
        let totalBalance = 0;
        currentPayments.forEach(p => totalBalance += parseFloat(p.amount || 0));
        if (balanceEl) balanceEl.textContent = formatCurrency(totalBalance);

        // 2. Active Members (use local set for dashboard display — don't overwrite global)
        const activePayments = activeRes.data || [];
        const dashboardActiveIds = new Set(activePayments.map(p => p.member_id));
        const activeCount = dashboardActiveIds.size;
        if (totalMembersEl) totalMembersEl.textContent = `${activeCount} Activos`;

        // 3. Growth
        const currCount = new Set(currentPayments.map(p => p.member_id)).size;
        const prevCount = new Set((prevMonthRes.data || []).map(p => p.member_id)).size;

        if (growthEl) {
            if (prevCount === 0) {
                growthEl.textContent = currCount > 0 ? "Nuevo mes" : "Sin datos previos";
                growthEl.className = currCount > 0 ? "text-success" : "";
            } else {
                const pct = (((currCount - prevCount) / prevCount) * 100).toFixed(1);
                growthEl.textContent = `${pct > 0 ? '+' : ''}${pct}% vs mes anterior`;
                growthEl.className = pct >= 0 ? "text-success" : "text-danger";
            }
        }

        // 4. Overdue
        const totalMembers = totalActiveRes.count || 0;
        const overdueCount = Math.max(0, totalMembers - activeCount);
        if (overdueEl) overdueEl.textContent = `${overdueCount} Vencidos`;

        log('[DASHBOARD] Top Cards Updated. Waiting for modules...');

        // Ensure all modules finished safely
        await subModulesPromise;
        log('[DASHBOARD] All modules loaded.');

    } catch (err) {
        console.error('[DASHBOARD] Critical Error:', err);
        if (totalMembersEl) totalMembersEl.textContent = "Error";
        if (balanceEl) balanceEl.textContent = "Error";
        ui.alert('Error cargando el dashboard. Revisa la conexión.', 'error');
    }
}

async function repairDatabaseAsync() {
    try {
        // 1. Fix month_year spaces
        const { data: allPayments } = await supabase.from('payments').select('id, month_year');
        if (allPayments?.length > 0) {
            for (const p of allPayments) {
                if (p.month_year?.includes(' ')) {
                    await supabase.from('payments').update({ month_year: p.month_year.replace(/\s/g, '') }).eq('id', p.id);
                }
            }
        }

        // 2. Remove duplicate payments (keep most recent per member+month)
        await removeDuplicatePayments();
    } catch (e) {
        console.error('[REPAIR] Error:', e);
    }
}

async function removeDuplicatePayments() {
    try {
        const { data: allPayments, error } = await supabase
            .from('payments')
            .select('id, member_id, month_year, created_at')
            .order('created_at', { ascending: false });

        if (error || !allPayments) return;

        // Group by member_id + month_year
        const groups = {};
        allPayments.forEach(p => {
            const key = `${p.member_id}_${p.month_year}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });

        // Find duplicates (groups with more than 1 entry)
        const idsToDelete = [];
        for (const key in groups) {
            const entries = groups[key];
            if (entries.length > 1) {
                // Keep the first (most recent by created_at), delete the rest
                for (let i = 1; i < entries.length; i++) {
                    idsToDelete.push(entries[i].id);
                }
            }
        }

        if (idsToDelete.length > 0) {
            console.log(`[REPAIR] Removing ${idsToDelete.length} duplicate payments...`);
            const { error: delError } = await supabase
                .from('payments')
                .delete()
                .in('id', idsToDelete);

            if (delError) {
                console.error('[REPAIR] Error deleting duplicates:', delError);
            } else {
                console.log(`[REPAIR] Successfully removed ${idsToDelete.length} duplicate payments.`);
            }
        }
    } catch (e) {
        console.error('[REPAIR] Duplicate removal error:', e);
    }
}

// ==========================================
// DIAGNÓSTICO DEL SISTEMA
// ==========================================
window.runDiagnostics = async function () {
    const results = [];
    results.push("=== DIAGNÓSTICO DEL SISTEMA ===\n");

    try {
        // 1. Verificar conexión a Supabase
        results.push("1. Verificando conexión a Supabase...");

        // 2. Consultar TODOS los pagos sin filtro
        const { data: allPayments, error: payErr } = await supabase
            .from('payments')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        if (payErr) {
            results.push(`   ❌ Error en payments: ${payErr.message}`);
        } else if (!allPayments || allPayments.length === 0) {
            results.push("   ⚠️ La tabla 'payments' está VACÍA o RLS bloquea todo.");
        } else {
            results.push(`   ✅ Encontrados ${allPayments.length} pagos recientes.`);
            const sample = allPayments[0];
            results.push(`   📋 Último pago:`);
            results.push(`      - month_year: "${sample.month_year}"`);
            results.push(`      - expiration_date: "${sample.expiration_date}"`);
            results.push(`      - amount: ${sample.amount}`);
        }

        // 3. Consultar miembros
        const { count: memberCount, error: memErr } = await supabase
            .from('members')
            .select('*', { count: 'exact', head: true });

        if (memErr) {
            results.push(`   ❌ Error en members: ${memErr.message}`);
        } else {
            results.push(`\n2. Miembros en DB: ${memberCount || 0}`);
        }

        // 4. Verificar mes actual
        const currentMonth = getCurrentMonthISO();
        results.push(`\n3. Mes actual seleccionado: "${currentMonth}"`);

        // 5. Pagos del mes actual
        const { data: thisMonthPayments } = await supabase
            .from('payments')
            .select('amount')
            .eq('month_year', currentMonth);

        results.push(`   Pagos encontrados para ${currentMonth}: ${thisMonthPayments?.length || 0}`);

        if (thisMonthPayments && thisMonthPayments.length > 0) {
            const total = thisMonthPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
            results.push(`   Balance calculado: ${formatCurrency(total)}`);
        }

    } catch (err) {
        results.push(`\n❌ ERROR CRÍTICO: ${err.message}`);
    }

    // Mostrar resultados
    alert(results.join('\n'));

    // Ofrecer reparación si hay problema de espacios
    if (confirm('¿Desea ejecutar la reparación automática de la base de datos?\n\nEsto corregirá espacios en el campo month_year.')) {
        await repairDatabase();
    }
};

// ==========================================
// REPARACIÓN DE BASE DE DATOS
// ==========================================
window.repairDatabase = async function () {
    try {
        // 1. Obtener todos los pagos
        const { data: allPayments, error } = await supabase
            .from('payments')
            .select('id, month_year');

        if (error) {
            alert('Error al obtener pagos: ' + error.message);
            return;
        }

        if (!allPayments || allPayments.length === 0) {
            alert('No hay pagos para reparar.');
            return;
        }

        let repaired = 0;

        // 2. Buscar y corregir registros con espacios
        for (const payment of allPayments) {
            const original = payment.month_year;
            // Eliminar TODOS los espacios
            const cleaned = original ? original.replace(/\s/g, '') : null;

            if (original !== cleaned && cleaned) {
                log(`[REPAIR] Corrigiendo: "${original}" -> "${cleaned}"`);

                const { error: updateError } = await supabase
                    .from('payments')
                    .update({ month_year: cleaned })
                    .eq('id', payment.id);

                if (!updateError) {
                    repaired++;
                } else {
                    console.error('[REPAIR] Error actualizando:', updateError);
                }
            }
        }

        const msg = `✅ REPARACIÓN COMPLETADA\n\nRegistros corregidos: ${repaired} de ${allPayments.length}\n\nRecargando dashboard...`;
        alert(msg);

        // 3. Recargar el dashboard
        loadDashboard();

    } catch (err) {
        alert('Error durante la reparación: ' + err.message);
        console.error('[REPAIR] Error:', err);
    }
};

// NEW: Expiring Soon Count
async function loadExpiringSoonCount() {
    try {
        const today = new Date();
        const sevenDaysLater = new Date(today);
        sevenDaysLater.setDate(today.getDate() + 7);

        const { data: expiringPayments, error } = await supabase
            .from('payments')
            .select('member_id, expiration_date')
            .gte('expiration_date', today.toISOString())
            .lte('expiration_date', sevenDaysLater.toISOString());

        if (error) {
            console.error('[EXPIRING] Error:', error.message);
            return;
        }

        const uniqueMembers = new Set(expiringPayments?.map(p => p.member_id) || []);
        const count = uniqueMembers.size;

        const countEl = document.getElementById('expiring-soon-count');
        if (countEl) countEl.textContent = count;

        // Add pulsing animation if there are expiring members
        const card = document.querySelector('.stat-card-reminder');
        if (card) {
            if (count > 0) {
                card.style.cursor = 'pointer';
                card.classList.add('stat-card-pulse');
            } else {
                card.style.cursor = 'default';
                card.classList.remove('stat-card-pulse');
            }
        }
    } catch (err) {
        console.error('[EXPIRING] Error loading expiring count:', err);
    }
}

// NEW: Show Expiring Members Modal
window.showExpiringMembers = async function () {
    const tbody = document.getElementById('expiring-members-body');
    const modal = document.getElementById('expiring-modal');

    if (!tbody || !modal) return;

    tbody.innerHTML = '<tr><td colspan="4"><div class="spinner"></div></td></tr>';
    modal.classList.remove('hidden');

    try {
        const today = new Date();
        const sevenDaysLater = new Date(today);
        sevenDaysLater.setDate(today.getDate() + 7);

        const { data: expiringPayments, error } = await supabase
            .from('payments')
            .select(`
                member_id,
                expiration_date,
                members(first_name, last_name, contact)
            `)
            .gte('expiration_date', today.toISOString())
            .lte('expiration_date', sevenDaysLater.toISOString())
            .order('expiration_date', { ascending: true });

        tbody.innerHTML = '';

        if (error) {
            tbody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!expiringPayments || expiringPayments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay alumnos próximos a vencer</td></tr>';
        } else {
            // Group by member_id to avoid duplicates
            const memberMap = new Map();
            expiringPayments.forEach(p => {
                if (!memberMap.has(p.member_id)) {
                    memberMap.set(p.member_id, p);
                }
            });

            memberMap.forEach(payment => {
                const expDate = new Date(payment.expiration_date);
                const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
                const memberName = payment.members ? `${payment.members.first_name} ${payment.members.last_name}` : 'Desconocido';
                const contact = payment.members?.contact || '-';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${memberName}</td>
                    <td>${contact}</td>
                    <td>${expDate.toLocaleDateString('es-AR')}</td>
                    <td class="${daysLeft <= 3 ? 'text-danger' : 'text-warning'}">${daysLeft} días</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error('[EXPIRING MODAL] Error:', err);
        tbody.innerHTML = '<tr><td colspan="4">Error al cargar datos</td></tr>';
    }
}

window.closeExpiringModal = function () {
    document.getElementById('expiring-modal').classList.add('hidden');
}



// NEW: Payment Methods Chart
let paymentMethodsChartInstance = null;

async function loadPaymentMethodsChart() {
    const chartContainer = document.getElementById('payment-methods-chart');
    if (!chartContainer) return;

    // Show spinner
    chartContainer.innerHTML = '<div class="spinner"></div>';

    try {
        const { data: payments, error } = await supabase
            .from('payments')
            .select('payment_method')
            .eq('month_year', getCurrentMonthISO());

        if (error) {
            console.error('[CHART] Error loading payment methods:', error.message);
            chartContainer.innerHTML = '<p class="empty-state">Error al cargar</p>';
            return;
        }

        // Restore canvas container
        chartContainer.innerHTML = '<canvas id="paymentMethodsChart"></canvas>';

        if (!payments || payments.length === 0) {
            chartContainer.innerHTML = '<p class="empty-state">No hay datos</p>';
            return;
        }

        // Count by method
        const methodCounts = {};
        payments.forEach(p => {
            const method = p.payment_method || 'Efectivo';
            methodCounts[method] = (methodCounts[method] || 0) + 1;
        });

        const ctx = document.getElementById('paymentMethodsChart').getContext('2d');

        if (paymentMethodsChartInstance) {
            paymentMethodsChartInstance.destroy();
        }

        paymentMethodsChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(methodCounts),
                datasets: [{
                    data: Object.values(methodCounts),
                    backgroundColor: [
                        'rgba(255, 214, 0, 0.8)',
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)'
                    ],
                    borderColor: '#1a1a1a',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 400  // Reduced from default 1000ms
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#fff',
                            font: { size: 11 }  // Smaller font
                        }
                    },
                    tooltip: {
                        enabled: true,
                        callbacks: {
                            label: function (context) {
                                return `${context.label}: ${context.parsed}`;
                            }
                        }
                    }
                },
                // Performance optimization
                interaction: {
                    mode: 'nearest',
                    intersect: true
                }
            }
        });
    } catch (err) {
        console.error('[CHART] Error loading payment methods chart:', err);
        chartContainer.innerHTML = '<p class="empty-state">Error al cargar gráfico</p>';
    }
}

// NEW: Retention Statistics
async function loadRetentionStats() {
    const rateEl = document.getElementById('retention-rate');
    const newEl = document.getElementById('new-members-count');
    const churnedEl = document.getElementById('churned-members-count');

    // Show loading state
    if (rateEl) rateEl.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div>';
    if (newEl) newEl.textContent = '...';
    if (churnedEl) churnedEl.textContent = '...';

    try {
        const currentMonth = getCurrentMonthISO();
        const prevMonth = getPreviousMonth(currentMonth);

        // Get current month payers
        const { data: currentPayers } = await supabase
            .from('payments')
            .select('member_id')
            .eq('month_year', currentMonth);

        // Get previous month payers
        const { data: prevPayers } = await supabase
            .from('payments')
            .select('member_id')
            .eq('month_year', prevMonth);

        const currentSet = new Set(currentPayers?.map(p => p.member_id) || []);
        const prevSet = new Set(prevPayers?.map(p => p.member_id) || []);

        // Calculate retention
        const retained = [...prevSet].filter(id => currentSet.has(id)).length;
        const newMembers = [...currentSet].filter(id => !prevSet.has(id)).length;
        const churned = [...prevSet].filter(id => !currentSet.has(id)).length;

        const retentionRate = prevSet.size > 0 ? ((retained / prevSet.size) * 100).toFixed(1) : 0;

        if (rateEl) rateEl.textContent = `${retentionRate}%`;
        if (newEl) newEl.textContent = newMembers;
        if (churnedEl) churnedEl.textContent = churned;
    } catch (err) {
        console.error('[RETENTION] Error loading retention stats:', err);
        if (rateEl) rateEl.textContent = '-';
        if (newEl) newEl.textContent = '-';
        if (churnedEl) churnedEl.textContent = '-';
    }
}

async function loadAnnualSummary() {
    const tbody = document.getElementById('annual-stats-body');
    const chartWrapper = document.querySelector('.chart-wrapper');
    const selectedYear = currentDate.getFullYear();

    // Update Header
    document.querySelector('.annual-summary h3').textContent = `Balance Anual ${selectedYear}`;

    // Show loading states
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner"></div> Cargando datos...</td></tr>';
    chartWrapper.innerHTML = '<div class="spinner"></div>';

    // Fetch payments for the SELECTED YEAR
    // We use a LIKE query for "YYYY-%"
    const { data: allYearPayments, error } = await supabase
        .from('payments')
        .select('month_year, amount, member_id')
        .like('month_year', `${selectedYear}-%`);

    // Restore chart canvas
    chartWrapper.innerHTML = '<canvas id="incomeChart"></canvas>';

    if (error) {
        tbody.innerHTML = '<tr><td colspan="4">Error al cargar datos anuales</td></tr>';
        return;
    }

    // Process data locally
    const statsByMonth = {};
    // Init months 1-12 for selectedYear
    for (let i = 1; i <= 12; i++) {
        const m = `${selectedYear}-${String(i).padStart(2, '0')}`;
        statsByMonth[m] = { income: 0, distinctMembers: new Set() };
    }

    allYearPayments.forEach(p => {
        if (statsByMonth[p.month_year]) {
            statsByMonth[p.month_year].income += parseFloat(p.amount);
            statsByMonth[p.month_year].distinctMembers.add(p.member_id);
        }
    });

    tbody.innerHTML = '';

    const months = Object.keys(statsByMonth).sort();

    months.forEach((m, index) => {
        const income = statsByMonth[m].income;
        const count = statsByMonth[m].distinctMembers.size;

        let growthText = "-";
        let growthClass = "";

        if (index > 0) {
            const prevM = months[index - 1];
            const prevC = statsByMonth[prevM].distinctMembers.size;
            if (prevC === 0) {
                // If prev was 0 and now we have, that's infinite growth technically, or 100%
                growthText = count > 0 ? "Nuevo" : "-";
                growthClass = count > 0 ? "text-success" : "";
            } else {
                const diff = count - prevC;
                const pct = ((diff / prevC) * 100).toFixed(0);
                growthText = `${pct > 0 ? '+' : ''}${pct}%`;
                growthClass = pct >= 0 ? "text-success" : "text-danger";
            }
        }

        // Feature: Click to navigate
        const tr = document.createElement('tr');
        tr.className = 'annual-row';
        tr.title = `Clic para ver ${getMonthName(m)}`;
        tr.onclick = () => {
            // Calculate difference in months from current view to clicked month
            const [tYear, tMonth] = m.split('-').map(Number);
            const targetDate = new Date(tYear, tMonth - 1, 1);

            // We can just set currentDate directly
            currentDate = targetDate;
            updateMonthDisplays();
            initializeDatePicker();

            // Refresh views (loadDashboard already calls loadMembers internally)
            loadDashboard();
        };

        // Add hover effect class
        tr.onmouseenter = () => tr.classList.add('row-hover');
        tr.onmouseleave = () => tr.classList.remove('row-hover');

        tr.innerHTML = `
            <td><strong>${getMonthName(m)}</strong></td>
            <td class="text-center">${count} <small style="opacity:0.7">alumnos</small></td>
            <td class="text-success"><strong>${formatCurrency(income)}</strong></td>
            <td class="text-center ${growthClass}"><strong>${growthText}</strong></td>
        `;

        // Highlight current month row
        if (m === getCurrentMonthISO()) {
            tr.classList.add('current-month-row');
        }

        tbody.appendChild(tr);
    });

    // --- RENDER CHART ---
    renderIncomeChart(statsByMonth, months);
}

// Global Chart Instance to destroy before re-creating
let incomeChartInstance = null;

function renderIncomeChart(statsByMonth, sortedMonths) {
    const ctx = document.getElementById('incomeChart').getContext('2d');

    // Prepare Data
    const labels = sortedMonths.map(m => {
        const [y, monthIndex] = m.split('-');
        const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        return names[parseInt(monthIndex) - 1]; // Short names
    });

    const dataPoints = sortedMonths.map(m => statsByMonth[m].income);

    // Destroy prev instance
    if (incomeChartInstance) {
        incomeChartInstance.destroy();
    }

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(255, 214, 0, 0.8)'); // Gold active
    gradient.addColorStop(1, 'rgba(255, 214, 0, 0.1)'); // Fade

    incomeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ingresos Mensuales ($)',
                data: dataPoints,
                backgroundColor: gradient,
                borderColor: '#FFD700',
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Performance optimizations
            animation: {
                duration: 300 // Faster animation
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#000',
                    titleColor: '#FFD700',
                    bodyColor: '#fff',
                    borderColor: '#333',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            return formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#333' },
                    ticks: { color: '#888' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#fff' }
                }
            },
            // Performance: reduce redraws
            interaction: {
                mode: 'nearest',
                intersect: true
            }
        }
    });
}

// --- Members ---
async function loadMembers() {
    const tbody = document.getElementById('members-table-body');
    tbody.innerHTML = '<tr><td colspan="5"><div class="spinner"></div></td></tr>';

    try {
        // Fetch Active Members
        const { data: members, error } = await supabase
            .from('members')
            .select('*')
            .eq('active', true)
            .order('last_name');

        if (error) {
            tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
            return;
        }

        // Cache them
        currentMembers = members || [];

        // Load payments for status check
        await loadMemberPaymentsStatus();

        // Initial Render
        renderMembersTable(currentMembers);

        // Update Quick Stats Chips immediately
        updateQuickStats();
    } catch (err) {
        console.error('[MEMBERS] Error loading members:', err);
        tbody.innerHTML = `<tr><td colspan="5">Error al cargar alumnos</td></tr>`;
    }
}



async function loadMemberPaymentsStatus() {
    // "Active" means they have a payment with expiration_date >= TODAY (real-time check).
    // Status is based on today's date, NOT the selected historical month.

    // Use date-only at start of day to avoid timezone issues with date comparisons
    const today = new Date();
    const todayDateOnly = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00`;

    // Fetch members who have a valid expiration date in the future (or today)
    const { data: payments, error } = await supabase
        .from('payments')
        .select('member_id')
        .gte('expiration_date', todayDateOnly);

    if (error) {
        console.error('[PAYMENTS STATUS] Error loading payment status:', error.message);
    }

    activeMemberIds = new Set(payments?.map(p => p.member_id) || []);

    return activeMemberIds;
}

// --- Pagination Logic ---
window.changePage = (direction) => {
    const maxPages = Math.ceil(filteredMembersCache.length / ITEMS_PER_PAGE) || 1;
    let newPage = currentPage + direction;

    if (newPage < 1) newPage = 1;
    if (newPage > maxPages) newPage = maxPages;

    if (newPage !== currentPage) {
        currentPage = newPage;
        renderPagination();
    }
}

function renderPagination() {
    // 1. Slice Data
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageData = filteredMembersCache.slice(start, end);

    // 2. Render Table
    const tbody = document.getElementById('members-table-body');
    tbody.innerHTML = '';

    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No se encontraron alumnos.</td></tr>';
        return;
    }

    pageData.forEach(member => {
        const isActive = activeMemberIds.has(member.id);
        const isOverdue = !isActive;
        const nameClass = isOverdue ? 'text-overdue' : '';
        const rowClass = isOverdue ? 'row-overdue' : '';

        const tr = document.createElement('tr');
        tr.className = rowClass;

        const statusBadge = isActive
            ? '<span class="status-badge paid"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>Al Día</span>'
            : '<span class="status-badge overdue"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>Vencido</span>';

        const safeNotes = member.notes ? member.notes.replace(/'/g, "\\'") : '';
        const fullName = `${member.first_name} ${member.last_name}`;
        const safeFirstName = member.first_name.replace(/'/g, "\\'");
        const safeLastName = member.last_name.replace(/'/g, "\\'");
        const safeContact = member.contact.replace(/'/g, "\\'");
        const safeScheduleTime = member.schedule_time || '';
        const safeAttendanceDays = member.attendance_days ? member.attendance_days.replace(/'/g, "\\'") : '[]';

        // Format schedule display
        let scheduleDisplay = '';
        if (member.schedule_time || member.attendance_days) {
            const timeDisplay = member.schedule_time ? `<span class="schedule-badge"><span class="time-icon"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></span>${member.schedule_time}</span>` : '';

            let daysDisplay = '';
            if (member.attendance_days) {
                try {
                    const daysArray = JSON.parse(member.attendance_days);
                    if (daysArray.length > 0) {
                        daysDisplay = `<div class="days-badge">${daysArray.map(d => `<span class="day-tag active">${d}</span>`).join('')}</div>`;
                    }
                } catch (e) { }
            }
            scheduleDisplay = `<div class="member-schedule">${timeDisplay}${daysDisplay}</div>`;
        }

        tr.innerHTML = `
            <td class="${nameClass}">${member.first_name}</td>
            <td class="${nameClass}">${member.last_name}</td>
            <td>${member.contact}${scheduleDisplay}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="action-btn" title="Enviar WhatsApp" onclick="sendQuickWhatsApp('${member.id}', '${safeFirstName}', '${safeContact}', ${isOverdue})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                </button>
                <button class="action-btn" title="Editar" onclick="openEditMemberModal('${member.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="action-btn" title="Pagar" onclick="openPaymentModal('${member.id}', '${fullName}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#F59E0B;"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                </button>
                <button class="action-btn" title="Observaciones Médicas" onclick="openNotesModal('${member.id}', '${fullName}', '${safeNotes}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#3B82F6;"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                </button>
                <button class="action-btn btn-delete" title="Eliminar Alumno" onclick="deleteMember('${member.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#ef4444;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 3. Update Controls
    const maxPages = Math.ceil(filteredMembersCache.length / ITEMS_PER_PAGE) || 1;
    document.getElementById('page-indicator').textContent = `Página ${currentPage} de ${maxPages}`;
    document.getElementById('prev-page-btn').disabled = currentPage === 1;
    document.getElementById('next-page-btn').disabled = currentPage === maxPages;

    // Style disabled buttons
    document.getElementById('prev-page-btn').style.opacity = currentPage === 1 ? '0.3' : '1';
    document.getElementById('next-page-btn').style.opacity = currentPage === maxPages ? '0.3' : '1';
}

function renderMembersTable(membersToRender) {
    // Override: Use Pagination Cache instead of direct render
    filteredMembersCache = membersToRender;
    currentPage = 1; // Reset to page 1 on new filter
    renderPagination();
}

// Filter Members
window.filterMembers = function (filter) {
    currentFilter = filter;

    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) {
            btn.classList.add('active');
        }
    });

    // Apply filters
    applyMemberFilters();
}

function applyMemberFilters(searchTerm = '') {
    let filtered = currentMembers;

    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(m =>
            (m.first_name || '').toLowerCase().includes(searchTerm) ||
            (m.last_name || '').toLowerCase().includes(searchTerm) ||
            (m.contact || '').toLowerCase().includes(searchTerm)
        );
    }

    // Apply status filter
    if (currentFilter === 'paid') {
        filtered = filtered.filter(m => activeMemberIds.has(m.id)); // Paid = Active/Al Día
    } else if (currentFilter === 'overdue') {
        filtered = filtered.filter(m => !activeMemberIds.has(m.id)); // Overdue = Not Active
    }

    // Apply sorting
    filtered = applySorting(filtered);

    renderMembersTable(filtered);

    // Update member count badge
    const totalCount = currentMembers.length;
    const filteredCount = filtered.length;
    const badge = document.getElementById('member-count-badge');
    if (badge) {
        if (currentFilter === 'all' && !searchTerm) {
            badge.textContent = `${totalCount} alumnos`;
        } else {
            badge.textContent = `${filteredCount} de ${totalCount} alumnos`;
        }
    }

    // Update Quick Stats Bar
    updateQuickStats();
}

// Update Quick Stats in Members Section
function updateQuickStats() {
    const paidCount = currentMembers.filter(m => activeMemberIds.has(m.id)).length;
    const overdueCount = currentMembers.filter(m => !activeMemberIds.has(m.id)).length;
    const totalCount = currentMembers.length;

    const paidEl = document.getElementById('quick-paid-count');
    const overdueEl = document.getElementById('quick-overdue-count');
    const totalEl = document.getElementById('quick-total-count');

    if (paidEl) paidEl.textContent = paidCount;
    if (overdueEl) overdueEl.textContent = overdueCount;
    if (totalEl) totalEl.textContent = totalCount;
}

// Export Members to Excel (CSV)
window.exportMembersToExcel = () => {
    // CSV Header
    let csvContent = '\uFEFF'; // BOM for UTF-8
    csvContent += 'Nombre,Apellido,Contacto,Estado,Horario,Notas\n';

    currentMembers.forEach(member => {
        const status = activeMemberIds.has(member.id) ? 'Al día' : 'Vencido';
        const schedule = member.schedule_time || '-';
        const notes = member.notes ? member.notes.replace(/"/g, '""') : '';

        const rowData = [
            `"${member.first_name}"`,
            `"${member.last_name}"`,
            `"${member.contact}"`,
            `"${status}"`,
            `"${schedule}"`,
            `"${notes}"`
        ];
        csvContent += rowData.join(',') + '\n';
    });

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `alumnos_${getCurrentMonthISO()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Free memory

    ui.alert('Lista de alumnos exportada correctamente', 'success');
}

// New: Apply sorting to members array
function applySorting(members) {
    const sorted = [...members]; // Create copy to avoid mutating original

    switch (currentSortOrder) {
        case 'last_name_asc':
            return sorted.sort((a, b) => a.last_name.localeCompare(b.last_name));
        case 'last_name_desc':
            return sorted.sort((a, b) => b.last_name.localeCompare(a.last_name));
        case 'first_name_asc':
            return sorted.sort((a, b) => a.first_name.localeCompare(b.first_name));
        case 'first_name_desc':
            return sorted.sort((a, b) => b.first_name.localeCompare(a.first_name));
        case 'created_at_desc':
            return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        case 'created_at_asc':
            return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        case 'status':
            // Overdue first, then paid
            return sorted.sort((a, b) => {
                const aOverdue = !activeMemberIds.has(a.id);
                const bOverdue = !activeMemberIds.has(b.id);
                if (aOverdue === bOverdue) return a.last_name.localeCompare(b.last_name);
                return aOverdue ? -1 : 1;
            });
        default:
            return sorted;
    }
}

// New: Change sort order
window.changeSortOrder = function (order) {
    currentSortOrder = order;
    applyMemberFilters(document.getElementById('search-member-input').value.toLowerCase());
}

// New: Change items per page
window.changeItemsPerPage = function (value) {
    if (value === 'all') {
        ITEMS_PER_PAGE = filteredMembersCache.length || 9999;
    } else {
        ITEMS_PER_PAGE = parseInt(value);
    }
    currentPage = 1; // Reset to first page
    renderPagination();
}

// NOTE: ui object is now imported from ./src/utils.js
// The following has been removed to avoid duplicate declaration:
// const ui = { ... } - moved to utils.js

// --- Add Member ---
window.openAddMemberModal = () => {
    // Reset form and checkboxes when opening
    document.getElementById('add-member-form').reset();
    document.getElementById('new-schedule-time').value = '';
    document.querySelectorAll('#new-days-selector input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.getElementById('add-member-modal').classList.remove('hidden');
};

window.closeAddMemberModal = () => {
    document.getElementById('add-member-modal').classList.add('hidden');
};

// Helper function to get selected days from a day selector
function getSelectedDays(selectorId) {
    const checkboxes = document.querySelectorAll(`#${selectorId} input[type="checkbox"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
}

// Helper function to set selected days in a day selector
function setSelectedDays(selectorId, days) {
    const daysArray = typeof days === 'string' ? JSON.parse(days || '[]') : (days || []);
    document.querySelectorAll(`#${selectorId} input[type="checkbox"]`).forEach(cb => {
        cb.checked = daysArray.includes(cb.value);
    });
}

async function handleAddMember(e) {
    e.preventDefault();
    const first_name = document.getElementById('new-name').value.trim();
    const last_name = document.getElementById('new-lastname').value.trim();
    const contact = document.getElementById('new-contact').value.trim();

    // Validation
    if (!validators.isNotEmpty(first_name)) {
        ui.alert('El nombre es obligatorio', 'error');
        return;
    }
    if (!validators.isNotEmpty(last_name)) {
        ui.alert('El apellido es obligatorio', 'error');
        return;
    }
    if (!validators.isNotEmpty(contact)) {
        ui.alert('El contacto es obligatorio', 'error');
        return;
    }

    // Disable button to prevent double submission
    const submitBtn = document.getElementById('save-member-btn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    // Get schedule data
    const schedule_time = document.getElementById('new-schedule-time').value || null;
    const attendance_days = JSON.stringify(getSelectedDays('new-days-selector'));

    const { data: newMemberData, error } = await supabase.from('members').insert([{
        first_name, last_name, contact, schedule_time, attendance_days
    }]).select().single();

    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;

    if (error) {
        ui.alert('Error al agregar: ' + error.message, 'error');
    } else {
        closeAddMemberModal();
        ui.alert('Alumno agregado correctamente.', 'success');
        loadMembers();
        loadDashboard();
        e.target.reset();

        // WhatsApp Automation: Welcome Message
        if (newMemberData && newMemberData.contact) {
            const confirmed = await ui.confirm(`¿Deseas enviar un mensaje de bienvenida a ${newMemberData.first_name} por WhatsApp?`);
            if (confirmed) {
                const msg = whatsappService.getWelcomeMessage(newMemberData);
                whatsappService.sendWhatsApp(newMemberData.contact, msg);
            }
        }
    }
}

// --- Edit Member ---
window.openEditMemberModal = async (id) => {
    // Lookup member in cache
    const member = currentMembers.find(m => m.id === id);
    if (!member) {
        ui.alert('Error: No se encontraron datos del alumno.', 'error');
        return;
    }

    document.getElementById('edit-member-id').value = member.id;
    document.getElementById('edit-name').value = member.first_name;
    document.getElementById('edit-lastname').value = member.last_name;
    document.getElementById('edit-contact').value = member.contact;
    document.getElementById('edit-schedule-time').value = member.schedule_time || '';

    // Safely parse attendance days
    let days = [];
    try {
        if (member.attendance_days) {
            days = JSON.parse(member.attendance_days);
        }
    } catch (e) {
        console.error('Error parsing attendance days', e);
    }

    // Reset all checkboxes first
    document.querySelectorAll('#edit-days-selector input[type="checkbox"]').forEach(cb => cb.checked = false);

    // Check correct ones
    if (Array.isArray(days)) {
        days.forEach(day => {
            const cb = document.querySelector(`#edit-days-selector input[value="${day}"]`);
            if (cb) cb.checked = true;
        });
    }

    document.getElementById('edit-member-modal').classList.remove('hidden');
};

window.closeEditMemberModal = () => {
    document.getElementById('edit-member-modal').classList.add('hidden');
};

async function handleEditMember(e) {
    e.preventDefault();
    const id = document.getElementById('edit-member-id').value;
    const first_name = document.getElementById('edit-name').value.trim();
    const last_name = document.getElementById('edit-lastname').value.trim();
    const contact = document.getElementById('edit-contact').value.trim();

    // Validation
    if (!validators.isNotEmpty(first_name)) {
        ui.alert('El nombre es obligatorio', 'error');
        return;
    }
    if (!validators.isNotEmpty(last_name)) {
        ui.alert('El apellido es obligatorio', 'error');
        return;
    }
    if (!validators.isNotEmpty(contact)) {
        ui.alert('El contacto es obligatorio', 'error');
        return;
    }

    // Disable button to prevent double submission
    const submitBtn = document.getElementById('update-member-btn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Actualizando...';

    // Get schedule data
    const schedule_time = document.getElementById('edit-schedule-time').value || null;
    const attendance_days = JSON.stringify(getSelectedDays('edit-days-selector'));

    const { error } = await supabase
        .from('members')
        .update({ first_name, last_name, contact, schedule_time, attendance_days })
        .eq('id', id);

    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;

    if (error) {
        ui.alert('Error al actualizar: ' + error.message, 'error');
    } else {
        closeEditMemberModal();
        ui.alert('Alumno actualizado correctamente.', 'success');
        loadMembers();
        // Reset the form using its ID rather than e.target which may not be the form
        const form = document.getElementById('edit-member-form');
        if (form) form.reset();
    }
}

// --- Delete Member (Soft Delete) ---
window.deleteMember = async (id) => {
    const confirmed = await ui.confirm('¿Estás seguro de que quieres eliminar a este alumno? Se archivará y no aparecerá en la lista activa, pero su historial de pagos se conservará.');
    if (!confirmed) return;

    // Soft Delete: active = false
    const { error } = await supabase
        .from('members')
        .update({ active: false })
        .eq('id', id);

    if (error) {
        ui.alert('Error al eliminar: ' + error.message, 'error');
    } else {
        ui.alert('Alumno eliminado (archivado) correctamente.', 'success');
        loadMembers();
        loadDashboard();
    }
}

// --- Payments ---
let isProcessingPayment = false; // Guard against double submission

window.openPaymentModal = (id, name) => {
    // Reset processing guard when opening modal
    isProcessingPayment = false;

    document.getElementById('payment-member-id').value = id;
    document.getElementById('payment-member-name').textContent = name;

    // Reset form fields completely before showing
    document.getElementById('payment-form').reset();
    document.getElementById('payment-amount').value = '';

    // Reset quick amount button visual states
    document.querySelectorAll('.quick-amount-btn').forEach(btn => {
        btn.style.transform = 'scale(1)';
        btn.style.background = 'transparent';
        btn.style.color = 'var(--primary)';
        btn.style.border = '1px solid var(--primary)';
    });

    // Reset payment method to default
    const methodSelect = document.getElementById('payment-method-select');
    if (methodSelect) methodSelect.selectedIndex = 0;

    // Re-enable submit button (may have been disabled from previous submission)
    const submitBtn = document.querySelector('#payment-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrar Pago';
    }

    // Generate Dynamic Month Options Strict
    generatePaymentMonthOptions();

    // Default to the *global view month* for convenience
    document.getElementById('payment-month').value = getCurrentMonthISO();

    // Re-set member id after form.reset() cleared it
    document.getElementById('payment-member-id').value = id;

    // Default Date -> Today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('payment-date-input').value = `${yyyy}-${mm}-${dd}`;

    // Default Expiration -> +1 Month
    const exp = new Date(today);
    exp.setDate(exp.getDate() + 30);
    const e_yyyy = exp.getFullYear();
    const e_mm = String(exp.getMonth() + 1).padStart(2, '0');
    const e_dd = String(exp.getDate()).padStart(2, '0');
    document.getElementById('payment-expiration-input').value = `${e_yyyy}-${e_mm}-${e_dd}`;

    document.getElementById('payment-modal').classList.remove('hidden');
};

// Quick amount selection
window.setQuickAmount = (amount, btnElement) => {
    document.getElementById('payment-amount').value = amount;
    // Visual feedback
    document.querySelectorAll('.quick-amount-btn').forEach(btn => {
        btn.style.transform = 'scale(1)';
        btn.style.background = 'transparent';
        btn.style.color = 'var(--primary)'; // Reset color
        btn.style.border = '1px solid var(--primary)';
    });

    if (btnElement) {
        btnElement.style.transform = 'scale(1.05)';
        btnElement.style.background = 'var(--primary)';
        btnElement.style.color = '#000';
    }
}

function generatePaymentMonthOptions() {
    const select = document.getElementById('payment-month');
    select.innerHTML = '';

    // Range: Last 6 months + Next 12 months from TODAY
    const now = new Date();
    // Start 6 months ago
    const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    for (let i = 0; i < 18; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const iso = transformDate(d);
        const name = getMonthName(iso); // e.g., "Enero 2026"

        const option = document.createElement('option');
        option.value = iso;
        option.textContent = name;
        select.appendChild(option);
    }
}

window.closePaymentModal = () => {
    document.getElementById('payment-modal').classList.add('hidden');
};

// --- Delete Payment ---
async function deletePayment(paymentId, memberName, monthName) {
    const confirmed = await ui.confirm(`¿Estás seguro de que quieres eliminar el pago de ${memberName} (${monthName})? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('payments')
            .delete()
            .eq('id', paymentId);

        if (error) {
            ui.alert('Error al eliminar el pago: ' + error.message, 'error');
        } else {
            ui.alert('Pago eliminado correctamente.', 'success');
            // If we're showing duplicates, refresh that view instead of the normal month view
            if (showingDuplicates) {
                showingDuplicates = false; // Reset so it re-fetches
                await showDuplicatePayments();
            } else {
                await loadPaymentsHistory();
            }
            await loadMembers();
            loadDashboard();
        }
    } catch (err) {
        console.error('[DELETE PAYMENT] Error:', err);
        ui.alert('Error inesperado al eliminar el pago.', 'error');
    }
}
window.deletePayment = deletePayment;

async function handleAddPayment(e) {
    e.preventDefault();

    // Guard against double submission (race condition protection)
    if (isProcessingPayment) {
        console.warn('[PAYMENTS] Payment already being processed, ignoring duplicate submit.');
        return;
    }

    const member_id = document.getElementById('payment-member-id').value;
    const month_year = document.getElementById('payment-month').value;
    const amount = document.getElementById('payment-amount').value;
    const payment_date_val = document.getElementById('payment-date-input').value; // YYYY-MM-DD
    const expiration_date_val = document.getElementById('payment-expiration-input').value; // YYYY-MM-DD
    const payment_method = document.getElementById('payment-method-select').value;

    // Basic field validation
    if (!member_id) {
        ui.alert('Error interno: no se identificó al alumno. Cierre el modal e intente de nuevo.', 'error');
        return;
    }
    if (!validators.isPositiveNumber(amount)) {
        ui.alert('El monto debe ser un número positivo', 'error');
        return;
    }
    if (!validators.isValidDate(payment_date_val)) {
        ui.alert('La fecha de pago no es válida', 'error');
        return;
    }
    if (!validators.isValidDate(expiration_date_val)) {
        ui.alert('La fecha de vencimiento no es válida', 'error');
        return;
    }

    // Validate that expiration is after payment date
    const paymentDate = new Date(payment_date_val + 'T12:00:00');
    const expirationDate = new Date(expiration_date_val + 'T12:00:00');
    if (expirationDate <= paymentDate) {
        ui.alert('La fecha de vencimiento debe ser posterior a la fecha de pago', 'error');
        return;
    }

    // Set processing guard BEFORE any async work
    isProcessingPayment = true;

    // Disable button to prevent double submission
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registrando...';

    try {
        // Check if student already paid for this month (server-side duplicate check)
        const { data: existingPayments, error: checkError } = await supabase
            .from('payments')
            .select('id')
            .eq('member_id', member_id)
            .eq('month_year', month_year.trim());

        if (checkError) {
            ui.alert('Error al verificar pagos existentes: ' + checkError.message, 'error');
            return;
        }

        if (existingPayments && existingPayments.length > 0) {
            ui.alert('Este alumno ya tiene un pago registrado para este mes. Use el botón de editar (✏️) en el historial de pagos para modificarlo.', 'error');
            return;
        }

        const { error } = await supabase.from('payments').insert([{
            member_id,
            month_year: month_year.trim(),
            amount: parseFloat(amount),
            payment_method,
            payment_date: new Date(payment_date_val + 'T12:00:00').toISOString(),
            expiration_date: new Date(expiration_date_val + 'T12:00:00').toISOString()
        }]);

        if (error) {
            ui.alert('Error: ' + error.message, 'error');
        } else {
            closePaymentModal();
            ui.alert('Pago registrado correctamente.', 'success');

            // Save references before refreshing
            const savedMemberId = member_id;
            const savedAmount = amount;
            const savedMonthYear = month_year;

            // Refresh data — await loadMembers first for immediate table update
            await loadMembers();
            loadDashboard();

            // WhatsApp Automation: Payment Confirmation
            const member = currentMembers.find(m => String(m.id) === String(savedMemberId));
            if (member && member.contact) {
                const monthName = getMonthName(savedMonthYear);
                const msg = whatsappService.getPaymentConfirmationMessage(member, savedAmount, monthName);

                // Try auto-send first if connected
                if (whatsappConnected) {
                    const sent = await autoSendWhatsApp(member.contact, msg, 'payment');
                    if (sent) {
                        console.log('[WhatsApp] Payment confirmation sent automatically');
                    }
                } else {
                    // Fallback to manual wa.me link
                    const confirmed = await ui.confirm(`¿Deseas enviar una confirmación de pago a ${member.first_name} por WhatsApp?`);
                    if (confirmed) {
                        whatsappService.sendWhatsApp(member.contact, msg);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[PAYMENTS] Error processing payment:', err);
        ui.alert('Error inesperado al registrar el pago. Intente de nuevo.', 'error');
    } finally {
        // Always re-enable button and reset guard
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        isProcessingPayment = false;
    }
}



// --- Medical Notes ---
window.openNotesModal = (id, name, currentNotes) => {
    document.getElementById('notes-member-id').value = id;
    document.getElementById('notes-member-name').textContent = name;
    // Decode if needed or just use as is. The onclick replacement might struggle with newlines.
    // Ideally we fetch fresh notes to avoid sync issues, but passing is faster for UI.
    // Let's actually fetch to be safe and clean.
    fetchAndShowNotes(id, name);
};

window.closeNotesModal = () => {
    document.getElementById('notes-modal').classList.add('hidden');
};

async function fetchAndShowNotes(id, name) {
    document.getElementById('notes-member-id').value = id;
    document.getElementById('notes-member-name').textContent = name;
    document.getElementById('member-notes').value = "Cargando...";
    document.getElementById('notes-modal').classList.remove('hidden');

    const { data, error } = await supabase
        .from('members')
        .select('notes')
        .eq('id', id)
        .single();

    if (!error && data) {
        document.getElementById('member-notes').value = data.notes || "";
    } else {
        document.getElementById('member-notes').value = "";
    }
}

async function handleSaveNotes(e) {
    e.preventDefault();
    const id = document.getElementById('notes-member-id').value;
    const notes = document.getElementById('member-notes').value;

    const { error } = await supabase
        .from('members')
        .update({ notes: notes })
        .eq('id', id);

    if (error) {
        ui.alert('Error al guardar notas: ' + error.message, 'error');
    } else {
        closeNotesModal();
        ui.alert('Observaciones guardadas.', 'success');
        loadMembers(); // Refresh to update the onclick attribute if we were using it, though we switched to fetch.
    }
}

// --- Quick WhatsApp from Table ---
// --- Quick WhatsApp from Table ---
window.sendQuickWhatsApp = (id, paramsFirstName, paramsContact, isOverdue) => {
    // Construct a temporary member object to match service expectation
    const mockMember = { first_name: paramsFirstName };

    // Use the service to generate consistent messages
    let msg = "";
    if (isOverdue) {
        // Use the standard expiration message
        msg = whatsappService.getExpirationMessage(mockMember);
    } else {
        // Use a friendly custom message for active members
        msg = whatsappService.getCustomMessage(mockMember, "Esperamos que estés disfrutando de tus entrenamientos. 💪\n\nCualquier consulta estamos a tu disposición.");
    }

    whatsappService.sendWhatsApp(paramsContact, msg);
};

// --- Edit Payment ---
window.openEditPaymentModal = (paymentId, paymentDate, expirationDate, memberName, monthName, amount) => {
    document.getElementById('edit-payment-id').value = paymentId;
    document.getElementById('edit-payment-member-name').textContent = memberName;
    document.getElementById('edit-payment-month').textContent = monthName;
    document.getElementById('edit-payment-amount').textContent = formatCurrency(amount);

    // Convert ISO dates to YYYY-MM-DD format for date inputs
    const paymentDateOnly = paymentDate.split('T')[0];
    const expirationDateOnly = expirationDate.split('T')[0];

    document.getElementById('edit-payment-date').value = paymentDateOnly;
    document.getElementById('edit-expiration-date').value = expirationDateOnly;

    document.getElementById('edit-payment-modal').classList.remove('hidden');
};

window.closeEditPaymentModal = () => {
    document.getElementById('edit-payment-modal').classList.add('hidden');
    document.getElementById('edit-payment-form').reset();
};

async function handleEditPayment(e) {
    e.preventDefault();

    const paymentId = document.getElementById('edit-payment-id').value;
    const payment_date_val = document.getElementById('edit-payment-date').value;
    const expiration_date_val = document.getElementById('edit-expiration-date').value;

    // Validation
    if (!validators.isValidDate(payment_date_val)) {
        ui.alert('La fecha de pago no es válida', 'error');
        return;
    }
    if (!validators.isValidDate(expiration_date_val)) {
        ui.alert('La fecha de vencimiento no es válida', 'error');
        return;
    }

    // Validate that expiration is after payment date
    const paymentDate = new Date(payment_date_val + 'T12:00:00');
    const expirationDate = new Date(expiration_date_val + 'T12:00:00');
    if (expirationDate <= paymentDate) {
        ui.alert('La fecha de vencimiento debe ser posterior a la fecha de pago', 'error');
        return;
    }

    // Disable button to prevent double submission
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    try {
        const { error } = await supabase
            .from('payments')
            .update({
                payment_date: new Date(payment_date_val + 'T12:00:00').toISOString(),
                expiration_date: new Date(expiration_date_val + 'T12:00:00').toISOString()
            })
            .eq('id', paymentId);

        if (error) {
            ui.alert('Error: ' + error.message, 'error');
        } else {
            closeEditPaymentModal();
            ui.alert('Fechas actualizadas correctamente.', 'success');
            await loadPaymentsHistory();
            await loadMembers();
            loadDashboard();
        }
    } catch (err) {
        console.error('[EDIT PAYMENT] Error:', err);
        ui.alert('Error inesperado al actualizar el pago.', 'error');
    } finally {
        // Always re-enable button
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// --- History ---
let cachedPayments = null; // Cache payments to avoid re-fetching when toggling view

async function loadPaymentsHistory() {
    const tbody = document.getElementById('payments-history-body');
    tbody.innerHTML = '<tr><td colspan="6"><div class="spinner"></div></td></tr>';

    // Get the selected month's start and end dates
    const selectedMonth = getCurrentMonthISO();
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const { data: payments, error } = await supabase
        .from('payments')
        .select(`
            id,
            created_at,
            payment_date,
            expiration_date,
            month_year,
            amount,
            payment_method,
            member_id,
            members(first_name, last_name)
        `)
        .gte('payment_date', startDate.toISOString())
        .lte('payment_date', endDate.toISOString())
        .order('payment_date', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
        return;
    }

    // Cache payments
    cachedPayments = payments;

    // Reset duplicates view state
    showingDuplicates = false;
    const dupBtn = document.getElementById('show-duplicates-btn');
    if (dupBtn) {
        dupBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="2" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg> Ver Duplicados`;
    }

    // Clear search input on fresh load
    const searchInput = document.getElementById('search-payment-input');
    if (searchInput) searchInput.value = '';

    // Render based on current view mode
    renderPaymentsHistory(payments);
}

function renderPaymentsHistory(payments) {
    const tbody = document.getElementById('payments-history-body');

    // Calculate summary
    let totalAmount = 0;
    payments.forEach(p => totalAmount += parseFloat(p.amount));

    // Update summary card
    document.getElementById('payments-total').textContent = formatCurrency(totalAmount);
    document.getElementById('payments-count').textContent = payments.length;

    tbody.innerHTML = '';

    if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay pagos registrados en este mes.</td></tr>';
        return;
    }

    // Always render detailed view
    renderDetailedView(payments, tbody);
}

function filterPayments(searchTerm) {
    if (!cachedPayments) return;

    const term = searchTerm.toLowerCase().trim();
    if (!term) {
        renderPaymentsHistory(cachedPayments);
        return;
    }

    const filtered = cachedPayments.filter(p => {
        const firstName = p.members?.first_name?.toLowerCase() || '';
        const lastName = p.members?.last_name?.toLowerCase() || '';
        const fullName = `${firstName} ${lastName}`;
        const method = (p.payment_method || '').toLowerCase();
        const amount = String(p.amount || '');

        return firstName.includes(term) || lastName.includes(term) ||
            fullName.includes(term) || method.includes(term) || amount.includes(term);
    });

    renderPaymentsHistory(filtered);
}

// --- Show Duplicate Payments ---
let showingDuplicates = false;

window.showDuplicatePayments = async function () {
    const btn = document.getElementById('show-duplicates-btn');

    // Toggle back to normal view
    if (showingDuplicates) {
        showingDuplicates = false;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="2" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg> Ver Duplicados`;
        loadPaymentsHistory();
        return;
    }

    const tbody = document.getElementById('payments-history-body');
    tbody.innerHTML = '<tr><td colspan="6"><div class="spinner"></div></td></tr>';

    // Fetch ALL payments (not filtered by month)
    const { data: allPayments, error } = await supabase
        .from('payments')
        .select(`id, created_at, payment_date, expiration_date, month_year, amount, payment_method, member_id,
                 members(first_name, last_name)`)
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
        return;
    }

    // Group by member_id + month_year
    const groups = {};
    allPayments.forEach(p => {
        const key = `${p.member_id}_${p.month_year}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    });

    // Get only duplicate groups
    const duplicates = [];
    for (const key in groups) {
        if (groups[key].length > 1) {
            groups[key].forEach(p => duplicates.push(p));
        }
    }

    showingDuplicates = true;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
    </svg> Volver a Pagos del Mes`;

    // Update summary
    document.getElementById('payments-total').textContent = `${duplicates.length} pagos duplicados`;
    document.getElementById('payments-count').textContent = duplicates.length;

    tbody.innerHTML = '';

    if (duplicates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">✅ No se encontraron pagos duplicados.</td></tr>';
        return;
    }

    renderDetailedView(duplicates, tbody);
};

function renderGroupedView(payments, tbody) {
    // Group payments by member and month_year to avoid duplicates
    const memberPayments = {};

    payments.forEach(p => {
        const memberId = p.member_id;
        const monthYear = p.month_year;

        if (!memberPayments[memberId]) {
            memberPayments[memberId] = {
                name: p.members ? `${p.members.first_name} ${p.members.last_name}` : 'Desconocido',
                monthPayments: {}, // Store one payment per month
                total: 0
            };
        }

        // Only keep the latest payment for each month_year
        if (!memberPayments[memberId].monthPayments[monthYear]) {
            memberPayments[memberId].monthPayments[monthYear] = p;
            memberPayments[memberId].total += parseFloat(p.amount);
        }
    });

    // Sort by name
    const sortedMembers = Object.entries(memberPayments).sort((a, b) =>
        a[1].name.localeCompare(b[1].name)
    );

    sortedMembers.forEach(([memberId, data]) => {
        const tr = document.createElement('tr');
        tr.className = 'grouped-row';

        // Get unique months paid
        const monthsPaid = Object.keys(data.monthPayments).map(m => getMonthName(m));
        const monthsText = monthsPaid.join(', ');

        // Get payment methods from unique month payments
        const methods = [...new Set(Object.values(data.monthPayments).map(p => p.payment_method || 'Efectivo'))];
        const methodsText = methods.join(', ');

        // Get payment count (unique months)
        const paymentCount = Object.keys(data.monthPayments).length;

        tr.innerHTML = `
            <td><strong>${data.name}</strong> <small style="opacity:0.7">(${paymentCount} mes${paymentCount > 1 ? 'es' : ''})</small></td>
            <td>${monthsText}</td>
            <td>${methodsText}</td>
            <td><strong>${formatCurrency(data.total)}</strong></td>
        `;

        tbody.appendChild(tr);
    });
}

function renderDetailedView(payments, tbody) {
    payments.forEach(p => {
        const paymentDate = formatDate(p.payment_date);
        const expirationDate = formatDate(p.expiration_date);
        const memberName = p.members ? `${p.members.first_name} ${p.members.last_name}` : 'Alumno Eliminado/Desconocido';
        const paymentMethod = p.payment_method || 'Efectivo';
        const amount = formatCurrency(p.amount);
        const monthName = getMonthName(p.month_year);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${paymentDate}</td>
            <td>${memberName}</td>
            <td>${monthName}</td>
            <td>${paymentMethod}</td>
            <td>${amount}</td>
            <td>
                <button class="action-btn edit-payment-btn" 
                    title="Editar Fechas"
                    data-id="${p.id}"
                    data-date="${p.payment_date}"
                    data-expiration="${p.expiration_date}"
                    data-member="${memberName.replace(/"/g, '&quot;')}"
                    data-month="${monthName.replace(/"/g, '&quot;')}"
                    data-amount="${p.amount}">
                    ✏️
                </button>
                <button class="action-btn delete-payment-btn" 
                    title="Eliminar Pago"
                    data-id="${p.id}"
                    data-member="${memberName.replace(/"/g, '&quot;')}"
                    data-month="${monthName.replace(/"/g, '&quot;')}">
                    🗑️
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- PDF Export Logic ---
window.exportMonthlyReport = () => {
    try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            ui.alert('La librería PDF no está disponible. Recarga la página e intenta de nuevo.', 'error');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Title
        doc.setFontSize(18);
        doc.text(`Reporte Mensual - ${document.getElementById('current-month-display').textContent}`, 14, 22);

        // Summary Headers
        doc.setFontSize(12);
        doc.text(`Total Alumnos Pagos: ${document.getElementById('total-members').textContent}`, 14, 32);
        doc.text(`Balance: ${document.getElementById('monthly-balance').textContent}`, 14, 40);

        const elem = document.querySelector('.small-table table');
        doc.autoTable({
            html: elem,
            startY: 50,
            theme: 'grid',
            headStyles: { fillColor: [255, 215, 0], textColor: [0, 0, 0] }
        });

        doc.save(`reporte_${getCurrentMonthISO()}.pdf`);
        ui.alert('Reporte exportado correctamente', 'success');
    } catch (err) {
        console.error('Export Error:', err);
        ui.alert('Error al exportar PDF: ' + err.message, 'error');
    }
}

// Export Payments to PDF
window.exportPaymentsToPDF = () => {
    try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            ui.alert('La librería PDF no está disponible. Recarga la página e intenta de nuevo.', 'error');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const monthDisplay = document.getElementById('payments-month-display').textContent;
        const paymentsTotal = document.getElementById('payments-total').textContent;
        const paymentsCount = document.getElementById('payments-count').textContent;

        // Title
        doc.setFontSize(18);
        doc.setTextColor(255, 215, 0);
        doc.text('AyD Funcional Gym', 14, 20);

        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.text(`Historial de Pagos - ${monthDisplay}`, 14, 30);

        // Summary
        doc.setFontSize(11);
        doc.setTextColor(180, 180, 180);
        doc.text(`Total Recaudado: ${paymentsTotal}`, 14, 42);
        doc.text(`Cantidad de Pagos: ${paymentsCount}`, 14, 50);
        doc.text(`Fecha de exportación: ${new Date().toLocaleDateString('es-AR')}`, 14, 58);

        // Table
        const table = document.querySelector('#payments-history-body');
        const rows = table.querySelectorAll('tr');

        const tableData = [];
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 5) {
                tableData.push([
                    cells[0].textContent.trim(),
                    cells[1].textContent.trim(),
                    cells[2].textContent.trim(),
                    cells[3].textContent.trim(),
                    cells[4].textContent.trim()
                ]);
            }
        });

        doc.autoTable({
            head: [['Fecha', 'Alumno', 'Mes Pagado', 'Método', 'Monto']],
            body: tableData,
            startY: 65,
            theme: 'grid',
            headStyles: { fillColor: [255, 215, 0], textColor: [0, 0, 0], fontStyle: 'bold' },
            bodyStyles: { textColor: [200, 200, 200] },
            alternateRowStyles: { fillColor: [30, 30, 30] },
            styles: { fillColor: [20, 20, 20] }
        });

        doc.save(`pagos_${getCurrentMonthISO()}.pdf`);
        ui.alert('PDF exportado correctamente', 'success');
    } catch (err) {
        console.error('Export Error:', err);
        ui.alert('Error al exportar PDF: ' + err.message, 'error');
    }
}

// Export Payments to Excel (CSV format for universal compatibility)
window.exportPaymentsToExcel = () => {
    const monthDisplay = document.getElementById('payments-month-display').textContent;
    const table = document.querySelector('#payments-history-body');
    const rows = table.querySelectorAll('tr');

    // CSV Header
    let csvContent = '\uFEFF'; // BOM for UTF-8
    csvContent += 'Fecha de Pago,Alumno,Mes Pagado,Método,Monto\n';

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
            const rowData = [
                `"${cells[0].textContent.trim()}"`,
                `"${cells[1].textContent.trim()}"`,
                `"${cells[2].textContent.trim()}"`,
                `"${cells[3].textContent.trim()}"`,
                `"${cells[4].textContent.trim()}"`
            ];
            csvContent += rowData.join(',') + '\n';
        }
    });

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `pagos_${getCurrentMonthISO()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Free memory

    ui.alert('Excel (CSV) exportado correctamente', 'success');
}

// NOTE: formatDate is now imported from ./src/utils.js

// ===== KEYBOARD SHORTCUTS =====
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ignore if user is typing in an input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Alt + D: Dashboard
        if (e.altKey && e.key === 'd') {
            e.preventDefault();
            showSection('dashboard');
        }

        // Alt + M: Members
        if (e.altKey && e.key === 'm') {
            e.preventDefault();
            showSection('members');
        }

        // Alt + P: Payments
        if (e.altKey && e.key === 'p') {
            e.preventDefault();
            showSection('payments');
        }

        // Alt + N: New Member
        if (e.altKey && e.key === 'n') {
            e.preventDefault();
            openAddMemberModal();
        }

        // Alt + T: Today
        if (e.altKey && e.key === 't') {
            e.preventDefault();
            setToday();
        }

        // Alt + R: Expiring Reminders
        if (e.altKey && e.key === 'r') {
            e.preventDefault();
            showExpiringMembers();
        }

        // Arrow Left: Previous Month
        if (e.altKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            changeGlobalMonth(-1);
        }

        // Arrow Right: Next Month
        if (e.altKey && e.key === 'ArrowRight') {
            e.preventDefault();
            changeGlobalMonth(1);
        }

        // Escape: Close all modals, alerts, and notification center
        if (e.key === 'Escape') {
            // Close known modals
            closeAddMemberModal();
            closeEditMemberModal();
            closePaymentModal();
            closeNotesModal();
            closeExpiringModal();
            closeWhatsAppModal();
            closeEditPaymentModal();

            // Close any visible generic modals
            document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
                modal.classList.add('hidden');
            });

            // Close alert overlays
            const alertOverlay = document.getElementById('alert-overlay');
            if (alertOverlay) alertOverlay.remove();

            // Close notification center modal
            const notifModal = document.getElementById('notification-center-modal');
            if (notifModal) notifModal.remove();
        }

        // F1: Show keyboard shortcuts help
        if (e.key === 'F1') {
            e.preventDefault();
            showKeyboardShortcutsHelp();
        }
    });
}

// Show keyboard shortcuts help
function showKeyboardShortcutsHelp() {
    const shortcuts = `
    < div style = "text-align: left; line-height: 1.8;" >
            <h3 style="color: var(--primary); margin-bottom: 15px;">⌨️ Atajos de Teclado</h3>
            <p><strong>Alt + D</strong> - Ir a Dashboard</p>
            <p><strong>Alt + M</strong> - Ir a Alumnos</p>
            <p><strong>Alt + P</strong> - Ir a Pagos</p>
            <p><strong>Alt + N</strong> - Nuevo Alumno</p>
            <p><strong>Alt + T</strong> - Ir a Hoy</p>
            <p><strong>Alt + R</strong> - Ver Recordatorios</p>
            <p><strong>Alt + ←/→</strong> - Mes Anterior/Siguiente</p>
            <p><strong>Esc</strong> - Cerrar Modales</p>
            <p><strong>F1</strong> - Mostrar esta ayuda</p>
        </div >
    `;

    const container = document.getElementById('alert-container');
    const alertBox = document.createElement('div');
    alertBox.id = 'alert-overlay';
    alertBox.innerHTML = `
    < div class="alert-box info-type" >
        ${shortcuts}
<button onclick="this.closest('#alert-overlay').remove()" style="margin-top: 15px;">Cerrar</button>
        </div >
    `;
    container.appendChild(alertBox);
}

// ===== MOBILE SIDEBAR TOGGLE =====
function initMobileSidebar() {
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!menuToggle || !sidebar || !overlay) return;

    // Toggle sidebar on menu button click
    menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('active');
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');

        // Prevent body scroll when sidebar is open
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
    });

    // Close sidebar when clicking overlay
    overlay.addEventListener('click', closeMobileSidebar);

    // Close sidebar when clicking a menu item
    sidebar.querySelectorAll('li').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeMobileSidebar();
            }
        });
    });

    // Close sidebar on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeMobileSidebar();
        }
    });

    // Handle resize - close sidebar if switching to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
            closeMobileSidebar();
        }
    });
}

function closeMobileSidebar() {
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    menuToggle?.classList.remove('active');
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
}

// Initialize mobile sidebar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initMobileSidebar();
});

// ===== DATA LABELS FOR MOBILE TABLES =====
// This function adds data-label attributes to table cells for mobile card view
function addDataLabelsToTable(tableId, labels) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
            if (labels[index]) {
                cell.setAttribute('data-label', labels[index]);
            }
        });
    });
}

// Wrapper function to refresh all table labels
function refreshMobileTableLabels() {
    // Members table
    addDataLabelsToTable('members-table-body', ['Nombre', 'Apellido', 'Contacto', 'Cuota', 'Acciones']);

    // Payments table
    addDataLabelsToTable('payments-history-body', ['Fecha', 'Alumno', 'Mes Pagado', 'Método', 'Monto', 'Acciones']);

    // Annual stats table
    addDataLabelsToTable('annual-stats-body', ['Mes', 'Alumnos', 'Ingresos', 'Crecimiento']);

    // Expiring members table
    addDataLabelsToTable('expiring-members-body', ['Alumno', 'Contacto', 'Vence', 'Días']);
}

// Call after rendering tables - we'll hook into existing functions
const originalRenderMembersTable = typeof renderMembersTable === 'function' ? renderMembersTable : null;

// Auto-refresh labels when DOM changes (for dynamic content)
if (typeof MutationObserver !== 'undefined') {
    const tablesObserver = new MutationObserver(() => {
        requestAnimationFrame(refreshMobileTableLabels);
    });

    document.addEventListener('DOMContentLoaded', () => {
        const tables = ['members-table-body', 'payments-history-body', 'annual-stats-body', 'expiring-members-body'];
        tables.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                tablesObserver.observe(el, { childList: true, subtree: true });
            }
        });

        // Initial labels
        setTimeout(refreshMobileTableLabels, 100);
    });
}

// --- WhatsApp Automation & Notification Center ---



function showNotificationModal(notifications) {
    // Create Modal HTML dynamically if not exists
    let modal = document.getElementById('notification-center-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'notification-center-modal';
        modal.className = 'modal';
        modal.style.cssText = 'display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999;';

        modal.innerHTML = `
            <div class="modal-content" style="max-width:750px; width:95%; max-height:85vh; overflow:hidden; display:flex; flex-direction:column;">
                <span class="close-btn" onclick="document.getElementById('notification-center-modal').remove()" style="position:absolute; right:15px; top:10px; font-size:1.8rem; cursor:pointer; color:#999; z-index:10;">&times;</span>
                <h2 style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    Centro de Notificaciones
                </h2>
                <p style="margin-bottom:15px; color:#888; font-size:0.9rem;">Se han detectado avisos automáticos pendientes de enviar.</p>
                
                <div style="flex:1; overflow-y:auto; margin-bottom:15px;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="text-align:left; border-bottom:2px solid var(--primary);">
                                <th style="padding:12px 10px; color:var(--primary); font-weight:600;">Alumno</th>
                                <th style="padding:12px 10px; color:var(--primary); font-weight:600;">Estado</th>
                                <th style="padding:12px 10px; color:var(--primary); font-weight:600;">Teléfono</th>
                                <th style="padding:12px 10px; color:var(--primary); font-weight:600; text-align:center;">WhatsApp</th>
                            </tr>
                        </thead>
                        <tbody id="notification-list-body"></tbody>
                    </table>
                </div>
                
                <div style="display:flex; gap:15px; justify-content:flex-end; padding-top:15px; border-top:1px solid #333;">
                    <button id="send-all-whatsapp-btn" class="btn-primary" style="display:flex; align-items:center; gap:8px; background:#25D366; border-color:#25D366;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Enviar Todo
                    </button>
                    <button class="btn-primary" onclick="document.getElementById('notification-center-modal').remove()" style="background:transparent; border:1px solid #666; color:#fff;">
                        Cerrar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const tbody = modal.querySelector('#notification-list-body');
    tbody.innerHTML = '';

    notifications.forEach((notif, index) => {
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid #333; transition:background 0.2s;';
        tr.onmouseover = () => tr.style.background = 'rgba(255,214,0,0.05)';
        tr.onmouseout = () => tr.style.background = 'transparent';

        const isWarning = notif.type === 'warning';
        const statusBadge = isWarning
            ? `<span style="display:inline-flex; align-items:center; gap:5px; padding:4px 10px; background:rgba(255,167,38,0.15); color:#FFA726; border-radius:12px; font-size:0.8rem; font-weight:500;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Vence pronto
               </span>`
            : `<span style="display:inline-flex; align-items:center; gap:5px; padding:4px 10px; background:rgba(255,82,82,0.15); color:#FF5252; border-radius:12px; font-size:0.8rem; font-weight:500;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                Vencido
               </span>`;

        tr.innerHTML = `
            <td style="padding:14px 10px; font-weight:500;">${notif.member.first_name} ${notif.member.last_name}</td>
            <td style="padding:14px 10px;">${statusBadge}</td>
            <td style="padding:14px 10px; color:#aaa; font-family:monospace; font-size:0.9rem;">${notif.member.contact || 'Sin teléfono'}</td>
            <td style="padding:14px 10px; text-align:center;">
                <button id="btn-send-${index}" style="display:inline-flex; align-items:center; gap:6px; padding:8px 14px; background:#25D366; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:500; font-size:0.85rem; transition:all 0.2s;" 
                    onmouseover="this.style.background='#128C7E'; this.style.transform='scale(1.05)';"
                    onmouseout="this.style.background='#25D366'; this.style.transform='scale(1)';"
                    title="Enviar mensaje por WhatsApp">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Enviar
                </button>
            </td>
        `;

        tbody.appendChild(tr);

        // Attach listener for individual send
        const btn = tr.querySelector(`#btn-send-${index}`);
        btn.onclick = async () => {
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0;display:inline-block;border-color:#fff transparent #fff transparent;"></div>';

            let sent = false;
            const type = notif.type === 'warning' ? 'warning' : 'overdue';

            // Try auto-send if connected
            if (whatsappConnected) {
                sent = await autoSendWhatsApp(notif.member.contact, notif.message, type);
            }

            if (!sent) {
                // Fallback to manual wa.me link
                whatsappService.sendWhatsApp(notif.member.contact, notif.message);
                sent = true;
            }

            if (sent) {
                // Mark as sent in DB
                const updateField = notif.type === 'warning' ? 'warning_sent' : 'expiration_sent';
                await supabase
                    .from('payments')
                    .update({ [updateField]: true })
                    .eq('id', notif.paymentId);

                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Enviado';
                btn.style.background = 'rgba(76,175,80,0.2)';
                btn.style.color = '#4caf50';
                tr.style.opacity = '0.5';
            }
        };
    });

    // Store notifications for batch send
    window._pendingNotifications = notifications;

    // Setup Send All button
    const sendAllBtn = modal.querySelector('#send-all-whatsapp-btn');
    if (sendAllBtn) {
        sendAllBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Enviar Todo (${notifications.length})
        `;
        sendAllBtn.onclick = async () => {
            sendAllBtn.disabled = true;
            sendAllBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0;display:inline-block;border-color:#fff transparent #fff transparent;"></div> Enviando...';

            let sentCount = 0;
            for (let i = 0; i < notifications.length; i++) {
                const btn = document.getElementById(`btn-send-${i}`);
                if (btn && !btn.disabled) {
                    btn.click();
                    sentCount++;
                    // Delay between sends to avoid rate limiting
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            sendAllBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> ${sentCount} enviados`;
            sendAllBtn.style.background = 'rgba(76,175,80,0.3)';
        };
    }

    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
}

// --- Refactored Notification Logic ---

window.checkAndShowNotifications = async function (forceShow = false) {
    console.log("Checking for notifications... Force:", forceShow);
    const today = new Date();

    // Calculate dates for Warning (7 days from now)
    const startWarning = new Date(today); startWarning.setDate(today.getDate() + 6);
    const endWarning = new Date(today); endWarning.setDate(today.getDate() + 8);

    // Fetch Warnings
    const { data: warningPayments } = await supabase
        .from('payments')
        .select(`
            id, expiration_date, member_id, 
            members!inner(id, first_name, last_name, contact, active)
        `)
        .eq('warning_sent', false)
        .eq('members.active', true)
        .gte('expiration_date', startWarning.toISOString())
        .lte('expiration_date', endWarning.toISOString());

    // Fetch Expired (Not Sent)
    const { data: expiredPayments } = await supabase
        .from('payments')
        .select(`
            id, expiration_date, member_id, created_at,
            members!inner(id, first_name, last_name, contact, active)
        `)
        .eq('expiration_sent', false)
        .eq('members.active', true)
        .lt('expiration_date', today.toISOString())
        .order('created_at', { ascending: false }); // Latest first

    const notifications = [];
    const processedMembers = new Set(); // To avoid duplicates per run

    // 1. Process Expired First (Priority)
    if (expiredPayments) {
        expiredPayments.forEach(p => {
            if (!p.members.active) return;
            if (processedMembers.has(p.member_id)) return; // Skip if already processed

            notifications.push({
                type: 'expiration',
                paymentId: p.id,
                member: p.members,
                date: p.expiration_date,
                message: whatsappService.getExpirationMessage(p.members)
            });
            processedMembers.add(p.member_id);
        });
    }

    // 2. Process Warnings
    if (warningPayments) {
        warningPayments.forEach(p => {
            if (!p.members.active) return;
            if (processedMembers.has(p.member_id)) return;

            notifications.push({
                type: 'warning',
                paymentId: p.id,
                member: p.members,
                date: p.expiration_date,
                message: whatsappService.getWarningMessage(p.members, p.expiration_date)
            });
            processedMembers.add(p.member_id);
        });
    }

    // Update Badge
    const badge = document.getElementById('nav-notification-badge');
    if (badge) {
        if (notifications.length > 0) {
            badge.textContent = notifications.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // ONLY show modal if user explicitly clicked (forceShow = true)
    if (forceShow) {
        if (notifications.length === 0) {
            ui.alert("✅ No hay notificaciones pendientes. ¡Todos los alumnos están al día!", "success");
            return;
        }
        showNotificationModal(notifications);
    }
    // If forceShow is false, we just update the badge silently without interrupting the user
}

// ==========================================
// UX ENHANCEMENTS: Modal Close Handlers
// ==========================================

// NOTE: ESC key handling is centralized in setupKeyboardShortcuts() to avoid duplicate listeners

// Close modal when clicking outside the content
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal') && !e.target.classList.contains('hidden')) {
        e.target.classList.add('hidden');
    }
});

// Prevent close when clicking inside modal content
document.querySelectorAll('.modal-content').forEach(content => {
    content.addEventListener('click', (e) => {
        e.stopPropagation();
    });
});

log('[APP] Sistema de Gimnasio cargado correctamente.');


import { supabase } from './src/supabaseClient.js';
import { whatsappService } from './src/whatsappService.js';

// Debug helper - shows errors visually on mobile
function showDebugError(message, error = null) {
    console.error('[DEBUG]', message, error);
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
        errorEl.textContent = `Debug: ${message}${error ? ' - ' + error.message : ''}`;
        errorEl.style.display = 'block';
    }
}

// ===== GLOBAL STATE & CONFIGURATION =====
let currentDate = new Date();
currentDate.setDate(1); // Init to current month effectively
let currentMembers = []; // Cache for search
let currentFilter = 'all'; // Filter state: all, paid, overdue
let currentSortOrder = 'last_name_asc'; // Track sort order
let ITEMS_PER_PAGE = 20;
let currentPage = 1;
let filteredMembersCache = []; // Store filtered result for pagination
let activeMemberIds = new Set(); // Active members (expiration_date >= today)

// Validation Helper Functions
const validators = {
    isNotEmpty: (value) => value && value.trim().length > 0,
    isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    isValidPhone: (phone) => /^[\d\s\-\+\(\)]{7,}$/.test(phone),
    isPositiveNumber: (num) => !isNaN(num) && parseFloat(num) > 0,
    isValidDate: (date) => date && !isNaN(new Date(date).getTime())
};


document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('[DEBUG] DOMContentLoaded - supabase:', !!supabase);

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

        // NEW: Setup keyboard shortcuts
        setupKeyboardShortcuts();
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
            const btn = e.target.closest('.edit-payment-btn');
            if (btn) {
                const id = btn.dataset.id;
                const date = btn.dataset.date;
                const expiration = btn.dataset.expiration;
                const member = btn.dataset.member;
                const month = btn.dataset.month;
                const amount = btn.dataset.amount;

                openEditPaymentModal(id, date, expiration, member, month, amount);
            }
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
    // Modify currentDate by offset months
    currentDate.setMonth(currentDate.getMonth() + offset);
    updateMonthDisplays();
    initializeDatePicker();
    refreshCurrentView();
}

// Helpers
function transformDate(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function getCurrentMonthISO() {
    return transformDate(currentDate);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
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

function getMonthName(yyyy_mm) {
    const [year, month] = yyyy_mm.split('-');
    const names = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return `${names[parseInt(month) - 1]} ${year}`;
}

function getPreviousMonth(yyyy_mm) {
    let [year, month] = yyyy_mm.split('-').map(Number);
    month -= 1;
    if (month === 0) {
        month = 12;
        year -= 1;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
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
    console.log('[DASHBOARD] Iniciando carga del dashboard...');
    console.log('[DASHBOARD] Mes actual:', getCurrentMonthISO());

    // ===== AUTO-REPAIR (runs once per session) =====
    if (!dbRepaired) {
        dbRepaired = true;
        console.log('[REPAIR] Ejecutando reparación automática de month_year...');
        try {
            const { data: allPayments } = await supabase.from('payments').select('id, month_year');
            if (allPayments && allPayments.length > 0) {
                for (const p of allPayments) {
                    if (p.month_year && p.month_year.includes(' ')) {
                        const cleaned = p.month_year.replace(/\s/g, '');
                        await supabase.from('payments').update({ month_year: cleaned }).eq('id', p.id);
                        console.log(`[REPAIR] Corregido: "${p.month_year}" -> "${cleaned}"`);
                    }
                }
            }
            console.log('[REPAIR] Reparación completada.');
        } catch (e) {
            console.error('[REPAIR] Error en reparación:', e);
        }
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
        // ========== 1. BALANCE MENSUAL ==========
        console.log('[DASHBOARD] Consultando pagos del mes:', getCurrentMonthISO());
        const { data: currentPayments, error: currErr } = await supabase
            .from('payments')
            .select('amount, member_id')
            .eq('month_year', getCurrentMonthISO());

        console.log('[DASHBOARD] Pagos encontrados:', currentPayments?.length || 0, 'Error:', currErr?.message || 'ninguno');

        let totalBalance = 0;
        if (!currErr && currentPayments && currentPayments.length > 0) {
            currentPayments.forEach(p => totalBalance += parseFloat(p.amount || 0));
        }
        if (balanceEl) balanceEl.textContent = formatCurrency(totalBalance);
        console.log('[DASHBOARD] Balance calculado:', totalBalance);

        // ========== 2. MIEMBROS ACTIVOS ==========
        const todayISO = new Date().toISOString();
        console.log('[DASHBOARD] Fecha hoy (ISO):', todayISO);

        const { data: activePayments, error: activeErr } = await supabase
            .from('payments')
            .select('member_id, expiration_date')
            .gte('expiration_date', todayISO);

        console.log('[DASHBOARD] Pagos activos (exp >= hoy):', activePayments?.length || 0, 'Error:', activeErr?.message || 'ninguno');

        // Update global activeMemberIds for other functions
        activeMemberIds = new Set(activePayments?.map(p => p.member_id) || []);
        const activeCount = activeMemberIds.size;

        if (totalMembersEl) totalMembersEl.textContent = `${activeCount} Activos`;
        console.log('[DASHBOARD] Miembros activos únicos:', activeCount);

        // ========== 3. CRECIMIENTO ==========
        const currentMonth = getCurrentMonthISO();
        const prevMonth = getPreviousMonth(currentMonth);
        console.log('[DASHBOARD] Comparando:', currentMonth, 'vs', prevMonth);

        const { data: currMonthPays } = await supabase.from('payments').select('member_id').eq('month_year', currentMonth);
        const { data: prevMonthPays } = await supabase.from('payments').select('member_id').eq('month_year', prevMonth);

        const currCount = new Set(currMonthPays?.map(p => p.member_id) || []).size;
        const prevCount = new Set(prevMonthPays?.map(p => p.member_id) || []).size;

        console.log('[DASHBOARD] Pagadores este mes:', currCount, 'mes anterior:', prevCount);

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

        // ========== 4. VENCIDOS ==========
        const { count: totalMembers, error: memErr } = await supabase
            .from('members')
            .select('*', { count: 'exact', head: true })
            .eq('active', true);

        console.log('[DASHBOARD] Total miembros activos en DB:', totalMembers, 'Error:', memErr?.message || 'ninguno');

        const overdueCount = Math.max(0, (totalMembers || 0) - activeCount);
        if (overdueEl) overdueEl.textContent = overdueCount;
        console.log('[DASHBOARD] Vencidos calculados:', overdueCount);

    } catch (err) {
        console.error('[DASHBOARD] ERROR CRÍTICO:', err);
        if (totalMembersEl) totalMembersEl.textContent = "Error";
        if (balanceEl) balanceEl.textContent = "Error";
    }

    // ========== WIDGETS SECUNDARIOS ==========
    console.log('[DASHBOARD] Cargando widgets secundarios...');
    try { await loadExpiringSoonCount(); } catch (e) { console.error('[WIDGET] loadExpiringSoonCount error:', e); }
    try { await loadPaymentMethodsChart(); } catch (e) { console.error('[WIDGET] loadPaymentMethodsChart error:', e); }
    try { await loadRetentionStats(); } catch (e) { console.error('[WIDGET] loadRetentionStats error:', e); }
    try { checkAndShowNotifications(); } catch (e) { console.error('[WIDGET] checkAndShowNotifications error:', e); }
    try { loadAnnualSummary(); } catch (e) { console.error('[WIDGET] loadAnnualSummary error:', e); }

    console.log('[DASHBOARD] Carga completa.');
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
    console.log(results.join('\n'));

    // Ofrecer reparación si hay problema de espacios
    if (confirm('¿Desea ejecutar la reparación automática de la base de datos?\n\nEsto corregirá espacios en el campo month_year.')) {
        await repairDatabase();
    }
};

// ==========================================
// REPARACIÓN DE BASE DE DATOS
// ==========================================
window.repairDatabase = async function () {
    console.log('[REPAIR] Iniciando reparación de la base de datos...');

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
                console.log(`[REPAIR] Corrigiendo: "${original}" -> "${cleaned}"`);

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
        console.log(msg);

        // 3. Recargar el dashboard
        loadDashboard();

    } catch (err) {
        alert('Error durante la reparación: ' + err.message);
        console.error('[REPAIR] Error:', err);
    }
};

// NEW: Expiring Soon Count
async function loadExpiringSoonCount() {
    const today = new Date();
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);

    const { data: expiringPayments } = await supabase
        .from('payments')
        .select('member_id, expiration_date')
        .gte('expiration_date', today.toISOString())
        .lte('expiration_date', sevenDaysLater.toISOString());

    const uniqueMembers = new Set(expiringPayments?.map(p => p.member_id));
    const count = uniqueMembers.size;

    document.getElementById('expiring-soon-count').textContent = count;

    // Add pulsing animation if there are expiring members
    const card = document.querySelector('.stat-card-reminder');
    if (count > 0) {
        card.style.cursor = 'pointer';
        card.classList.add('stat-card-pulse');
    } else {
        card.style.cursor = 'default';
        card.classList.remove('stat-card-pulse');
    }
}

// NEW: Show Expiring Members Modal
window.showExpiringMembers = async function () {
    const today = new Date();
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);

    const { data: expiringPayments } = await supabase
        .from('payments')
        .select(`
member_id,
    expiration_date,
    members(first_name, last_name, contact)
        `)
        .gte('expiration_date', today.toISOString())
        .lte('expiration_date', sevenDaysLater.toISOString())
        .order('expiration_date', { ascending: true });

    const tbody = document.getElementById('expiring-members-body');
    tbody.innerHTML = '';

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

    document.getElementById('expiring-modal').classList.remove('hidden');
}

window.closeExpiringModal = function () {
    document.getElementById('expiring-modal').classList.add('hidden');
}



// NEW: Payment Methods Chart
let paymentMethodsChartInstance = null;

async function loadPaymentMethodsChart() {
    const chartContainer = document.getElementById('payment-methods-chart');
    // Show spinner
    chartContainer.innerHTML = '<div class="spinner"></div>';

    const { data: payments } = await supabase
        .from('payments')
        .select('payment_method')
        .eq('month_year', getCurrentMonthISO());

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
}

// NEW: Retention Statistics
async function loadRetentionStats() {
    // Show loading state
    document.getElementById('retention-rate').innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div>';
    document.getElementById('new-members-count').textContent = '...';
    document.getElementById('churned-members-count').textContent = '...';

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

    document.getElementById('retention-rate').textContent = `${retentionRate}%`;
    document.getElementById('new-members-count').textContent = newMembers;
    document.getElementById('churned-members-count').textContent = churned;
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

            // Refresh views
            loadDashboard(); // This will re-trigger loadAnnualSummary but that's fine
            loadMembers(); // Pre-load just in case
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
            }
        }
    });
}

// --- Members ---
async function loadMembers() {
    const tbody = document.getElementById('members-table-body');
    tbody.innerHTML = '<tr><td colspan="5"><div class="spinner"></div></td></tr>';

    // Fetch Active Members
    const { data: members, error } = await supabase
        .from('members')
        .select('*')
        .eq('active', true)
        .order('last_name');

    if (error) {
        tbody.innerHTML = `< tr > <td colspan="5">Error: ${error.message}</td></tr > `;
        return;
    }

    // Cache them
    currentMembers = members;

    // Load payments for status check
    await loadMemberPaymentsStatus();

    // Initial Render
    renderMembersTable(currentMembers);

    // Update Quick Stats Chips immediately
    updateQuickStats();
}



async function loadMemberPaymentsStatus() {
    // Logic Change: 
    // "Active" means they have a payment with expiration_date >= TODAY.
    // It doesn't matter what "Month" is selected in the global view anymore for the *Status Check*,
    // BUT usually we want to know if they paid for the *current view month*.

    // However, user asked: "if that date passed, mark red". 
    // This implies status is "Real Time" based on today, NOT based on the selected historical month.

    const todayISO = new Date().toISOString();

    // Fetch members who have a valid expiration date in the future (or today)
    const { data: payments } = await supabase
        .from('payments')
        .select('member_id')
        .gte('expiration_date', todayISO);

    activeMemberIds = new Set(payments?.map(p => p.member_id));

    return activeMemberIds;

    // Also, for the CURRENT MONTH VIEW, we might want to know who paid specifically for this month
    // to keep the "Pagado" badge relevant to the view?
    // Actually, usually "Vencido" overrides everything. 
    // If I paid for January, but my sub expires Jan 15th, and today is Jan 20th... likely I haven't paid for Feb yet or my Jan sub is done.

    // Let's stick to the User Request: "if date passed -> red".
    // So 'activeMemberIds' will essentially be "Not Vencido IDs".
    // If ID is NOT in this set -> Vencido.
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
            ? '<span class="status-badge paid">Al Día</span>'
            : '<span class="status-badge overdue">Vencido</span>';

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
            const timeDisplay = member.schedule_time ? `<span class="schedule-badge"><span class="time-icon">🕐</span>${member.schedule_time}</span>` : '';

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
                    <i class="fab fa-whatsapp" style="color:#25D366; font-size:1.1em;"></i>
                </button>
                <button class="action-btn" title="Editar" onclick="openEditMemberModal('${member.id}')">✏️</button>
                <button class="action-btn" title="Pagar" onclick="openPaymentModal('${member.id}', '${fullName}')">💰</button>
                <button class="action-btn" title="Observaciones Médicas" onclick="openNotesModal('${member.id}', '${fullName}', '${safeNotes}')">🩺</button>
                <button class="action-btn btn-delete" title="Eliminar Alumno" onclick="deleteMember('${member.id}')">🗑️</button>
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
            m.first_name.toLowerCase().includes(searchTerm) ||
            m.last_name.toLowerCase().includes(searchTerm) ||
            m.contact.toLowerCase().includes(searchTerm)
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

// --- UI Helper for Custom Alerts ---
const ui = {
    alert: (message, type = 'info') => {
        return new Promise((resolve) => {
            const container = document.getElementById('alert-container');
            const alertBox = document.createElement('div');
            alertBox.id = 'alert-overlay';
            alertBox.innerHTML = `
                <div class="alert-box ${type}-type">
                    <h3>${type === 'error' ? '⚠️ Error' : (type === 'success' ? '✅ Éxito' : 'ℹ️ Información')}</h3>
                    <p>${message}</p>
                    <button onclick="this.closest('#alert-overlay').remove()">Aceptar</button>
                </div>
            `;
            container.appendChild(alertBox);
            // Auto close success after 2s
            if (type === 'success') {
                setTimeout(() => {
                    if (alertBox.parentNode) alertBox.remove();
                    resolve();
                }, 2000);
            }
            alertBox.querySelector('button').onclick = () => {
                alertBox.remove();
                resolve();
            };
        });
    },
    confirm: (message) => {
        return new Promise((resolve) => {
            const container = document.getElementById('alert-container');
            const alertBox = document.createElement('div');
            alertBox.id = 'alert-overlay';
            alertBox.innerHTML = `
                <div class="alert-box">
                    <h3>❓ Confirmar</h3>
                    <p>${message}</p>
                    <div style="display:flex; justify-content:center; gap:10px;">
                        <button class="btn-cancel" id="btn-cancel">Cancelar</button>
                        <button id="btn-ok">Confirmar</button>
                    </div>
                </div>
            `;
            container.appendChild(alertBox);

            document.getElementById('btn-cancel').onclick = () => {
                alertBox.remove();
                resolve(false);
            };
            document.getElementById('btn-ok').onclick = () => {
                alertBox.remove();
                resolve(true);
            };
        });
    }
};

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
        e.target.reset();
    }
}

// --- Delete Member ---
window.deleteMember = async (id) => {
    const confirmed = await ui.confirm('¿Estás seguro de que quieres eliminar a este alumno de forma permanente? Se borrará de la lista y su historial.');
    if (!confirmed) return;

    const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', id);

    if (error) {
        ui.alert('Error al eliminar: ' + error.message, 'error');
    } else {
        ui.alert('Alumno eliminado permanentemente.', 'success');
        loadMembers();
        loadDashboard();
    }
}

// --- Payments ---
window.openPaymentModal = (id, name) => {
    document.getElementById('payment-member-id').value = id;
    document.getElementById('payment-member-name').textContent = name;
    document.getElementById('payment-modal').classList.remove('hidden');

    // Generate Dynamic Month Options Strict
    generatePaymentMonthOptions();

    // Set default to current iso selection or real current month
    // Usually user wants to pay for *current selected month* or *real current month*?
    // Let's default to the *global view month* for convenience.
    document.getElementById('payment-month').value = getCurrentMonthISO();

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
};

// Quick amount selection
window.setQuickAmount = (amount) => {
    document.getElementById('payment-amount').value = amount;
    // Visual feedback
    document.querySelectorAll('.quick-amount-btn').forEach(btn => {
        btn.style.transform = 'scale(1)';
        btn.style.background = 'transparent';
    });
    event.target.style.transform = 'scale(1.1)';
    event.target.style.background = 'var(--primary)';
    event.target.style.color = '#000';
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

async function handleAddPayment(e) {
    e.preventDefault();
    const member_id = document.getElementById('payment-member-id').value;
    const month_year = document.getElementById('payment-month').value;
    const amount = document.getElementById('payment-amount').value;
    const payment_date_val = document.getElementById('payment-date-input').value; // YYYY-MM-DD
    const expiration_date_val = document.getElementById('payment-expiration-input').value; // YYYY-MM-DD
    const payment_method = document.getElementById('payment-method-select').value;

    // Validation
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

    // NEW: Validate that expiration is after payment date
    const paymentDate = new Date(payment_date_val);
    const expirationDate = new Date(expiration_date_val);
    if (expirationDate <= paymentDate) {
        ui.alert('La fecha de vencimiento debe ser posterior a la fecha de pago', 'error');
        return;
    }

    // NEW: Check if student already paid for this month
    const { data: existingPayments, error: checkError } = await supabase
        .from('payments')
        .select('id')
        .eq('member_id', member_id)
        .eq('month_year', month_year);

    if (checkError) {
        ui.alert('Error al verificar pagos existentes: ' + checkError.message, 'error');
        return;
    }

    if (existingPayments && existingPayments.length > 0) {
        ui.alert('Este alumno ya tiene un pago registrado para este mes. Use el botón de editar (✏️) para modificar las fechas.', 'error');
        return;
    }

    // Disable button to prevent double submission
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registrando...';

    const { error } = await supabase.from('payments').insert([{
        member_id,
        month_year,
        amount,
        payment_method,
        payment_date: payment_date_val ? new Date(payment_date_val + 'T12:00:00').toISOString() : new Date().toISOString(),
        expiration_date: expiration_date_val ? new Date(expiration_date_val + 'T12:00:00').toISOString() : null
    }]);

    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;

    if (error) {
        ui.alert('Error: ' + error.message, 'error');
    } else {
        closePaymentModal();
        ui.alert('Pago registrado correctamente.', 'success');
        loadMembers();
        loadDashboard();
        e.target.reset();

        // WhatsApp Automation: Payment Confirmation
        const member = currentMembers.find(m => m.id === member_id);
        if (member && member.contact) {
            const confirmed = await ui.confirm(`¿Deseas enviar una confirmación de pago a ${member.first_name} por WhatsApp?`);
            if (confirmed) {
                const monthName = getMonthName(month_year);
                const msg = whatsappService.getPaymentConfirmationMessage(member, amount, monthName);
                whatsappService.sendWhatsApp(member.contact, msg);
            }
        }
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
    const paymentDate = new Date(payment_date_val);
    const expirationDate = new Date(expiration_date_val);
    if (expirationDate <= paymentDate) {
        ui.alert('La fecha de vencimiento debe ser posterior a la fecha de pago', 'error');
        return;
    }

    // Disable button to prevent double submission
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const { error } = await supabase
        .from('payments')
        .update({
            payment_date: new Date(payment_date_val + 'T12:00:00').toISOString(),
            expiration_date: new Date(expiration_date_val + 'T12:00:00').toISOString()
        })
        .eq('id', paymentId);

    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;

    if (error) {
        ui.alert('Error: ' + error.message, 'error');
    } else {
        closeEditPaymentModal();
        ui.alert('Fechas actualizadas correctamente.', 'success');
        loadPaymentsHistory();
        loadMembers();
        loadDashboard();
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
created_at,
    payment_date,
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
        tbody.innerHTML = `< tr > <td colspan="5">Error: ${error.message}</td></tr > `;
        return;
    }

    // Cache payments
    cachedPayments = payments;

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
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- PDF Export Logic ---
window.exportMonthlyReport = () => {
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
}

// Export Payments to PDF
window.exportPaymentsToPDF = () => {
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

    ui.alert('Excel (CSV) exportado correctamente', 'success');
}



function formatDate(isoString) {
    if (!isoString) return '-';
    // If we created it with new Date().toISOString(), it is UTC.
    // Display in local time
    const d = new Date(isoString);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

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

        // Escape: Close modals
        if (e.key === 'Escape') {
            closeAddMemberModal();
            closeEditMemberModal();
            closePaymentModal();
            closeNotesModal();
            closeExpiringModal();
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
        modal.className = 'modal'; // Reuse existing modal class

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <span class="close-btn" onclick="document.getElementById('notification-center-modal').remove()">&times;</span>
                <h2>🔔 Centro de Notificaciones</h2>
                <p style="margin-bottom:15px; color:#aaa;">Se han detectado avisos automáticos pendientes de enviar.</p>
                
                <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="text-align:left; border-bottom:1px solid #444;">
                                <th style="padding:10px;">Alumno</th>
                                <th>Motivo</th>
                                <th>Contacto</th>
                                <th style="text-align:center;">Acción</th>
                            </tr>
                        </thead>
                        <tbody id="notification-list-body"></tbody>
                    </table>
                </div>
                <div style="margin-top:20px; text-align:right;">
                    <button class="btn-primary" onclick="document.getElementById('notification-center-modal').remove()">Cerrar</button>
                    <!-- Future: Send All button -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const tbody = modal.querySelector('#notification-list-body');
    tbody.innerHTML = '';

    notifications.forEach((notif, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #333';
        const typeLabel = notif.type === 'warning'
            ? '<span style="color:#FFD700; font-size:0.9em;">⚠️ Vence pronto</span>'
            : '<span style="color:#ff4444; font-size:0.9em;">⛔ Vencido</span>';

        tr.innerHTML = `
            <td style="padding:10px;">${notif.member.first_name} ${notif.member.last_name}</td>
            <td>${typeLabel}</td>
            <td>${notif.member.contact}</td>
            <td style="text-align:center;">
                <button class="action-btn btn-whatsapp" id="btn-send-${index}" title="Enviar WhatsApp">
                    <i class="fab fa-whatsapp"></i> Contactar por WhatsApp
                </button>
            </td>
        `;

        tbody.appendChild(tr);

        // Attach listener
        const btn = tr.querySelector(`#btn-send-${index}`);
        btn.onclick = async () => {
            // 1. Send WA
            whatsappService.sendWhatsApp(notif.member.contact, notif.message);

            // 2. Mark as sent in DB
            const updateField = notif.type === 'warning' ? 'warning_sent' : 'expiration_sent';

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-check" style="color:#4caf50;"></i>';

            await supabase
                .from('payments')
                .update({ [updateField]: true })
                .eq('id', notif.paymentId);
        };
    });

    modal.classList.remove('hidden');
    modal.classList.add('active'); // Ensure display
    modal.style.display = 'flex'; // Force flex for centering (if logic differs from .modal class)
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

// Close modals with ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Close all visible modals
        document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
            modal.classList.add('hidden');
        });
        // Close alert overlays
        const alertOverlay = document.getElementById('alert-overlay');
        if (alertOverlay) alertOverlay.remove();
        // Close notification modal
        const notifModal = document.getElementById('notification-center-modal');
        if (notifModal) notifModal.remove();
    }
});

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

console.log('[APP] Sistema de Gimnasio v13.0 cargado correctamente.');

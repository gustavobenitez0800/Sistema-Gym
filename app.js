
import { supabase } from './src/supabaseClient.js';

// Global State
let currentDate = new Date(); // Source of truth for navigation
// Init to current month effectively
currentDate.setDate(1);
const MAX_MEMBERS = 300;
let fileCache = [];
let currentMembers = []; // Cache for search
let currentFilter = 'all'; // Filter state: all, paid, overdue


document.addEventListener('DOMContentLoaded', () => {
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
});

function setupEventListeners() {
    // Auth
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Member Management
    document.getElementById('add-member-form').addEventListener('submit', handleAddMember);

    document.getElementById('payment-form').addEventListener('submit', handleAddPayment);
    // Notes
    document.getElementById('notes-form').addEventListener('submit', handleSaveNotes);

    // Search
    document.getElementById('search-member-input').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        applyMemberFilters(term);
    });
}

// --- Global Month Logic ---
window.changeGlobalMonth = function (offset) {
    // Modify currentDate by offset months
    currentDate.setMonth(currentDate.getMonth() + offset);
    updateMonthDisplays();

    // Refresh current view
    const dashboardActive = document.getElementById('dashboard').classList.contains('active-section');
    const membersActive = document.getElementById('members').classList.contains('active-section');
    const paymentsActive = document.getElementById('payments').classList.contains('active-section');

    if (dashboardActive) loadDashboard();
    // Always refresh members if we might switch to it, but specifically if active
    if (membersActive) loadMembers();
    if (paymentsActive) loadPaymentsHistory();
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

function updateMonthDisplays() {
    const isoDate = getCurrentMonthISO();
    const monthName = getMonthName(isoDate);

    // Sidebar Label
    document.getElementById('global-month-label').textContent = monthName;

    // Headers
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

window.showSection = (sectionId) => {
    document.querySelectorAll('.content-section').forEach(el => {
        el.classList.remove('active-section');
        el.classList.add('hidden-section');
    });
    const target = document.getElementById(sectionId);
    target.classList.add('active-section');
    target.classList.remove('hidden-section');

    // Update Sidebar Active state
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active-nav'));
    // Manual Highlight logic based on onclick string
    if (sectionId === 'dashboard') document.querySelector('.sidebar li:nth-child(1)').classList.add('active-nav');
    if (sectionId === 'members') document.querySelector('.sidebar li:nth-child(2)').classList.add('active-nav');
    if (sectionId === 'payments') document.querySelector('.sidebar li:nth-child(3)').classList.add('active-nav');


    if (sectionId === 'members') loadMembers();
    if (sectionId === 'payments') loadPaymentsHistory();
    if (sectionId === 'dashboard') loadDashboard();
};

// --- Dashboard ---
async function loadDashboard() {
    // 1. Get Payments for Current Selected Month
    const { data: currentPayments, error: currErr } = await supabase
        .from('payments')
        .select('amount, member_id')
        .eq('month_year', getCurrentMonthISO());

    if (currErr) return;

    // Calculate Active Members (those who paid this month)
    const activeMemberIds = new Set(currentPayments.map(p => p.member_id));
    const activeCount = activeMemberIds.size;

    // Calculate Balance
    let totalBalance = 0;
    currentPayments.forEach(p => totalBalance += parseFloat(p.amount));

    // Update UI Stats
    document.getElementById('total-members').textContent = `${activeCount} Pagos`;
    document.getElementById('monthly-balance').textContent = formatCurrency(totalBalance);

    // 2. Growth Logic (Active vs Previous Month)
    const prevMonth = getPreviousMonth(getCurrentMonthISO());
    const { data: prevPayments } = await supabase
        .from('payments')
        .select('member_id')
        .eq('month_year', prevMonth);

    let prevActiveCount = 0;
    if (prevPayments) {
        prevActiveCount = new Set(prevPayments.map(p => p.member_id)).size;
    }

    const growthEl = document.getElementById('growth-stat');
    if (prevActiveCount === 0) {
        growthEl.textContent = activeCount > 0 ? "100% vs mes anterior" : "0% vs mes anterior";
        growthEl.className = activeCount > 0 ? "text-success" : "";
    } else {
        const diff = activeCount - prevActiveCount;
        const percent = ((diff / prevActiveCount) * 100).toFixed(1);
        growthEl.textContent = `${percent > 0 ? '+' : ''}${percent}% vs mes anterior`;
        growthEl.className = percent >= 0 ? "text-success" : "text-danger";
    }

    // 3. Overdue Count (Real Active Members vs Paid Members)
    // "Overdue" defined as: Member is Active in system, but has NOT paid for selected month.
    const { count: totalSystemMembers } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('active', true);

    const overdueCount = (totalSystemMembers || 0) - activeCount;
    document.getElementById('overdue-count').textContent = overdueCount > 0 ? overdueCount : 0;


    // 4. Load Annual Summary Table (New Feature)
    loadAnnualSummary();
}

async function loadAnnualSummary() {
    const tbody = document.getElementById('annual-stats-body');
    const selectedYear = currentDate.getFullYear();

    // Update Header
    document.querySelector('.annual-summary h3').textContent = `Balance Anual ${selectedYear}`;

    tbody.innerHTML = '<tr><td colspan="4"><div class="spinner"></div></td></tr>';

    // Fetch payments for the SELECTED YEAR
    // We use a LIKE query for "YYYY-%"
    const { data: allYearPayments, error } = await supabase
        .from('payments')
        .select('month_year, amount, member_id')
        .like('month_year', `${selectedYear}-%`);

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
        tr.style.cursor = 'pointer';
        tr.title = `Ir a ${getMonthName(m)}`;
        tr.onclick = () => {
            // Calculate difference in months from current view to clicked month
            const [tYear, tMonth] = m.split('-').map(Number);
            const targetDate = new Date(tYear, tMonth - 1, 1);

            // We can just set currentDate directly
            currentDate = targetDate;
            updateMonthDisplays();

            // Refresh views
            loadDashboard(); // This will re-trigger loadAnnualSummary but that's fine
            loadMembers(); // Pre-load just in case
        };

        tr.innerHTML = `
            <td>${getMonthName(m)}</td>
            <td>${count}</td>
            <td>${formatCurrency(income)}</td>
            <td class="${growthClass}">${growthText}</td>
        `;

        // Highlight current month row
        if (m === getCurrentMonthISO()) {
            tr.style.background = 'rgba(255, 214, 0, 0.1)';
            tr.style.borderLeft = '4px solid var(--primary)';
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
        tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
        return;
    }

    // Cache them
    currentMembers = members;

    // Load payments for status check
    await loadMemberPaymentsStatus();

    // Initial Render
    renderMembersTable(currentMembers);

    // Update Warning
    const count = members.length;
    if (count >= MAX_MEMBERS) {
        document.getElementById('limit-warning').classList.remove('hidden');
    } else {
        document.getElementById('limit-warning').classList.add('hidden');
    }
}

// Global set of paid IDs for the current month
let paidMemberIds = new Set();

async function loadMemberPaymentsStatus() {
    // Fetch Payments for SELECTED MONTH
    const { data: payments } = await supabase
        .from('payments')
        .select('member_id')
        .eq('month_year', getCurrentMonthISO());

    paidMemberIds = new Set(payments?.map(p => p.member_id));
}

function renderMembersTable(membersToRender) {
    const tbody = document.getElementById('members-table-body');
    tbody.innerHTML = '';

    if (membersToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No se encontraron alumnos registrados.</td></tr>';
        return;
    }

    membersToRender.forEach(member => {
        const isPaid = paidMemberIds.has(member.id);

        const isOverdue = !isPaid;

        const nameClass = isOverdue ? 'text-overdue' : '';
        const rowClass = isOverdue ? 'row-overdue' : '';
        const statusText = isPaid ? 'PAGADO' : 'VENCIDO';
        const statusClass = isPaid ? 'text-success' : 'text-danger';

        const tr = document.createElement('tr');
        tr.className = rowClass;

        const statusBadge = isPaid
            ? '<span class="status-badge paid">Pagado</span>'
            : '<span class="status-badge overdue">Vencido</span>';

        // Escape helper (simple)
        const safeNotes = member.notes ? member.notes.replace(/'/g, "\\'") : '';
        const fullName = `${member.first_name} ${member.last_name}`;

        tr.innerHTML = `
            <td class="${nameClass}">${member.first_name}</td>
            <td class="${nameClass}">${member.last_name}</td>
            <td>${member.contact}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="action-btn" title="Pagar" onclick="openPaymentModal('${member.id}', '${fullName}')">💰</button>
                <button class="action-btn" title="Observaciones Médicas" onclick="openNotesModal('${member.id}', '${fullName}', '${safeNotes}')">🩺</button>
                <button class="action-btn btn-delete" title="Eliminar Alumno" onclick="deleteMember('${member.id}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
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
        filtered = filtered.filter(m => paidMemberIds.has(m.id));
    } else if (currentFilter === 'overdue') {
        filtered = filtered.filter(m => !paidMemberIds.has(m.id));
    }

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
window.openAddMemberModal = async () => {
    const { count } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('active', true);

    if (count >= MAX_MEMBERS) {
        document.getElementById('modal-limit-msg').classList.remove('hidden');
        document.getElementById('save-member-btn').disabled = true;
    } else {
        document.getElementById('modal-limit-msg').classList.add('hidden');
        document.getElementById('save-member-btn').disabled = false;
    }

    document.getElementById('add-member-modal').classList.remove('hidden');
};

window.closeAddMemberModal = () => {
    document.getElementById('add-member-modal').classList.add('hidden');
};

async function handleAddMember(e) {
    e.preventDefault();
    const first_name = document.getElementById('new-name').value;
    const last_name = document.getElementById('new-lastname').value;
    const contact = document.getElementById('new-contact').value;

    const { error } = await supabase.from('members').insert([{
        first_name, last_name, contact
    }]);

    if (error) {
        ui.alert('Error al agregar: ' + error.message, 'error');
    } else {
        closeAddMemberModal();
        ui.alert('Alumno agregado correctamente.', 'success');
        loadMembers();
        loadDashboard();
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
};

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

    const { error } = await supabase.from('payments').insert([{
        member_id, month_year, amount
    }]);

    if (error) {
        ui.alert('Error: ' + error.message, 'error');
    } else {
        closePaymentModal();
        ui.alert('Pago registrado correctamente.', 'success');
        loadMembers();
        loadDashboard();
        e.target.reset();
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

// --- History ---
async function loadPaymentsHistory() {
    const tbody = document.getElementById('payments-history-body');
    tbody.innerHTML = '<tr><td colspan="4"><div class="spinner"></div></td></tr>';

    const { data: payments, error } = await supabase
        .from('payments')
        .select(`
            created_at,
            month_year,
            amount,
            payment_method,
            members (first_name, last_name)
        `)
        .eq('month_year', getCurrentMonthISO()) // Filter by selected month
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
        return;
    }

    // Calculate summary
    let totalAmount = 0;
    payments.forEach(p => totalAmount += parseFloat(p.amount));

    // Update summary card
    document.getElementById('payments-total').textContent = formatCurrency(totalAmount);
    document.getElementById('payments-count').textContent = payments.length;

    tbody.innerHTML = '';

    if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay pagos registrados en este mes.</td></tr>';
        return;
    }

    payments.forEach(p => {
        const date = formatDate(p.created_at);
        const memberName = p.members ? `${p.members.first_name} ${p.members.last_name}` : 'Alumno Eliminado/Desconocido';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${date}</td>
            <td>${memberName}</td>
            <td>${p.month_year}</td>
            <td>${formatCurrency(p.amount)}</td>
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

window.exportPaymentsListPDF = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text(`Lista de Pagos - ${document.getElementById('payments-month-display').textContent}`, 14, 22);

    // Fetch data again to be sure
    const { data: payments } = await supabase
        .from('payments')
        .select(`
            created_at,
            month_year,
            amount,
            payment_method,
            members (first_name, last_name)
        `)
        .eq('month_year', getCurrentMonthISO())
        .order('created_at', { ascending: false });

    const tableData = payments.map(p => [
        formatDate(p.created_at),
        p.members ? `${p.members.first_name} ${p.members.last_name}` : 'Alumno Eliminado',
        p.month_year,
        `$${p.amount}`
    ]);

    doc.autoTable({
        head: [['Fecha', 'Alumno', 'Mes', 'Monto']],
        body: tableData,
        startY: 30,
        theme: 'striped',
        headStyles: { fillColor: [40, 40, 40] }
    });

    doc.save(`pagos_${getCurrentMonthISO()}.pdf`);
}

function formatDate(isoString) {
    if (!isoString) return '-';
    // If we created it with new Date().toISOString(), it is UTC.
    // Display in local time
    const d = new Date(isoString);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

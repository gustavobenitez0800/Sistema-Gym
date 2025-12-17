
import { supabase } from './src/supabaseClient.js';

// Global State
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
let currentMonth = `${year}-${month}`;
const MAX_MEMBERS = 300;

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

    // Set initial dropdown value
    document.getElementById('global-month-select').value = currentMonth;
    updateMonthDisplays();
});

function setupEventListeners() {
    // Auth
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Member Management
    document.getElementById('add-member-form').addEventListener('submit', handleAddMember);

    // Payment
    document.getElementById('payment-form').addEventListener('submit', handleAddPayment);
    // Auto-select global month in modal
}

// --- Global Month Logic ---
window.changeGlobalMonth = function () {
    const select = document.getElementById('global-month-select');
    currentMonth = select.value;
    updateMonthDisplays();

    // Refresh current view
    const dashboardActive = document.getElementById('dashboard').classList.contains('active-section');
    const membersActive = document.getElementById('members').classList.contains('active-section');

    if (dashboardActive) loadDashboard();
    // Always refresh members if we might switch to it, but specifically if active
    if (membersActive) loadMembers();
}

function updateMonthDisplays() {
    const monthName = getMonthName(currentMonth);
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
        .eq('month_year', currentMonth);

    if (currErr) return;

    // Calculate Active Members (those who paid this month)
    const activeMemberIds = new Set(currentPayments.map(p => p.member_id));
    const activeCount = activeMemberIds.size;

    // Calculate Balance
    let totalBalance = 0;
    currentPayments.forEach(p => totalBalance += parseFloat(p.amount));

    // Update UI Stats
    document.getElementById('total-members').textContent = `${activeCount} Pagos`;
    document.getElementById('monthly-balance').textContent = `$${totalBalance.toLocaleString()}`;

    // 2. Growth Logic (Active vs Previous Month)
    const prevMonth = getPreviousMonth(currentMonth);
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
    tbody.innerHTML = '<tr><td colspan="4">Cargando datos anuales...</td></tr>';

    // We will do a single query for all 2026 payments to save requests
    const { data: allYearPayments, error } = await supabase
        .from('payments')
        .select('month_year, amount, member_id')
        .or('month_year.eq.2025-12,month_year.like.2026-%'); // Dec 2025 + All 2026

    if (error) {
        tbody.innerHTML = '<tr><td colspan="4">Error al cargar datos anuales</td></tr>';
        return;
    }

    // Process data locally
    const statsByMonth = {};
    // Init months (Dec 2025 + 2026)
    statsByMonth['2025-12'] = { income: 0, distinctMembers: new Set() };
    for (let i = 1; i <= 12; i++) {
        const m = `2026-${String(i).padStart(2, '0')}`;
        statsByMonth[m] = { income: 0, distinctMembers: new Set() };
    }

    allYearPayments.forEach(p => {
        if (statsByMonth[p.month_year]) {
            statsByMonth[p.month_year].income += parseFloat(p.amount);
            statsByMonth[p.month_year].distinctMembers.add(p.member_id);
        }
    });

    tbody.innerHTML = '';
    let prevCount = 0; // Carry over for growth calc annualy? Or just display logic. 
    // Usually growth is vs prev month.

    const months = Object.keys(statsByMonth).sort();
    months.forEach((m, index) => {
        const income = statsByMonth[m].income;
        const count = statsByMonth[m].distinctMembers.size;

        let growthText = "0%";
        let growthClass = "";

        if (index > 0) {
            const prevM = months[index - 1];
            const prevC = statsByMonth[prevM].distinctMembers.size;
            if (prevC === 0) {
                growthText = count > 0 ? "100%" : "0%";
                growthClass = count > 0 ? "text-success" : "";
            } else {
                const diff = count - prevC;
                const pct = ((diff / prevC) * 100).toFixed(0);
                growthText = `${pct > 0 ? '+' : ''}${pct}%`;
                growthClass = pct >= 0 ? "text-success" : "text-danger";
            }
        }

        // Only show months that have passed or are current? Or show all? User asked for 2026 Jan-Dec.
        // We show all lines
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${getMonthName(m)}</td>
            <td>${count}</td>
            <td>$${income.toLocaleString()}</td>
            <td class="${growthClass}">${growthText}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Members ---
async function loadMembers() {
    const tbody = document.getElementById('members-table-body');
    tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';

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

    // Fetch Payments for SELECTED MONTH
    const { data: payments } = await supabase
        .from('payments')
        .select('member_id')
        .eq('month_year', currentMonth);

    const paidMemberIds = new Set(payments?.map(p => p.member_id));

    tbody.innerHTML = '';

    members.forEach(member => {
        const isPaid = paidMemberIds.has(member.id);

        // Visual Logic
        // If paid: Success text. If overdue: Red text on Name strings? Or just Status.
        // Req: "Cuando está vencida se ve en rojo, así no se pasa ninguna" -> Resaltar apellido y nombre
        const isOverdue = !isPaid;

        const nameClass = isOverdue ? 'text-overdue' : '';
        const rowClass = isOverdue ? 'row-overdue' : '';
        const statusText = isPaid ? 'PAGADO' : 'VENCIDO';
        const statusClass = isPaid ? 'text-success' : 'text-danger';

        const tr = document.createElement('tr');
        tr.className = rowClass;

        tr.innerHTML = `
            <td class="${nameClass}">${member.first_name}</td>
            <td class="${nameClass}">${member.last_name}</td>
            <td>${member.contact}</td>
            <td class="${statusClass}"><strong>${statusText}</strong></td>
            <td>
                <button class="action-btn" title="Pagar" onclick="openPaymentModal('${member.id}', '${member.first_name} ${member.last_name}')">💰</button>
                <button class="action-btn btn-delete" title="Eliminar Alumno" onclick="deleteMember('${member.id}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Update Warning
    const count = members.length;
    if (count >= MAX_MEMBERS) {
        document.getElementById('limit-warning').classList.remove('hidden');
    } else {
        document.getElementById('limit-warning').classList.add('hidden');
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
    document.getElementById('payment-month').value = currentMonth;
};

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

// --- History ---
async function loadPaymentsHistory() {
    const tbody = document.getElementById('payments-history-body');
    tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';

    const { data: payments, error } = await supabase
        .from('payments')
        .select(`
            created_at,
            month_year,
            amount,
            members (first_name, last_name)
        `)
        .eq('month_year', currentMonth) // Filter by selected month
        .order('created_at', { ascending: false });
    // .limit(50); // Removed limit to see full month history

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    payments.forEach(p => {
        const date = new Date(p.created_at).toLocaleDateString();
        const memberName = p.members ? `${p.members.first_name} ${p.members.last_name}` : 'Alumno Eliminado/Desconocido';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${date}</td>
            <td>${memberName}</td>
            <td>${p.month_year}</td>
            <td>$${p.amount}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Reports ---
window.exportMonthlyReport = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. Header
    doc.setFontSize(22);
    doc.text('AyD Funcional Gym', 14, 20);

    doc.setFontSize(16);
    doc.text(`Reporte Mensual: ${getMonthName(currentMonth)}`, 14, 30);

    doc.setFontSize(11);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString()}`, 14, 38);

    // 2. Summary Stats
    // We can pull these from the DOM or recalculate. Recalculation is safer.
    // Re-using logic from loadDashboard essentially
    const { data: currentPayments } = await supabase
        .from('payments')
        .select('amount, member_id')
        .eq('month_year', currentMonth);

    const activeMemberIds = new Set(currentPayments?.map(p => p.member_id));
    const activeCount = activeMemberIds.size;
    let totalBalance = 0;
    currentPayments?.forEach(p => totalBalance += parseFloat(p.amount));

    const { count: totalSystemMembers } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('active', true);

    const overdueCount = (totalSystemMembers || 0) - activeCount;

    doc.setFillColor(240, 240, 240);
    doc.rect(14, 45, 180, 25, 'F');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('Resumen Financiero', 20, 55);

    doc.setFontSize(10);
    doc.text(`Ingresos: $${totalBalance.toLocaleString()}`, 20, 63);
    doc.text(`Alumnos Activos: ${activeCount}`, 90, 63);
    doc.text(`Vencimientos: ${overdueCount}`, 150, 63);

    // 3. Detail Table (Payments)
    // Let's list the members who paid this month
    const { data: paymentsDetail } = await supabase
        .from('payments')
        .select(`
            created_at,
            amount,
            members (first_name, last_name, contact)
        `)
        .eq('month_year', currentMonth)
        .order('created_at', { ascending: false });

    const tableData = paymentsDetail.map(p => [
        new Date(p.created_at).toLocaleDateString(),
        p.members ? `${p.members.first_name} ${p.members.last_name}` : 'Desconocido',
        p.members ? p.members.contact : '-',
        `$${p.amount}`
    ]);

    doc.autoTable({
        startY: 80,
        head: [['Fecha', 'Alumno', 'Contacto', 'Monto']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [255, 68, 68] }, // Match red theme roughly
        styles: { fontSize: 10 }
    });

    const finalY = doc.lastAutoTable.finalY + 10;

    doc.text('*** Fin del Reporte ***', 14, finalY);

    // Save
    doc.save(`Reporte_AyD_${currentMonth}.pdf`);
};

window.exportPaymentsListPDF = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('AyD Funcional Gym', 14, 20);
    doc.setFontSize(14);
    doc.text(`Historial de Pagos: ${getMonthName(currentMonth)}`, 14, 30);

    // Fetch filtered data
    const { data: payments } = await supabase
        .from('payments')
        .select(`
            created_at,
            month_year,
            amount,
            members (first_name, last_name)
        `)
        .eq('month_year', currentMonth)
        .order('created_at', { ascending: false });

    if (!payments || payments.length === 0) {
        ui.alert('No hay pagos para exportar en este mes.', 'info');
        return;
    }

    const tableData = payments.map(p => [
        new Date(p.created_at).toLocaleDateString(),
        p.members ? `${p.members.first_name} ${p.members.last_name}` : 'Desconocido',
        p.month_year,
        `$${p.amount}`
    ]);

    doc.autoTable({
        startY: 40,
        head: [['Fecha', 'Alumno', 'Mes Pagado', 'Monto']],
        body: tableData,
        theme: 'striped'
    });

    doc.save(`Pagos_AyD_${currentMonth}.pdf`);
}

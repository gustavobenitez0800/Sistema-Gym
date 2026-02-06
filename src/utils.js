// src/utils.js - Utility Functions
// Extracted from app.js for better modularity

// ===== DATE UTILITIES =====

/**
 * Transform Date object to YYYY-MM format
 */
export function transformDate(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * Get month name from YYYY-MM format
 */
export function getMonthName(yyyy_mm) {
    const [year, month] = yyyy_mm.split('-');
    const names = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return `${names[parseInt(month) - 1]} ${year}`;
}

/**
 * Get previous month in YYYY-MM format
 */
export function getPreviousMonth(yyyy_mm) {
    let [year, month] = yyyy_mm.split('-').map(Number);
    month -= 1;
    if (month === 0) {
        month = 12;
        year -= 1;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Format date for display (dd/mm hh:mm)
 */
export function formatDate(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ===== CURRENCY UTILITIES =====

/**
 * Format amount as Argentine Peso currency
 */
export function formatCurrency(amount) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
}

// ===== VALIDATION UTILITIES =====

export const validators = {
    isNotEmpty: (value) => value && value.trim().length > 0,
    isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    isValidPhone: (phone) => /^[\d\s\-\+\(\)]{7,}$/.test(phone),
    isPositiveNumber: (num) => !isNaN(num) && parseFloat(num) > 0,
    isValidDate: (date) => date && !isNaN(new Date(date).getTime())
};

// ===== UI UTILITIES =====

/**
 * Custom alert with different types (success, error, info)
 */
export const ui = {
    alert: (message, type = 'info') => {
        const container = document.getElementById('alert-container');
        if (!container) {
            alert(message);
            return;
        }

        const alertBox = document.createElement('div');
        alertBox.id = 'alert-overlay';
        alertBox.innerHTML = `
            <div class="alert-box ${type}-type">
                <p>${message}</p>
                <button onclick="this.closest('#alert-overlay').remove()">OK</button>
            </div>
        `;
        container.appendChild(alertBox);
    },

    confirm: (message) => {
        return new Promise((resolve) => {
            const container = document.getElementById('alert-container');
            if (!container) {
                resolve(confirm(message));
                return;
            }

            const alertBox = document.createElement('div');
            alertBox.id = 'alert-overlay';
            alertBox.innerHTML = `
                <div class="alert-box confirm-type">
                    <p>${message}</p>
                    <div class="alert-buttons">
                        <button class="btn-confirm">Sí</button>
                        <button class="btn-cancel">No</button>
                    </div>
                </div>
            `;

            alertBox.querySelector('.btn-confirm').addEventListener('click', () => {
                alertBox.remove();
                resolve(true);
            });

            alertBox.querySelector('.btn-cancel').addEventListener('click', () => {
                alertBox.remove();
                resolve(false);
            });

            container.appendChild(alertBox);
        });
    }
};

// ===== LOGGING =====
const DEBUG_MODE = false;
export const log = (...args) => DEBUG_MODE && console.log(...args);

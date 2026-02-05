// src/whatsappService.js

/**
 * WhatsApp Automation Service for AyD Funcional Gym
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN DEL GIMNASIO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Número de WhatsApp del Gimnasio: +54 9 3757 30-7866
 * 
 * IMPORTANTE: Para que los mensajes se envíen desde el número del gimnasio,
 * el operador debe tener WhatsApp Web o WhatsApp Desktop logueado con el 
 * número de arriba. Cuando se hace click en "Enviar WhatsApp", el sistema
 * abre WhatsApp con el mensaje pre-llenado hacia el alumno.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const whatsappService = {

    /**
     * Open WhatsApp with a pre-filled message to send to a member
     * @param {string} phone - Member's phone number (destination)
     * @param {string} message - Message text
     * @returns {boolean} - Whether the operation was successful
     */
    sendWhatsApp: (phone, message) => {
        if (!phone) {
            console.warn('[WhatsApp] No se proporcionó número de teléfono');
            return false;
        }

        // Remove ALL non-numeric characters
        let safePhone = phone.replace(/\D/g, '');

        // Remove leading 0 (common in local dialing)
        if (safePhone.startsWith('0')) {
            safePhone = safePhone.substring(1);
        }

        // Handle Argentina-specific formatting
        if (safePhone.startsWith('54')) {
            // Already has country code, ensure it has the 9 for mobile
            if (!safePhone.startsWith('549')) {
                safePhone = '549' + safePhone.substring(2);
            }
            // Remove embedded "15" after area code if present
            const afterPrefix = safePhone.substring(3);
            if (afterPrefix.length > 10) {
                for (let i = 2; i <= 4; i++) {
                    if (afterPrefix.substring(i, i + 2) === '15') {
                        safePhone = '549' + afterPrefix.substring(0, i) + afterPrefix.substring(i + 2);
                        break;
                    }
                }
            }
        } else {
            // No country code - add Argentina prefix

            // Remove "15" prefix if present
            if (safePhone.startsWith('15')) {
                safePhone = safePhone.substring(2);
            }

            // Check for embedded "15" after area code
            if (safePhone.length > 10) {
                for (let i = 2; i <= 4; i++) {
                    if (safePhone.substring(i, i + 2) === '15') {
                        safePhone = safePhone.substring(0, i) + safePhone.substring(i + 2);
                        break;
                    }
                }
            }

            // Add country code 549 for Argentina mobile
            safePhone = '549' + safePhone;
        }

        const encodedMessage = encodeURIComponent(message);
        const url = `https://wa.me/${safePhone}?text=${encodedMessage}`;

        // Open WhatsApp
        window.open(url, '_blank');
        return true;
    },

    /**
     * Generate Welcome Message
     */
    getWelcomeMessage: (member) => {
        return `¡Hola ${member.first_name}! 👋 Te damos la bienvenida a AyD Funcional Gym.

Gracias por sumarte a nuestro entrenamiento. 💪
Cualquier duda que tengas, estamos a tu disposición.

¡A entrenar con todo! 🏋️‍♂️`;
    },

    /**
     * Generate Expiration Warning Message (1 week before)
     */
    getWarningMessage: (member, expirationDate) => {
        const dateObj = new Date(expirationDate);
        const dateStr = dateObj.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });

        return `¡Hola ${member.first_name}! 👋

Te recordamos que tu cuota de *AyD Funcional Gym* vence el día *${dateStr}* (en una semana).

Te esperamos para renovar y seguir entrenando sin interrupciones. 💪

¡Saludos!`;
    },

    /**
     * Generate Expiration Notice (Expired)
     */
    getExpirationMessage: (member) => {
        return `¡Hola ${member.first_name}! 👋

Tu cuota de *AyD Funcional Gym* ha finalizado. 📅

Te invitamos a renovarla para continuar con tus entrenamientos. ¡No pierdas el ritmo! 💪

¡Te esperamos!`;
    },

    /**
     * Generate Payment Confirmation Message
     */
    getPaymentConfirmationMessage: (member, amount, month) => {
        const formattedAmount = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS'
        }).format(amount);

        return `¡Hola ${member.first_name}! 👋

✅ *Confirmación de Pago*

📅 Mes: *${month}*
💰 Monto: *${formattedAmount}*

¡Gracias por tu pago! Seguí entrenando con todo. 💪

*AyD Funcional Gym*`;
    },

    /**
     * Generate Custom Reminder Message
     */
    getCustomMessage: (member, customText) => {
        return `¡Hola ${member.first_name}! 👋

${customText}

*AyD Funcional Gym*`;
    },

    /**
     * Generate Birthday Greeting
     */
    getBirthdayMessage: (member) => {
        return `¡Feliz Cumpleaños ${member.first_name}! 🎂🎉

Todo el equipo de *AyD Funcional Gym* te desea un día increíble lleno de alegría.

¡Que este nuevo año te traiga mucha salud y fuerza para seguir entrenando! 💪

¡Abrazo grande!`;
    }
};

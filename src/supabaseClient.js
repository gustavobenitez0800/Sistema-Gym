// supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let supabase = null;

try {
    console.log('[SUPABASE] Inicializando cliente...');
    console.log('[SUPABASE] URL:', SUPABASE_URL);
    console.log('[SUPABASE] KEY length:', SUPABASE_KEY?.length || 0);

    if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
        console.error('[SUPABASE] Configuration Missing! Please update src/config.js');
    } else if (!SUPABASE_KEY || SUPABASE_KEY.length < 20) {
        console.error('[SUPABASE] Invalid API key! Key seems too short.');
    } else {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('[SUPABASE] Cliente creado exitosamente');
    }
} catch (error) {
    console.error('[SUPABASE] Error al crear cliente:', error);
}

export { supabase };


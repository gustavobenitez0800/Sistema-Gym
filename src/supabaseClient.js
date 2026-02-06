// supabaseClient.js - Optimized
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let supabase = null;

try {
    if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
        console.error('[SUPABASE] Configuration Missing! Please update src/config.js');
    } else if (!SUPABASE_KEY || SUPABASE_KEY.length < 20) {
        console.error('[SUPABASE] Invalid API key! Key seems too short.');
    } else {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (error) {
    console.error('[SUPABASE] Error al crear cliente:', error);
}

export { supabase };

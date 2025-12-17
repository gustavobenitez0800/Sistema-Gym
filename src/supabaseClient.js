// supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let supabase = null;

if (SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    console.error('Supabase Configuration Missing! Please update src/config.js');
} else {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

export { supabase };

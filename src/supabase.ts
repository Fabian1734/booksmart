import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mxtzdmsxlvcidshoqoax.supabase.co'
const supabaseKey = sb_publishable_CzON1wflQJPN284Mmyzh4Q_6Y4Kwc18

export const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase

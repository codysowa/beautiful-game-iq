import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://itwydqejjyllnpvapuce.supabase.co'

const supabasePublishableKey = 'sb_publishable_E6q0D3GJqIIPqRr7WozGwg_e4wBSskR'

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
)
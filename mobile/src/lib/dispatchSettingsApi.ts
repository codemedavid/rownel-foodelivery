import { supabase } from './supabase';
import { mapDispatchSettings } from './adminMappers';
import type { DispatchSettings } from './adminTypes';

export const dispatchSettingsApi = {
  async get(): Promise<DispatchSettings> {
    const { data, error } = await supabase.from('dispatch_settings').select('*').eq('id', 1).single();
    if (error) throw new Error(error.message);
    return mapDispatchSettings(data as Record<string, unknown>);
  },

  async update(patch: Partial<DispatchSettings>): Promise<void> {
    const { error } = await supabase.rpc('update_dispatch_settings', { p: patch });
    if (error) throw new Error(error.message);
  },
};

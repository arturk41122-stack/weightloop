import { supabase } from './supabase';

/**
 * Загружает фото еды в приватный по записи, публичный по чтению бакет `meal-photos`.
 * Файлы кладутся в папку {userId}/... — это соответствует Storage-политике
 * meal_photos_own_write из supabase/migrations/0002_buddies_and_storage.sql.
 */
export async function uploadMealPhoto(file: File, userId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('meal-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });

  if (error) throw error;

  const { data } = supabase.storage.from('meal-photos').getPublicUrl(path);
  return data.publicUrl;
}

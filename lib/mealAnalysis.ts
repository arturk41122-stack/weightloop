import { supabase } from './supabase';

export interface MealAnalysis {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  feedback: string;
}

/**
 * Вызывает Edge Function analyze-meal с публичным URL уже загруженного фото.
 * Требует активную сессию Supabase (Authorization подставляется автоматически
 * supabase-js, если пользователь авторизован).
 */
export async function analyzeMealPhoto(photoUrl: string, notes: string): Promise<MealAnalysis> {
  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: { photoUrl, notes },
  });

  if (error) throw error;
  return data as MealAnalysis;
}

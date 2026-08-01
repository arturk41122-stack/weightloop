export interface UserProfile {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  full_name: string;
  target_weight: number;
  current_weight: number;
  goal: 'lose' | 'maintain';
  food_restrictions: string;
  reminder_time: string;
  created_at: string;
}

export interface Meal {
  id: string;
  user_id: string;
  date: string;
  photo_url: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  notes: string;
  ai_feedback: string;
}

export interface Sprint {
  id: string;
  user_id: string;
  title: string;
  days: number;
  target_lost: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed';
}

export interface Checkin {
  id: string;
  user_id: string;
  date: string;
  meal: string;
  steps: number;
  weight_change: number;
  notes: string;
}

export interface Buddy {
  id: string;
  user_id: string;
  buddy_id: string;
  status: 'active';
}

export interface BuddyInvite {
  id: string;
  from_user: string;
  to_username: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

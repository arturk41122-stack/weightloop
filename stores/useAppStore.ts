import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { UserProfile, Meal, Sprint, Checkin, Buddy, BuddyInvite } from '@/types';

interface AppState {
  profile: UserProfile | null;
  meals: Meal[];
  currentSprint: Sprint | null;
  buddies: Buddy[];
  dailyCheckins: Checkin[];
  incomingInvites: BuddyInvite[];
  isLoading: boolean;

  setProfile: (p: UserProfile) => void;
  loadUserData: (userId: string) => Promise<void>;

  addMeal: (m: Omit<Meal, 'id'>) => Promise<void>;
  startSprint: (s: Omit<Sprint, 'id'>) => Promise<void>;
  addCheckin: (c: Omit<Checkin, 'id'>) => Promise<void>;

  sendBuddyInvite: (toUsername: string) => Promise<void>;
  acceptBuddyInvite: (invite: BuddyInvite) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  profile: null,
  meals: [],
  currentSprint: null,
  buddies: [],
  dailyCheckins: [],
  incomingInvites: [],
  isLoading: false,

  setProfile: (p) => set({ profile: p }),

  // Подтягивает данные пользователя из Supabase после авторизации
  loadUserData: async (userId: string) => {
    set({ isLoading: true });
    const profileRes = await supabase.from('profiles').select('telegram_username').eq('id', userId).single();
    const myUsername = profileRes.data?.telegram_username;

    const [meals, sprint, checkins, buddies, invites] = await Promise.all([
      supabase.from('meals').select('*').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('sprints').select('*').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      supabase.from('checkins').select('*').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('buddies').select('*').eq('user_id', userId),
      myUsername
        ? supabase.from('buddy_invites').select('*').eq('to_username', myUsername).eq('status', 'pending')
        : Promise.resolve({ data: [] as BuddyInvite[] }),
    ]);

    set({
      meals: meals.data ?? [],
      currentSprint: sprint.data ?? null,
      dailyCheckins: checkins.data ?? [],
      buddies: buddies.data ?? [],
      incomingInvites: (invites.data as BuddyInvite[]) ?? [],
      isLoading: false,
    });
  },

  addMeal: async (m) => {
    const { data, error } = await supabase.from('meals').insert(m).select().single();
    if (error) throw error;
    set((state) => ({ meals: [data as Meal, ...state.meals] }));
  },

  startSprint: async (s) => {
    const { data, error } = await supabase.from('sprints').insert(s).select().single();
    if (error) throw error;
    set({ currentSprint: data as Sprint });
  },

  addCheckin: async (c) => {
    const { data, error } = await supabase.from('checkins').insert(c).select().single();
    if (error) throw error;
    set((state) => ({ dailyCheckins: [data as Checkin, ...state.dailyCheckins] }));
  },

  // Отправляет приглашение по telegram-юзернейму. Само добавление в buddies
  // происходит только когда приглашённый его примет (acceptBuddyInvite) —
  // так связь двусторонняя и не появляется в одностороннем порядке.
  sendBuddyInvite: async (toUsername: string) => {
    const { profile } = get();
    if (!profile) throw new Error('Профиль не загружен');

    const cleanUsername = toUsername.replace(/^@/, '').trim();
    if (!cleanUsername) throw new Error('Укажи юзернейм');

    const { error } = await supabase
      .from('buddy_invites')
      .insert({ from_user: profile.id, to_username: cleanUsername, status: 'pending' });
    if (error) throw error;
  },

  // Приглашённый принимает инвайт. Двусторонняя запись buddies создаётся
  // Edge Function'ом accept-buddy-invite (обычный клиент не может вставить
  // buddies-строку с чужим user_id — так и задумано в RLS).
  acceptBuddyInvite: async (invite: BuddyInvite) => {
    const { data, error } = await supabase.functions.invoke('accept-buddy-invite', {
      body: { inviteId: invite.id },
    });
    if (error) throw error;

    set((state) => ({
      buddies: [...state.buddies, data.buddy as Buddy],
      incomingInvites: state.incomingInvites.filter((i) => i.id !== invite.id),
    }));
  },
}));

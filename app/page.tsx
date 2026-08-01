'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { signInWithTelegram } from '@/lib/telegramAuth';
import { supabase } from '@/lib/supabase';
import { uploadMealPhoto } from '@/lib/storage';
import { analyzeMealPhoto } from '@/lib/mealAnalysis';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function WeightloopPage() {
  const {
    profile,
    meals,
    currentSprint,
    buddies,
    incomingInvites,
    setProfile,
    loadUserData,
    addMeal,
    startSprint,
    addCheckin,
    sendBuddyInvite,
    acceptBuddyInvite,
  } = useAppStore();

  const [tg, setTg] = useState<Window['Telegram']>();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [mealNotes, setMealNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [authReady, setAuthReady] = useState(false);
  const [buddyUsername, setBuddyUsername] = useState('');
  const [invitingBuddy, setInvitingBuddy] = useState(false);

  useEffect(() => {
    const initTelegram = async () => {
      if (typeof window === 'undefined' || !window.Telegram?.WebApp) {
        // Открыто в обычном браузере, а не внутри Telegram — просто пропускаем авторизацию
        setAuthReady(true);
        return;
      }

      const webApp = window.Telegram.WebApp;
      webApp.ready();
      webApp.expand();
      setTg(window.Telegram);

      try {
        await signInWithTelegram(webApp.initData);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (profileRow) {
            setProfile(profileRow);
            await loadUserData(user.id);
          }
        }
      } catch (err) {
        console.error('Telegram auth error:', err);
        toast.error('Не удалось авторизоваться через Telegram');
      } finally {
        setAuthReady(true);
      }
    };

    initTelegram();
  }, [loadUserData, setProfile]);

  const handlePhotoUpload = async () => {
    if (!photoFile || !profile) return;
    setAnalyzing(true);
    try {
      // 1. Реальная загрузка файла в Supabase Storage (bucket meal-photos)
      const publicUrl = await uploadMealPhoto(photoFile, profile.id);

      // 2. AI-анализ фото через Edge Function analyze-meal (Claude Vision)
      const analysis = await analyzeMealPhoto(publicUrl, mealNotes);

      await addMeal({
        user_id: profile.id,
        date: new Date().toISOString(),
        photo_url: publicUrl,
        calories: analysis.calories,
        proteins: analysis.proteins,
        carbs: analysis.carbs,
        fats: analysis.fats,
        notes: mealNotes,
        ai_feedback: analysis.feedback,
      });

      setPhotoFile(null);
      setPhotoPreview('');
      setMealNotes('');
      tg?.WebApp.showAlert(analysis.feedback || 'Фото принято! Бот дал фидбек');
    } catch (err) {
      console.error(err);
      toast.error('Не получилось обработать фото. Попробуй ещё раз.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePhotoSelect = (file: File | undefined) => {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleDailyCheckin = async () => {
    if (!profile) return;
    try {
      await addCheckin({
        user_id: profile.id,
        date: new Date().toISOString(),
        meal: 'Обед',
        steps: 8000,
        weight_change: 0.3,
        notes: 'Сорвался на сладком',
      });
      tg?.WebApp.showAlert('Чек-ин сохранён! Ты молодец.');
    } catch {
      toast.error('Не получилось сохранить чек-ин');
    }
  };

  const startNewSprint = async () => {
    if (!profile) return;
    try {
      await startSprint({
        user_id: profile.id,
        title: 'Минус 3 кг за 30 дней',
        days: 30,
        target_lost: 3,
        start_date: new Date().toISOString(),
        end_date: '',
        status: 'active',
      });
    } catch {
      toast.error('Не получилось запустить спринт');
    }
  };

  const handleInviteBuddy = async () => {
    if (!buddyUsername.trim()) return;
    setInvitingBuddy(true);
    try {
      await sendBuddyInvite(buddyUsername);
      toast.success(`Приглашение отправлено @${buddyUsername.replace(/^@/, '')}`);
      setBuddyUsername('');
    } catch (err) {
      console.error(err);
      toast.error('Не получилось отправить приглашение');
    } finally {
      setInvitingBuddy(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    const invite = incomingInvites.find((i) => i.id === inviteId);
    if (!invite) return;
    try {
      await acceptBuddyInvite(invite);
      toast.success('Теперь вы бадди!');
    } catch (err) {
      console.error(err);
      toast.error('Не получилось принять приглашение');
    }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  return (
    <div className="max-w-[428px] mx-auto bg-white min-h-screen overflow-hidden relative">
      <header className="bg-gradient-to-r from-pink-500 to-purple-600 text-white p-4 text-center font-bold text-xl">
        WEIGHTLOOP
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="home">🏠</TabsTrigger>
          <TabsTrigger value="photo">📸</TabsTrigger>
          <TabsTrigger value="checkin">✅</TabsTrigger>
          <TabsTrigger value="sprint">🔥</TabsTrigger>
          <TabsTrigger value="account">👤</TabsTrigger>
        </TabsList>

        {/* HOME — прогресс */}
        <TabsContent value="home">
          <Card className="p-6 text-center">
            <Avatar className="w-24 h-24 mx-auto mb-4">
              <AvatarImage src={undefined} alt={profile?.full_name ?? 'Профиль'} />
              <AvatarFallback>👤</AvatarFallback>
            </Avatar>
            <h2 className="text-3xl font-bold">Ты уже минус 1.8 кг!</h2>
            <p className="text-4xl text-green-600 mt-2">—1.8 кг</p>
            <div className="h-2 bg-gray-200 rounded mt-4 overflow-hidden">
              <div className="h-2 bg-green-500 w-[70%] rounded"></div>
            </div>
            {currentSprint && <Badge className="mt-4">Спринт: {currentSprint.title}</Badge>}
            <Button onClick={startNewSprint} className="mt-6 w-full">
              Начать новый спринт
            </Button>
          </Card>
        </TabsContent>

        {/* PHOTO */}
        <TabsContent value="photo">
          <Card className="p-6">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
              disabled={analyzing}
            />
            {photoPreview && <img src={photoPreview} className="mt-4 rounded-xl max-h-64 mx-auto" alt="Фото еды" />}
            <Input
              placeholder="Что съел сегодня?"
              value={mealNotes}
              onChange={(e) => setMealNotes(e.target.value)}
              className="mt-4"
              disabled={analyzing}
            />
            <Button onClick={handlePhotoUpload} className="mt-6 w-full" disabled={!photoFile || analyzing}>
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Бот анализирует фото...
                </>
              ) : (
                'Отправить фото боту'
              )}
            </Button>
          </Card>

          {meals.length > 0 && (
            <div className="mt-4 space-y-3">
              {meals.slice(0, 5).map((m) => (
                <Card key={m.id} className="p-4 flex gap-3">
                  {m.photo_url && (
                    <img src={m.photo_url} className="w-16 h-16 rounded-lg object-cover shrink-0" alt="" />
                  )}
                  <div className="text-sm">
                    <div className="font-medium">
                      {m.calories} ккал · Б{m.proteins} У{m.carbs} Ж{m.fats}
                    </div>
                    {m.ai_feedback && <div className="text-muted-foreground mt-1">{m.ai_feedback}</div>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CHECKIN */}
        <TabsContent value="checkin">
          <Card className="p-6 space-y-6">
            <div className="text-center">📸 Фото еды (опционально)</div>
            <div>
              Шаги: <Input type="number" defaultValue={8500} />
            </div>
            <div>
              Вес: <Input type="number" step="0.1" defaultValue={71.2} />
            </div>
            <Button onClick={handleDailyCheckin} className="w-full">
              Сохранить чек-ин
            </Button>
          </Card>
        </TabsContent>

        {/* SPRINT */}
        <TabsContent value="sprint">
          <Card className="p-6">
            <h3 className="font-bold text-lg">Твой текущий спринт</h3>
            {currentSprint ? (
              <p className="mt-2">
                {currentSprint.title} — {currentSprint.target_lost} кг
              </p>
            ) : (
              <p className="mt-2 text-muted-foreground">Нет активного спринта</p>
            )}
            <Button onClick={startNewSprint} className="mt-4 w-full">
              Запустить спринт
            </Button>
          </Card>
        </TabsContent>

        {/* ACCOUNT */}
        <TabsContent value="account">
          <Card className="p-6 space-y-6">
            {incomingInvites.length > 0 && (
              <div>
                <h3 className="font-bold text-sm mb-2">Приглашения ({incomingInvites.length})</h3>
                <div className="space-y-2">
                  {incomingInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between bg-secondary rounded-lg p-3">
                      <span className="text-sm">Приглашение в бадди</span>
                      <Button size="sm" onClick={() => handleAcceptInvite(inv.id)}>
                        Принять
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-bold">Мои бадди</h3>
              {buddies.length === 0 && <p className="text-sm text-muted-foreground mt-2">Пока нет бадди</p>}
              {buddies.map((b) => (
                <p key={b.id} className="text-sm mt-1">
                  Бадди #{b.buddy_id.slice(0, 8)} — в команде
                </p>
              ))}
            </div>

            <div>
              <Input
                placeholder="@username друга в Telegram"
                value={buddyUsername}
                onChange={(e) => setBuddyUsername(e.target.value)}
              />
              <Button
                onClick={handleInviteBuddy}
                variant="outline"
                className="mt-2 w-full"
                disabled={invitingBuddy || !buddyUsername.trim()}
              >
                {invitingBuddy ? 'Отправляем...' : 'Пригласить друга'}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Друг увидит приглашение, когда откроет WEIGHTLOOP — нужно, чтобы у него уже был
                привязан юзернейм Telegram в профиле.
              </p>
            </div>

            <div className="text-sm text-gray-500">Версия 1.0 • 30 дней — результат гарантирован</div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* FAB для фото */}
      <Sheet>
        <SheetTrigger asChild>
          <Button className="fixed bottom-6 right-6 w-16 h-16 rounded-full shadow-xl bg-gradient-to-br from-pink-500 to-purple-600 p-0">
            <Camera size={28} />
          </Button>
        </SheetTrigger>
        <SheetContent>
          <div className="space-y-4">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
              disabled={analyzing}
            />
            {photoPreview && <img src={photoPreview} className="rounded-xl max-h-64 mx-auto" alt="Фото еды" />}
            <Input
              placeholder="Что съел сегодня?"
              value={mealNotes}
              onChange={(e) => setMealNotes(e.target.value)}
              disabled={analyzing}
            />
            <Button onClick={handlePhotoUpload} className="w-full" disabled={!photoFile || analyzing}>
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Бот анализирует фото...
                </>
              ) : (
                'Отправить фото боту'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Сначала нужно авторизоваться через Telegram');
        return;
      }

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: fullName,
        current_weight: Number(currentWeight),
        target_weight: Number(targetWeight),
        goal: 'lose',
      });

      if (error) throw error;

      toast.success('Профиль сохранён!');
      router.push('/');
    } catch (err) {
      console.error(err);
      toast.error('Не получилось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[428px] mx-auto min-h-screen p-6">
      <h1 className="text-2xl font-bold mb-6">Настроим твой профиль</h1>
      <Card className="p-6 space-y-4">
        <div>
          <Label htmlFor="fullName">Имя</Label>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="currentWeight">Текущий вес (кг)</Label>
          <Input
            id="currentWeight"
            type="number"
            step="0.1"
            value={currentWeight}
            onChange={(e) => setCurrentWeight(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="targetWeight">Целевой вес (кг)</Label>
          <Input
            id="targetWeight"
            type="number"
            step="0.1"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button onClick={handleSubmit} disabled={saving} className="w-full">
          {saving ? 'Сохраняем...' : 'Продолжить'}
        </Button>
      </Card>
    </div>
  );
}

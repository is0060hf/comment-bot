/**
 * 安全設定フォームコンポーネント
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateSafetySettings } from '@/app/actions/safety';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/use-toast';

// バリデーションスキーマ
const safetySettingsSchema = z.object({
  level: z.enum(['strict', 'standard', 'relaxed']),
  enabled: z.boolean(),
  blockOnUncertainty: z.boolean(),
  moderationThresholds: z.object({
    hate: z.number().min(0).max(1),
    harassment: z.number().min(0).max(1),
    'self-harm': z.number().min(0).max(1),
    sexual: z.number().min(0).max(1),
    violence: z.number().min(0).max(1),
    illegal: z.number().min(0).max(1),
    graphic: z.number().min(0).max(1),
  }),
});

type SafetySettingsFormData = z.infer<typeof safetySettingsSchema>;

interface SafetySettingsFormProps {
  initialData: any;
}

// レベルに応じたデフォルト閾値
const levelThresholds = {
  strict: {
    hate: 0.5,
    harassment: 0.5,
    'self-harm': 0.6,
    sexual: 0.6,
    violence: 0.5,
    illegal: 0.7,
    graphic: 0.6,
  },
  standard: {
    hate: 0.7,
    harassment: 0.7,
    'self-harm': 0.8,
    sexual: 0.8,
    violence: 0.7,
    illegal: 0.9,
    graphic: 0.8,
  },
  relaxed: {
    hate: 0.9,
    harassment: 0.9,
    'self-harm': 0.95,
    sexual: 0.95,
    violence: 0.9,
    illegal: 0.95,
    graphic: 0.9,
  },
};

export function SafetySettingsForm({ initialData }: SafetySettingsFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SafetySettingsFormData>({
    resolver: zodResolver(safetySettingsSchema),
    defaultValues: {
      level: initialData.level || 'standard',
      enabled: initialData.enabled ?? true,
      blockOnUncertainty: initialData.blockOnUncertainty ?? false,
      moderationThresholds: initialData.moderationThresholds || levelThresholds.standard,
    },
  });

  const watchLevel = watch('level');
  const watchEnabled = watch('enabled');

  // レベル変更時に閾値を自動更新
  useEffect(() => {
    const thresholds = levelThresholds[watchLevel];
    Object.entries(thresholds).forEach(([key, value]) => {
      setValue(`moderationThresholds.${key}` as any, value);
    });
  }, [watchLevel, setValue]);

  const onSubmit = async (data: SafetySettingsFormData) => {
    try {
      setSaving(true);
      const result = await updateSafetySettings(data);

      if (result.success) {
        toast({
          title: '安全設定を更新しました',
          description: '新しい設定が適用されました',
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: 'エラー',
        description: '設定の保存に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const categoryLabels: Record<string, string> = {
    hate: 'ヘイトスピーチ',
    harassment: 'ハラスメント',
    'self-harm': '自傷行為',
    sexual: '性的コンテンツ',
    violence: '暴力',
    illegal: '違法行為',
    graphic: 'グラフィックコンテンツ',
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 安全レベル */}
      <div className="space-y-2">
        <Label htmlFor="level">安全レベル</Label>
        <Select
          value={watch('level')}
          onValueChange={(value) => setValue('level', value as any)}
        >
          <SelectTrigger id="level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strict">厳格</SelectItem>
            <SelectItem value="standard">標準</SelectItem>
            <SelectItem value="relaxed">緩和</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-gray-600">
          安全レベルに応じて、各カテゴリの閾値が自動的に設定されます
        </p>
      </div>

      {/* 有効/無効 */}
      <div className="flex items-center space-x-2">
        <Switch
          id="enabled"
          checked={watch('enabled')}
          onCheckedChange={(checked) => setValue('enabled', checked)}
        />
        <Label htmlFor="enabled">安全フィルタリングを有効にする</Label>
      </div>

      {/* 不確実な場合のブロック */}
      <div className="flex items-center space-x-2">
        <Switch
          id="blockOnUncertainty"
          checked={watch('blockOnUncertainty')}
          onCheckedChange={(checked) => setValue('blockOnUncertainty', checked)}
          disabled={!watchEnabled}
        />
        <Label htmlFor="blockOnUncertainty">不確実な場合もブロック</Label>
      </div>

      {/* カテゴリ別閾値 */}
      {watchEnabled && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">カテゴリ別閾値</h3>
          <p className="text-sm text-gray-600">
            各カテゴリの検出感度を設定します（0: 最も緩い、1: 最も厳しい）
          </p>
          
          {Object.entries(categoryLabels).map(([key, label]) => {
            const value = watch(`moderationThresholds.${key}` as any) || 0.5;
            const errorMessage = errors.moderationThresholds?.[key as keyof typeof errors.moderationThresholds]?.message;
            
            return (
              <div key={key} className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor={key}>{label}</Label>
                  <span className="text-sm text-gray-600">
                    {Math.round(value * 100)}%
                  </span>
                </div>
                <Slider
                  id={key}
                  min={0}
                  max={1}
                  step={0.05}
                  value={[value]}
                  onValueChange={(values) => 
                    setValue(`moderationThresholds.${key}` as any, values[0])
                  }
                  disabled={!watchEnabled}
                />
                {errorMessage && (
                  <p className="text-sm text-red-600">
                    0から1の間で設定してください
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 保存ボタン */}
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? '保存中...' : '設定を保存'}
      </Button>
    </form>
  );
}

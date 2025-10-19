/**
 * コメント設定フォームコンポーネント
 */

'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateSettings } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

// バリデーションスキーマ
const commentSettingsSchema = z.object({
  tone: z.enum(['friendly', 'casual', 'formal', 'enthusiastic']),
  characterPersona: z.string().min(1, 'キャラクター設定は必須です'),
  targetLength: z.object({
    min: z.number().min(10).max(200),
    max: z.number().min(10).max(200),
  }).refine(data => data.min <= data.max, {
    message: '最小文字数は最大文字数以下にしてください',
    path: ['min'],
  }),
  emojiPolicy: z.object({
    enabled: z.boolean(),
    maxCount: z.number().min(0).max(10),
  }),
});

type CommentSettingsFormData = z.infer<typeof commentSettingsSchema>;

interface CommentSettingsFormProps {
  initialData: any;
}

export function CommentSettingsForm({ initialData }: CommentSettingsFormProps) {
  const { toast } = useToast();
  const [ngWords, setNgWords] = useState<string[]>(initialData.ngWords || []);
  const [ngWordInput, setNgWordInput] = useState('');
  const [encouragedExpressions, setEncouragedExpressions] = useState<string[]>(
    initialData.encouragedExpressions || []
  );
  const [expressionInput, setExpressionInput] = useState('');
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CommentSettingsFormData>({
    resolver: zodResolver(commentSettingsSchema),
    defaultValues: {
      tone: initialData.tone || 'friendly',
      characterPersona: initialData.characterPersona || '',
      targetLength: {
        min: initialData.targetLength?.min || 20,
        max: initialData.targetLength?.max || 100,
      },
      emojiPolicy: {
        enabled: initialData.emojiPolicy?.enabled ?? true,
        maxCount: initialData.emojiPolicy?.maxCount || 3,
      },
    },
  });

  const onSubmit = async (data: CommentSettingsFormData) => {
    try {
      setSaving(true);
      const result = await updateSettings({
        comment: {
          ...data,
          ngWords,
          encouragedExpressions,
        },
      });

      if (result.success) {
        toast({
          title: '設定を保存しました',
          description: 'コメント設定が正常に更新されました',
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

  const addNgWord = () => {
    if (ngWordInput.trim() && !ngWords.includes(ngWordInput.trim())) {
      setNgWords([...ngWords, ngWordInput.trim()]);
      setNgWordInput('');
    }
  };

  const removeNgWord = (index: number) => {
    setNgWords(ngWords.filter((_, i) => i !== index));
  };

  const addExpression = () => {
    if (expressionInput.trim() && !encouragedExpressions.includes(expressionInput.trim())) {
      setEncouragedExpressions([...encouragedExpressions, expressionInput.trim()]);
      setExpressionInput('');
    }
  };

  const removeExpression = (index: number) => {
    setEncouragedExpressions(encouragedExpressions.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* トーン */}
      <div className="space-y-2">
        <Label htmlFor="tone">トーン</Label>
        <Select
          value={watch('tone')}
          onValueChange={(value) => setValue('tone', value as any)}
        >
          <SelectTrigger id="tone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="friendly">フレンドリー</SelectItem>
            <SelectItem value="casual">カジュアル</SelectItem>
            <SelectItem value="formal">フォーマル</SelectItem>
            <SelectItem value="enthusiastic">熱心</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* キャラクター設定 */}
      <div className="space-y-2">
        <Label htmlFor="characterPersona">キャラクター設定</Label>
        <Textarea
          id="characterPersona"
          {...register('characterPersona')}
          placeholder="配信を楽しんでいる親しみやすい視聴者"
          rows={3}
        />
        {errors.characterPersona && (
          <p className="text-sm text-red-600">{errors.characterPersona.message}</p>
        )}
      </div>

      {/* コメント長さ */}
      <div className="space-y-2">
        <Label>コメント長さ</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="minLength">最小文字数</Label>
            <Input
              id="minLength"
              type="number"
              {...register('targetLength.min', { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="maxLength">最大文字数</Label>
            <Input
              id="maxLength"
              type="number"
              {...register('targetLength.max', { valueAsNumber: true })}
            />
          </div>
        </div>
        {errors.targetLength?.min && (
          <p className="text-sm text-red-600">{errors.targetLength.min.message}</p>
        )}
      </div>

      {/* 推奨表現 */}
      <div className="space-y-2">
        <Label>推奨表現</Label>
        <div className="flex gap-2">
          <Input
            placeholder="推奨表現を入力"
            value={expressionInput}
            onChange={(e) => setExpressionInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addExpression();
              }
            }}
          />
          <Button type="button" onClick={addExpression} variant="secondary">
            追加
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {encouragedExpressions.map((expression, index) => (
            <Badge key={index} variant="secondary">
              {expression}
              <button
                type="button"
                onClick={() => removeExpression(index)}
                className="ml-1 text-xs"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* NGワード */}
      <div className="space-y-2">
        <Label>NGワード</Label>
        <div className="flex gap-2">
          <Input
            placeholder="NGワードを入力"
            value={ngWordInput}
            onChange={(e) => setNgWordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addNgWord();
              }
            }}
          />
          <Button type="button" onClick={addNgWord} variant="secondary">
            追加
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {ngWords.map((word, index) => (
            <Badge key={index} variant="destructive">
              {word}
              <button
                type="button"
                onClick={() => removeNgWord(index)}
                className="ml-1 text-xs"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* 絵文字設定 */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="emojiEnabled"
            checked={watch('emojiPolicy.enabled')}
            onCheckedChange={(checked) => setValue('emojiPolicy.enabled', checked)}
          />
          <Label htmlFor="emojiEnabled">絵文字を有効にする</Label>
        </div>

        {watch('emojiPolicy.enabled') && (
          <div className="space-y-2">
            <Label htmlFor="maxEmojiCount">最大絵文字数</Label>
            <Input
              id="maxEmojiCount"
              type="number"
              {...register('emojiPolicy.maxCount', { valueAsNumber: true })}
              min={0}
              max={10}
            />
          </div>
        )}
      </div>

      {/* 保存ボタン */}
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? '保存中...' : '保存'}
      </Button>
    </form>
  );
}

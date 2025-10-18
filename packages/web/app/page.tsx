import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Comment Bot</h1>
        <p className="text-lg text-muted-foreground mb-8">
          YouTube Live配信の内容に応じて、自動でコメントを生成・投稿するボットです。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>ダッシュボード</CardTitle>
              <CardDescription>配信ステータスやコメント履歴を確認できます。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <a href="/dashboard">ダッシュボードへ</a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>設定</CardTitle>
              <CardDescription>コメントの生成ルールや投稿頻度を設定できます。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" asChild>
                <a href="/settings">設定へ</a>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8 border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <p className="text-sm text-yellow-800">
              <strong>注意：</strong>
              このアプリケーションを使用する前に、ローカルエージェントが起動していることを確認してください。
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

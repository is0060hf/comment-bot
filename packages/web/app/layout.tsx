import { Inter } from 'next/font/google';

import type { Metadata } from 'next';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Comment Bot - YouTube Live配信コメント管理',
  description: '配信内容に応じて自動でコメントを生成・投稿するボット',
  keywords: ['YouTube', 'Live', 'コメント', 'ボット', '自動化'],
  authors: [{ name: 'Comment Bot Team' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#000000',
  robots: 'noindex, nofollow', // 管理画面なので検索エンジンにインデックスさせない
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">{children}</div>
      </body>
    </html>
  );
}

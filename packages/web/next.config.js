/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // TypeScript設定
  typescript: {
    // ビルド時の型チェックはCIで行うため、ローカルビルドでは無効化可能
    ignoreBuildErrors: false,
  },

  // ESLint設定
  eslint: {
    // ビルド時のESLintチェックはCIで行うため、ローカルビルドでは無効化可能
    ignoreDuringBuilds: false,
  },

  // 画像最適化設定
  images: {
    domains: [],
    formats: ['image/avif', 'image/webp'],
  },

  // 実験的機能
  experimental: {
    // Server Actionsを有効化
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Webpack設定のカスタマイズ
  webpack: (config, { isServer }) => {
    return config;
  },

  // 環境変数の設定
  env: {
    NEXT_PUBLIC_APP_NAME: 'Comment Bot',
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '1.0.0',
  },
};

module.exports = nextConfig;

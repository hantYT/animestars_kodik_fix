const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isDevelopment = !isProduction;
  
  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? false : 'source-map',
    
    entry: {
      'content-script': './src/content/content-script.ts',
      'background': './src/background/background.ts'
    },
    
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true, // Очищает dist автоматически
      environment: {
        // Поддержка современных браузеров
        arrowFunction: true,
        const: true,
        destructuring: true,
        forOf: true
      }
    },
    
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: isDevelopment, // Быстрая сборка в dev режиме
                experimentalWatchApi: isDevelopment,
                // Оптимизация для production
                compilerOptions: {
                  declaration: false,
                  declarationMap: false,
                  sourceMap: isDevelopment
                }
              }
            }
          ],
          exclude: /node_modules/
        }
      ]
    },
    
    resolve: {
      extensions: ['.ts', '.js'],
      // Алиасы для удобства импорта
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@api': path.resolve(__dirname, 'src/api'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@content': path.resolve(__dirname, 'src/content'),
        '@types': path.resolve(__dirname, 'src/types'),
        '@styles': path.resolve(__dirname, 'src/styles')
      },
      // Исключаем большие пакеты из бандла если не используются
      fallback: {
        "crypto": false,
        "buffer": false,
        "stream": false
      }
    },
    
    target: 'web',
    
    optimization: {
      minimize: isProduction,
      minimizer: isProduction ? [
        new TerserPlugin({
          terserOptions: {
            compress: {
              // Агрессивные оптимизации для production
              drop_console: true,
              drop_debugger: true,
              pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
              passes: 2, // Дополнительные проходы оптимизации
              unsafe: true,
              unsafe_arrows: true,
              unsafe_methods: true,
              unsafe_proto: true
            },
            mangle: {
              // Сохраняем важные имена для Chrome extension API
              keep_classnames: /^(KodikAPI|AnimeStarsKodikOptimizer|FastVideoPlayer)$/,
              keep_fnames: /^(init|getToken|search|getVideoUrl)$/,
              safari10: true
            },
            format: {
              // Минимизируем размер
              comments: false,
              ascii_only: true
            }
          },
          extractComments: false,
          parallel: true // Параллельная минификация
        })
      ] : [],
      
      // Code splitting для уменьшения размера
      splitChunks: isProduction ? {
        chunks: 'all',
        cacheGroups: {
          // Выносим общие утилиты в отдельный чанк
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10
          },
          // Общие утилиты приложения
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            priority: 5,
            reuseExistingChunk: true
          }
        }
      } : false,
      
      // Оптимизация runtime кода
      runtimeChunk: false, // Отключаем для Chrome extension
      
      // Дополнительные оптимизации
      providedExports: true,
      usedExports: true,
      sideEffects: false, // Включаем tree-shaking
      
      // Модуль concatenation для лучшей производительности
      concatenateModules: isProduction
    },
    
    plugins: [
      // Очищаем dist перед сборкой
      new CleanWebpackPlugin({
        cleanStaleWebpackAssets: false
      }),
      
      // Копируем статические файлы с оптимизацией
      new CopyWebpackPlugin({
        patterns: [
          // Манифест
          {
            from: 'manifest.json',
            to: 'manifest.json'
          },
          
          // Стили
          {
            from: 'src/styles',
            to: '.',
            globOptions: {
              ignore: ['**/.gitkeep']
            },
            noErrorOnMissing: true
          },
          
          // Popup файлы
          {
            from: 'src/popup',
            to: '.',
            globOptions: {
              ignore: ['**/.gitkeep']
            },
            noErrorOnMissing: true
          },
          
          // Иконки
          {
            from: 'assets/icons',
            to: 'icons',
            globOptions: {
              ignore: ['**/.gitkeep']
            },
            noErrorOnMissing: true
          },
          
          // HLS.js библиотека с оптимизацией
          {
            from: 'assets/hls.min.js',
            to: 'hls.min.js'
          }
        ]
      })
    ],
    
    // Настройки для разработки
    devServer: isDevelopment ? {
      static: {
        directory: path.join(__dirname, 'dist'),
      },
      compress: true,
      port: 9000,
      hot: false, // HMR не работает с Chrome extensions
    } : undefined,
    
    // Оптимизация производительности сборки
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 250000, // 250KB
      maxAssetSize: 250000,
      assetFilter: (assetFilename) => {
        // Игнорируем большие статические файлы
        return !assetFilename.endsWith('.map') && !assetFilename.endsWith('.min.js');
      }
    },
    
    // Статистика сборки
    stats: {
      assets: true,
      colors: true,
      errors: true,
      errorDetails: true,
      hash: false,
      modules: false,
      performance: true,
      timings: true,
      warnings: true,
      // Показываем размеры чанков в production
      chunks: isProduction,
      chunkModules: false,
      children: false
    },
    
    // Настройки кэширования для быстрой пересборки
    cache: {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename],
        tsconfig: [path.resolve(__dirname, 'tsconfig.json')]
      },
      // Кэш в development режиме
      cacheDirectory: path.resolve(__dirname, '.webpack-cache'),
      name: `${argv.mode}-cache`
    },
    
    // Дополнительные эксперименты для оптимизации
    experiments: {
      // Топологическое упорядочивание для лучшего tree-shaking
      topLevelAwait: false, // Не поддерживается в Chrome extensions
      
      // Оптимизация CSS
      css: false // Используем внешние CSS файлы
    },
    
    // Внешние зависимости (не включаем в бандл)
    externals: isDevelopment ? {} : {
      // Можно исключить большие библиотеки если они загружаются отдельно
    },
    
    // Профилирование для анализа производительности
    profile: isDevelopment,
    
    // Настройки резолвера модулей для быстрой сборки
    resolveLoader: {
      modules: ['node_modules'],
      extensions: ['.js', '.json'],
      mainFields: ['loader', 'main']
    },
    
    // Дополнительные оптимизации Node.js
    node: {
      global: false,
      __filename: false,
      __dirname: false
    },
    
    // Настройки для watch mode
    watchOptions: isDevelopment ? {
      aggregateTimeout: 300,
      poll: undefined,
      ignored: /node_modules/
    } : undefined
  };
};

// Экспортируем дополнительную конфигурацию для анализа
module.exports.analyze = (env, argv) => {
  const config = module.exports(env, argv);
  
  // Добавляем Bundle Analyzer для анализа размера
  const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
  
  config.plugins.push(
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      reportFilename: 'bundle-analysis.html'
    })
  );
  
  return config;
};

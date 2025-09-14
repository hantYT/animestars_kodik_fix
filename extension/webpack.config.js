const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
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
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    target: 'web',
    optimization: {
      minimize: isProduction,
      minimizer: isProduction ? [
        new TerserPlugin({
          terserOptions: {
            compress: {
              // Удаляем console.log в production
              drop_console: true,
              drop_debugger: true,
              pure_funcs: ['console.log', 'console.info', 'console.debug']
            },
            mangle: {
              // Сохраняем имена классов для Chrome extension API
              keep_classnames: true,
              keep_fnames: true
            },
            format: {
              // Удаляем комментарии
              comments: false
            }
          },
          extractComments: false
        })
      ] : []
    },
    plugins: [
      // Очищаем dist перед сборкой
      new CleanWebpackPlugin(),
      
      // Копируем статические файлы
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
          // HLS.js библиотека
          {
            from: 'assets/hls.min.js',
            to: 'hls.min.js',
            noErrorOnMissing: true
          },
          // Любые другие статические ресурсы
          {
            from: 'assets/static',
            to: '.',
            globOptions: {
              ignore: ['**/.gitkeep']
            },
            noErrorOnMissing: true
          }
        ]
      })
    ]
  };
};

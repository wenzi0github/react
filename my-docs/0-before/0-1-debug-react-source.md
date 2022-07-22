# React18源码解析之搭建调试环境

我们在阅读 React 源码时，如果很生硬地去看，阅读起来可能会非常困难，不知道整个代码的流转流程是什么，某个函数的输入是什么，又返回了什么，等等。

因此，我们使用 [create-react-app](https://create-react-app.dev) 脚手架搭建一个建议的项目，来调试 React18 源码。在调试某个函数时，就可以直接打断点或者输出一些 log，来帮助我们理解源码。

这里我已经搭建好了一个调试环境：[wenzi0github/debug-react](https://github.com/wenzi0github/debug-react)，如果您想自己搭建一下，可以顺着下面的步骤一步步来进行操作。

## 1. 初始化项目并弹出配置

首先创建一个项目：

```shell
$ npx create-react-app debug-react
```

我们需要修改很多 webpack 相关的配置，这里把配置弹出来，修改起来更方便一些。

```shell
$ yarn eject
```

## 2. 引入 React 源码

建议从官方仓库 [facebook/react](https://github.com/facebook/react) fork 一份到自己的名下，这样修改起来还方便一些。如我自己 fork 出来的仓库地址：[wenzi0github/react](https://github.com/wenzi0github/react)。

在 src 目录中引入 react 源码，大概结构如下：

```shell
src
  react # react源码
  App.js
  index.js
```

进入到 react 源码的目录，安装 react 所需要的 npm 包：

```shell
$ npm i

# or

$ yarn install
```

我这里把 debug-react 和 fork 出来的 react 源码放到了两个 Git 仓库中，因此需要在在 debug-react 项目的`.gitignore`文件中，将 src/react 添加到忽略目录中。若您希望都放在一个 Git 仓库中，则可以不修改这里。

## 3. 修改 React 中的相关代码

react 源码在项目中无法直接使用，这里需要稍微修改下。

注意，我这里的 React 的版本是`18.1.0`；若是其他版本，修改方式可能会有些差异。

> 请注意 React 版本上的差异!

### 3.1 eslint 的修改

在`.eslintrc.js`中，

1. 把 extends: ['fbjs', 'prettier'] 的数组设置为空；
2. plugins 中的 react 注释掉；
3. rules 中的`no-unused-vars`设置为 OFF；
4. rules 中的`react-internal/no-production-logging` 设置为 OFF；

具体如下：

```javascript
// 我们忽略其他未修改的属性
module.exports = {
  extends: [], // ['fbjs', 'prettier'], debug-react 的需要
  plugins: [
    'jest',
    'no-for-of-loops',
    'no-function-declare-after-return',
    'react',
    // 'react', // debug-react 的需要
    'react-internal',
  ],
  rules: {
    'no-unused-vars': OFF, // [ERROR, {args: 'none'}], debug-react 的需要
    'react-internal/no-production-logging': OFF, // ERROR, debug-react 的需要
  },
};
```

后续在调试的过程，若还有其他 eslint 方面的报错，可以在这个文件里将其对应的规则关闭掉，然后重启即可。

### 3.2 源码的修改

#### 3.2.1 packages/scheduler/index.js

新增如下代码：

```javascript
export {
  unstable_flushAllWithoutAsserting,
  unstable_flushNumberOfYields,
  unstable_flushExpired,
  unstable_clearYields,
  unstable_flushUntilNextPaint,
  unstable_flushAll,
  unstable_yieldValue,
  unstable_advanceTime,
  unstable_setDisableYieldValue,
} from './src/forks/SchedulerMock';
```

#### 3.2.2 packages/react-reconciler/src/ReactFiberHostConfig.js

注释掉 throw error 的代码，并新增 export 的代码：

```javascript
// throw new Error('This module must be shimmed by a specific renderer.');
export * from './forks/ReactFiberHostConfig.dom';
```

#### 3.2.3 packages/shared/ReactSharedInternals.js

注释掉 import 和 const 声明的代码，重新进行 import 引入：

```javascript
// import * as React from 'react';

// const ReactSharedInternals =
//   React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

import ReactSharedInternals from '../react/src/ReactSharedInternals';

export default ReactSharedInternals;
```

#### 3.2.4 packages/react/index.js

设置默认导出，源码中只有 export 的方式，若外部直接使用，需要用`* as React`这种格式导出成全局变量。React 源码中也有解释：

```javascript
// Export all exports so that they're available in tests.
// We can't use export * from in Flow for some reason.
```

在 Flow 语法中，我们无法用 `export *` 的这种方式来导出所有方法。

因此这里我们单独添加一个默认导出。

```javascript
// 在文件的最底部

import * as React from './src/React';
export default React;
```

#### 3.2.5 packages/react-dom/client.js

同上面的 react 原因，这里我们修改下 ReactDOM：

```javascript
// 在文件的最底部

const ReactDOM = { createRoot, hydrateRoot };
export default ReactDOM;
```

## 4. debug-react 的修改

cra 的脚手架也需要稍微修改下。配置修改对应的 commit：[chore(config): update config to load react source](https://github.com/wenzi0github/debug-react/commit/e601994b474f8a61142b04450eae68ca13f88fd0)

### 4.1 添加全局变量

react 源码中有不少的全局变量，如`__DEV__`等，这里我们需要在`config/env.js`中添加上，否则会提示找不到这个全局变量。

注意，我们回到了最外层的 debug-react 项目了，是修改的用`yarn eject`弹出的配置。我们在变量 stringified 中添加下述变量：

```javascript
// config/env.js

const stringified = {
  'process.env': Object.keys(raw).reduce((env, key) => {
    env[key] = JSON.stringify(raw[key]);
    return env;
  }, {}),

  // 新增全局变量
  __DEV__: true,
  __PROFILE__: true,
  __UMD__: true,
  __EXPERIMENTAL__: true,
  __VARIANT__: false,
  // 新增全局变量结束
};
```

### 4.2 添加别名 alias

修改 webpack 配置中的别名 alias，用于调整引入的 React, ReactDOM 的引用位置。

修改的文件： config/webpack.config.js

```javascript
// config/webpack.config.js

module.exports = function () {
  return {
    // 新增别名
    resolve: {
      alias: {
        // Support React Native Web
        // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
        'react-native': 'react-native-web',
        // Allows for better profiling with ReactDevTools
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        ...(modules.webpackAliases || {}),

        // 新增的 alias
        react: path.resolve(__dirname, '../src/react/packages/react'),
        'react-dom': path.resolve(__dirname, '../src/react/packages/react-dom'),
        shared: path.resolve(__dirname, '../src/react/packages/shared'),
        'react-reconciler': path.resolve(__dirname, '../src/react/packages/react-reconciler'),
        scheduler: path.resolve(__dirname, '../src/react/packages/scheduler'),
        'react-devtools-scheduling-profiler': path.resolve(
          __dirname,
          '../src/react/packages/react-devtools-scheduling-profiler',
        ),
        'react-devtools-shared': path.resolve(__dirname, '../src/react/packages/react-devtools-shared'),
        'react-devtools-timeline': path.resolve(__dirname, '../src/react/packages/react-devtools-timeline'),
        // 新增的 alias 结束
      },
    },
  };
};
```

## 5. 总结

到这里我们基本上就可以改造完毕了，启动项目就可以运行起来。

```shell
$ npm start
```

我们需要在 react 源码中调试或者输出一些 log 时，就可以直接修改了。

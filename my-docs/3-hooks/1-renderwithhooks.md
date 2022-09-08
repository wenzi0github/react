# React18 源码解析之 hooks 的挂载

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

在之前讲解函数 beginWork() 时，稍微说了下 renderWithHooks() 的流程，不过当时只说了中间会执行`Component(props)`的操作，并没有讲解函数组件中的 hooks 是如何挂载的，这里我们详细讲解下。

## 1. hooks 的简单样例

我们先来看段 hooks 实际应用的代码：

```javascript
import { useEffect, useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount(count => count + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    console.log(`count is ${count}`);
  }, [count]);

  return <div>{count}</div>;
}
```

这里用到了 useState, useEffect 两个 hook，同时则 useEffect()中，还涉及到了依赖项的对比更新，和回调 return 的处理。

我们可以看到 App() 中使用的两个 hook 是从 React 导出来的。

## 2. hooks 的导出

react 源码对应的位置是 packages/react/index.js，从这里寻找后发现，所有的 hooks 都是从 packages/react/src/ReactHooks.js 中导出来的。

所有的 hooks 里都会执行一个 `resolveDispatcher()` 方法，如 useState()这个 hook：

```javascript
export function useState<S>(initialState: (() => S) | S): [S, Dispatch<BasicStateAction<S>>] {
  const dispatcher = resolveDispatcher();
  return dispatcher.useState(initialState);
}
```

可见实际上执行的是 `dispatcher.useState()`，那么 resolveDispatcher()函数里执行了什么呢？

我们来看看：

```javascript
import ReactCurrentDispatcher from './ReactCurrentDispatcher';

function resolveDispatcher() {
  /**
   * 在执行element转fiber节点的过程中，FunctionComponent会执行 renderWithHooks()，
   * renderWithHooks() 内部会判断 current 来决定是用 mount，还是update，
   * 共用变量 ReactCurrentDispatcher 的位置： packages/react/src/ReactSharedInternals.js
   */
  const dispatcher = ReactCurrentDispatcher.current;

  // Will result in a null access error if accessed outside render phase. We
  // intentionally don't throw our own error because this is in a hot path.
  // Also helps ensure this is inlined.
  return ((dispatcher: any): Dispatcher);
}
```

对，就是直接从 ReactCurrentDispatcher.current 中取出数据，给到 dispatcher。那么这上面的数据是什么呢，又是在哪里挂载上数据的呢？

## 3. renderWithHooks

我们在之前讲解如何把 jsx 转为 fiber 节点中讲到过 renderWithHooks()，但没有讲 hooks 是如何运作的。

在 renderWithHooks() 中有一段代码：

```javascript
function renderWithHooks() {
  // 根据是否是初始化挂载，来决定是初始化hook，还是更新hook
  // 将初始化或更新hook的方法给到 ReactCurrentDispatcher.current 上，
  // 稍后函数组件拿到的hooks，都是从 ReactCurrentDispatcher.current 中拿到的
  // 共用变量 ReactCurrentDispatcher 的位置： packages/react/src/ReactSharedInternals.js
  ReactCurrentDispatcher.current =
    current === null || current.memoizedState === null ? HooksDispatcherOnMount : HooksDispatcherOnUpdate;

  // 执行函数
  let children = Component(props, secondArg);
}
```

我们知道 React 中维护着两棵树，若 current 节点或 current.memoizedState 为空，说明现在没有这个 fiber 节点，或者该节点之前没有对应的 hooks，那么我们就调用 mount 方式来初始 hooks，否则就调用 update 方式来更新 hooks。

mount 阶段的 hooks 仅仅是用来进行 hooks 节点的生成，然后形成链表挂载在函数的 fiber 节点上。update 阶段，则相对来说稍微复杂一些，可能会有触发函数二次执行渲染的可能。

我们在函数组件中使用的 useState(), useEffect()等，仅仅是先挂了一个名字，具体比如是执行 mountState()，还是 updateState()，是在更新时，执行 renderWithHooks()的函数逻辑里，在运行`Component()`之前，才去判断的。具体源码位置：[ReactFiberHooks.old.js#L446](https://github.com/wenzi0github/react-source/blob/34fc2eed3ed7c79686432d41aa402bf991840787/packages/react-reconciler/src/ReactFiberHooks.old.js#L446)。

上面第 2 节函数 resolveDispatcher() 使用的 ReactCurrentDispatcher 和当前 renderWithHooks()里的 ReactCurrentDispatcher ，是同一个，因此在这里挂载数据后，在第 2 节中就可以直接读取出来。

HooksDispatcherOnMount 和 HooksDispatcherOnUpdate 两个的区别在于：

- HooksDispatcherOnMount：这里面所有的 hooks 都是用来进行初始化的，即一边执行，一边将这些 hooks 添加到单向链表中；
- HooksDispatcherOnUpdate：顺着刚才的单向链表按顺序来执行；

## 4. hooks 的挂载

我们这里不讲某个具体的 hook 的使用方式和内部原理，主要是来说下这些 hooks 放在哪儿，是以一种怎样的方式存储的。

在 [packages/react-reconciler/src/ReactFiberHooks.old.js](https://github.com/wenzi0github/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.old.js) 中，观察下诸如 mountState(), mountEffect(), mountRef() 等几个 mount 阶段的 hooks，都会先调用 `mountWorkInProgressHook()` 来得到一个 hook 节点。

```javascript

```

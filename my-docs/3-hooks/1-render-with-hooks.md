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
  currentlyRenderingFiber = workInProgress; // 将当前函数组件对应的fiber节点给到 currentlyRenderingFiber 变量

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

在 [packages/react-reconciler/src/ReactFiberHooks.old.js](https://github.com/wenzi0github/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.old.js) 中，观察下诸如 mountState(), mountEffect(), mountRef() 等几个 mount 阶段的 hooks，都会先调用 `mountWorkInProgressHook()` 来得到一个 hook 节点。如：

```javascript
returns {[*, Dispatch<BasicStateAction<S>>]}
 */
function mountState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  const hook = mountWorkInProgressHook();

  /**
   * 忽略中间的代码
   **/

  return [hook.memoizedState, dispatch];
}

function mountEffectImpl(fiberFlags, hookFlags, create, deps): void {
  const hook = mountWorkInProgressHook();

  /**
   * 忽略后续的代码
   **/
}

function mountRef<T>(initialValue: T): {|current: T|} {
  // 创建一个hook，并将其放到hook链表中
  const hook = mountWorkInProgressHook();

  /**
   * 忽略后续的代码
   **/
}
```

接下来看看 mountWorkInProgressHook() 函数中都做了啥。

```javascript
function mountWorkInProgressHook(): Hook {
  // 创建一个hook节点
  const hook: Hook = {
    memoizedState: null,

    baseState: null,
    baseQueue: null,
    queue: null,

    next: null,
  };

  if (workInProgressHook === null) {
    // This is the first hook in the list
    // 若这是链表的第一个hook节点，则使用 currentlyRenderingFiber.memoizedState 指针指向到该hook
    // currentlyRenderingFiber 是在 renderWithHooks() 中赋值的，是当前函数组件对应的fiber节点
    currentlyRenderingFiber.memoizedState = workInProgressHook = hook;
  } else {
    // Append to the end of the list
    // 若这不是链表的第一个节点，则放到列表的最后即可
    workInProgressHook = workInProgressHook.next = hook;
  }
  // 返回这个hook节点
  return workInProgressHook;
}
```

workInProgressHook 指针永远指向到链表的最后一个 hook 节点，若 workInProgressHook 为 null，说明该链表上还没有节点。mountWorkInProgressHook()是为 currentlyRenderingFiber 指向的 fiber 节点构建 hooks 的链表。currentlyRenderingFiber 就是 workInProgress 指向的那个 fiber 节点，这里是在 renderWithHooks() 中进行赋值的。

1. 若 workInProgressHook 为 null，说明链表为空，则 currentlyRenderingFiber.memoizedState 指向到该节点；
2. 若不为空，说明链表上已经有节点了，直接放到该链表的后面，并让 workInProgressHook 重新指向到最后的那个节点；

每调用一次创建 hook 的函数，不论是什么 hook，只要是这个函数组件里的，都会将其添加到 hooks 的链表中。

即一个函数组件所有的 hooks 节点会形成链表，并存放在`currentlyRenderingFiber.memoizedState`上，下次使用时，可以从该属性中获取链表的头指针。

![mountWorkInProgressHook 构建出来的hooks链表](https://www.xiabingbao.com/upload/3587631e005f18379.png)

我们也注意到这里有两个 memoizedState 属性，但这两个属性所在的对象是不一样的。一个是 fiber 节点上的，一个是 hook 节点上的。

如我们在第 1 节中的样例，React 会把 1 个 useState(), 2 个 useEffect()，一共三个 hooks，按照顺序形成 hooks 链表。

我在之前学习到这个位置时，当时稍微有个小疑问，一个函数组件里有多个 hooks，而像 useState()这种 hook，又会多次执行诸如 setState()的操作，那这些操作放在哪里呢？是新形成了一个 hook 节点吗？还是怎样？

这里到时候当我们了解 useState()这个 hook 时，就会明白了。这里简单说下，只有真正的 hook 才会放到链表上，而某个 hook 的具体操作，如多次执行 setState()，则会放到 hoo.queue 的属性上。

## 5. hooks 的更新

我们在初始节点已经把所有的 hooks 都挂载在链表中了，那更新时，hooks 是怎么更新的呢？

在更新阶段，所有的 hooks 都会进入到 update 节点，比如 useState()内部会执行 updateState()，useEffect()内部会执行 updateEffect()等。那这些 hooks 的 update 阶段执行的函数里，都会执行函数 updateWorkInProgressHook()。

updateWorkInProgressHook()函数的作用，就是从 hooks 的链表中获取到当前位置，上次渲染后和本次将要渲染的两个 hook 节点：

- currentHook: current 树中的那个 hook；即当前正在使用的那个 hook；
- workInProgressHook: workInProgress 树中的那个 hook，即将要执行的 hook；

为什么会需要两个 hook 呢，因为很多 hook 都有依赖项，拿到前后两个 hook 后，可以通过对比依赖项是否发生了变化，再来决定这个 hook 是否继续执行，是否需要进行重新的刷新。

### 5.1 updateWorkInProgressHook 源码

我们来看下 [updateWorkInProgressHook()函数的源码](https://github.com/wenzi0github/react/blob/8af5b16ac8836f7950510296f276a84268e3374e/packages/react-reconciler/src/ReactFiberHooks.old.js#L684)：

```javascript
function updateWorkInProgressHook(): Hook {
  // This function is used both for updates and for re-renders triggered by a
  // render phase update. It assumes there is either a current hook we can
  // clone, or a work-in-progress hook from a previous render pass that we can
  // use as a base. When we reach the end of the base list, we must switch to
  // the dispatcher used for mounts.
  // 机翻：此函数用于更新和由渲染阶段更新触发的重新渲染。它假设有一个可以克隆的当前钩子，
  // 或者一个可以用作基础的上一个渲染过程中的正在进行的钩子。当我们到达基本列表的末尾时，
  // 我们必须切换到用于装载的调度程序。
  let nextCurrentHook: null | Hook;

  /**
   * 获取current树的下一个需要执行的hook
   * 1. 若当前没有正在执行的hook；
   * 2. 若当前有执行的hook，则获取其下一个hook即可；
   */
  if (currentHook === null) {
    const current = currentlyRenderingFiber.alternate; // workInProgress对应的current节点
    if (current !== null) {
      /**
       * 若current节点不为空，则从current获取到hooks的链表
       * 注：hooks链表存储在memoizedState属性中
       */
      nextCurrentHook = current.memoizedState;
    } else {
      nextCurrentHook = null;
    }
  } else {
    /**
     * 因为当前的 updateWorkInProgressHook() 会多次执行，当第一次执行时，就已经获取到了hooks的头指针，
     * 这里只需要通过next指针就可以获取到下一个hook节点
     */
    nextCurrentHook = currentHook.next;
  }

  /**
   * workInProgressHook: 当前正在执行的hook；
   * nextWorkInProgressHook: 下一个将要执行的hook；
   *
   * 若 workInProgressHook 为空，则使用头指针，否则使用其next指向的hook，
   * 不过这两种方式得到的 nextWorkInProgressHook 有可能为空
   **/
  let nextWorkInProgressHook: null | Hook;
  if (workInProgressHook === null) {
    nextWorkInProgressHook = currentlyRenderingFiber.memoizedState;
  } else {
    nextWorkInProgressHook = workInProgressHook.next;
  }

  /**
   * 若 nextWorkInProgressHook 不为空，直接使用；
   * 若为空，则从对应的current fiber节点的hook里，克隆一份；
   **/
  if (nextWorkInProgressHook !== null) {
    // There's already a work-in-progress. Reuse it.
    /**
     * 若下一个hook节点不为空，则将 workInProgressHook 指向到该节点
     */
    workInProgressHook = nextWorkInProgressHook;
    nextWorkInProgressHook = workInProgressHook.next;

    currentHook = nextCurrentHook; // currentHook指针同步向下移动
  } else {
    // Clone from the current hook.
    // https://github.com/wenzi0github/react/issues/1
    if (nextCurrentHook === null) {
      throw new Error('Rendered more hooks than during the previous render.');
    }

    currentHook = nextCurrentHook; // currentHook指针向下一个移动

    const newHook: Hook = {
      memoizedState: currentHook.memoizedState,

      baseState: currentHook.baseState,
      baseQueue: currentHook.baseQueue,
      queue: currentHook.queue,

      next: null,
    };

    if (workInProgressHook === null) {
      // This is the first hook in the list.
      currentlyRenderingFiber.memoizedState = workInProgressHook = newHook;
    } else {
      // Append to the end of the list.
      workInProgressHook = workInProgressHook.next = newHook;
    }
  }
  return workInProgressHook;
}
```

这个函数稍微有点长，但几句话总结该函数的流转：

1. 初始时，在 renderWithHooks()中，将 workInProgress.memoizedState 设置为空，相当于 currentlyRenderingFiber.memoizedState 设置为 null；
2. 若 workInProgress 树中的 fiber 节点的下一个 hook 存在，则直接使用，否则就从对应的 current 的 fiber 节点克隆过来，然后把这些 hook 构建出新的链表放到 currentlyRenderingFiber.memoizedState 上，方便下次更新时使用；
3. 对应的 current fiber 节点的里 hook 也同步向后移动，因此每次得到的都是两个 hook：currentHook 和 workInProgressHook；

## 6. 几个问题的汇总

通过观察上面的源码，我们也能理解下面的几个问题了。

### 6.1 如何得到下一个 hook

这里有个逻辑上的判断：

1. 若 workInProgressHook 为空，说明这个函数组件刚开始执行，之前还没有 hook 要执行，因此从 currentlyRenderingFiber.memoizedState 中获取一个 hook 节点；
2. 若 workInProgressHook 不为空，说明已经按照链表顺序执行了几个 hooks 了，那么这里直接通过 workInProgressHook.next 获取下一个将要执行的 hook；

但 nextWorkInProgressHook 有可能为空，也有可能不为空。

目前暂时还不清楚什么情况下不为空，个人猜测是在执行 hooks 的过程中，又产生了新的更新，所以导致所有的 hooks 重新执行。重新执行时，截止到目前，所有的 hook 节点都是存在的。

刚开始 nextWorkInProgressHook 指向的是上次执行的 hook 的节点，然后再接着获取 next 指向的下一个节点，就是当前我们要使用的节点。

### 6.2 hook 为什么只能在函数组件顶层进行声明

因为这些所有的节点挂载的顺序，就是函数组件里执行所有 hooks 的顺序。在二次渲染时，也会按照既定的顺序来执行，那么再次执行 hook 的顺序就是第一次挂载节点的顺序是一样的。

这就正好说明了一个问题：hook 为什么只能在函数组件顶层进行声明。

因为每个 hook 都是按照顺序，依次从链表中获取的。React 本身是不知道你函数组件内部逻辑的，假如放到了 if 判断、循环、或者函数中，每次的渲染，都可能会因为不同的执行逻辑，导致某些 hook 不执行，进而导致 hook 的错乱。

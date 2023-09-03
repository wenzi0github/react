# React18 源码解析之 useContext 的原理

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

`useContext()` 的这个 hook，有的同学可能使用的不太多，他的作用主要提供了一种在组件之间共享此类值的方式，而不必显式地通过组件树的逐层传递 props。更简要地的说，就是方便我们在不同的组件之间传递数据，就是类似于 redux、mobx，或者 vue 中的 vuex 等。当数据更新时，所有使用到该数据的组件都会自动更新。

## 1. useContext() 的使用

我们先来看下他的简易用法，主要是有 3 步：

1. 在全局使用 createContext(initialValue) 创建并初始化一个 context，如名字叫 ThemeContext；
2. 在限定范围内使用 `<CountContext.Provider value><div></div></CountContext.Provider>`，它接收一个 value 属性，可将数据向下传递给消费组件。当 Provider 的 value 值发生变化时，它内部的所有消费组件都会重新渲染；
3. 使用上层传过来的 value，有两种方式： useContext(ThemeContext) 和 `<CountContext.Consumer></CountContext.Consumer>`；

### 1.1 全局创建 Context

我们在全局，使用 `createContext()` 来创建一个 Context，这里有很多地方都要用到这个 Context，因此我们将其单独提取出来并导出。

```javascript
// store.js
import { useContext } from 'react';

const CountContext = createContext(0); // 这个初始值可以是任意值，不过一般是在value不传入其他值时才会用到
export default CountContext;
```

创建出来的 Context，有两个属性：Provider 和 Consumer，我们从单词的字面意思就能了解到这两者的含义：

- Provider: 生产者，用于提供更新的数据；
- Consumer: 消费者，用来使用数据；

### 1.2 限定范围内监听

`<Provider />`可以放置任意我们要使用的地方，不一定非得放在全局。当然如果全局都有需要的话，那就放在最顶层。

在顶层使用 `useState()` 来存储和更新数据。更复杂一些的更新操作，可以使用 `useReducer()` 来自定义更新操作。这里我们在样例中仅使用 useState() 来进行数据的更新。

```javascript
// App.js
import CountContext from './store';

function App() {
  const [count, setCount] = useState(1); // 顶层存储数据

  return (
    <CountContext.Provider value={count}>
      <div className="App">
        <button onClick={() => setValue(count + 1)}>click me</button>
      </div>
    </CountContext.Provider>
  );
}
```

使用 `<CountContext.Provider />` 来限定范围，并将数据传给 value 属性。所有要使用到 value 属性中数据的组件，都应定义在 Provider 中间。

value 可以接收任意类型的值，这里我们仅仅传入一个了 number 类型的，也可以传入更复杂的 object 类型的，甚至若还存在内部更新数据的需求，也可以将更新方法传进去，如：

```javascript
function App() {
  const [count, setCount] = useState(1); // 顶层存储数据

  // 将 count 和 setCount 都传递进去
  return <CountContext.Provider value={{ count, setCount }}></CountContext.Provider>;
}
```

但若这样直接传入的话，会存在一个频繁刷新的问题，稍后我们会展开讨论。下面 1.3 的例子，我们均以直接传入一个 count 为例。

### 1.3 使用或消费数据

数据已经在最顶层定义并传入进去，我们在需要使用 Provider 中的 value 数据时，这里有两种方式：

1. 使用 `<CountContext.Consumer />`，它的 children 是一个函数，value 为该函数的参数，返回值即 jsx；
2. 使用 hook `useContext(Counttext)`，返回值即 value；

这两种方法获取到的 value，就是 `<Provider />` 的 value 属性的值，若 value 是一个复杂的结构，那还得自己摘选出自己需要的数据。

这两种方法，我们一一来实现下。

#### 1.3.1 使用 Consumer 来获取 value

我们在需要用 value 的地方，用 `<Consumer />` 标签将其包裹，然后 children 定义为一个函数即可。

```javascript
import CountContext from './store';

// 通过 Consumer 来获取响应数据
function CountConsumer() {
  return (
    <div>
      <CountContext.Consumer>
        {value => (
          <div>
            <p>count1: {value}</p>
            <p>count2: {value}</p>
          </div>
        )}
      </CountContext.Consumer>
      <div class="ab">
        <CountContext.Consumer>{value => <div>count3: {value}</div>}</CountContext.Consumer>
      </div>
    </div>
  );
}
```

若组件中有多个地方使用到 value，一种方法是将其都放到 `<Consumer />` 的 children 里，再一种是可以定义多个 `<Consumer />`。

#### 1.3.2 使用 useContext 来获取 value

还有一种是通过 `useContext()` 的 hook 来获取到 value。

```javascript
import { useContext } from 'react';
import CountContext from './store';

// 通过 useContext() 来获取响应数据
function CountUseContext() {
  const value = useContext(CountContext);

  return <div>count: {value}</div>;
}
```

这两种方法没什么优劣之分，凭个人的使用习惯即可。

到这里，我们就实现了一个简单的全局状态管理。

## 2. 源码分析

在大致了解了 `createContext()` 和 `useContext()` 的用法后，我们来从源码的角度来分析下他们的原理。

### 2.1 createContext

createContext 源码定义在 [react/src/ReactContext.js](https://github.com/wenzi0github/react/blob/main/packages/react/src/ReactContext.js) 位置。它返回一个 context 对象，提供了 Provider 和 Consumer 两个组件属性，\_currentValue 会保存 context.value 值。

```javascript
export function createContext<T>(defaultValue: T): ReactContext<T> {
  const context: ReactContext<T> = {
    $$typeof: REACT_CONTEXT_TYPE,

    // 将初始值给到 _currentValue
    _currentValue: defaultValue,
    _currentValue2: defaultValue,

    _threadCount: 0,
    // These are circular
    Provider: (null: any),
    Consumer: (null: any),

    // Add these to use same hidden class in VM as ServerContext
    _defaultValue: (null: any),
    _globalName: (null: any),
  };

  context.Provider = {
    $$typeof: REACT_PROVIDER_TYPE,
    _context: context,
  };

  context.Consumer = context;

  return context;
}
```

从源码中可以看到，通过 Provider 和 Consumer 两个组件属性，都有 `$$typeof` 属性，即可以作为节点使用。

![createContext()创建的context](https://www.xiabingbao.com/upload/598964ef64a0094cd.png)

### 2.2 Provider 中的 value 更新时如何让消费组件进行重渲染？

当 Provider 中的 value 属性的值发生变化时，如何让内部使用到该 value 值的组件进行重新渲染？`<Provider />`组件的渲染与更新，是从 beginWork() 开始的，对 beginWork() 函数不太熟悉的同学，可以查看文章 [React18 源码解析之 beginWork 的操作](https://www.xiabingbao.com/post/react/react-beginwork-riew9h.html)。这里我们主要聚焦在 Provider 类型上：

```javascript
function beginWork() {
  switch (workInProgress.tag) {
    // Provider 类型的，执行 updateContextProvider()
    case ContextProvider:
      return updateContextProvider(current, workInProgress, renderLanes);
  }
}
```

接下来看下 updateContextProvider() 的执行逻辑：

```javascript
function updateContextProvider(current: Fiber | null, workInProgress: Fiber, renderLanes: Lanes) {
  const providerType: ReactProviderType<any> = workInProgress.type;
  const context: ReactContext<any> = providerType._context;

  const newProps = workInProgress.pendingProps;
  const oldProps = workInProgress.memoizedProps;

  const newValue = newProps.value;

  /**
   * 目前context中存储的值存放到另一个栈中，
   * 然后再将 newValue 存储到 context._currentValue 上
   * 目前这里用不到这个逻辑
   */
  pushProvider(workInProgress, context, newValue);

  const oldValue = oldProps.value;

  /**
   * 通过 Object.is() 来比较前后两个value是否发生了变化，若是
   * 复杂类型的结构，每次比较时都会认为产生了更新。
   * 1. 若 value 没有变化，且子节点也没有更新，则可以提前结束判断；
   * 2. 若 value 产生了变化，则查找该节点内所有的消费组件，然后将其标记为可更新
   */
  if (is(oldValue, newValue)) {
    // No change. Bailout early if children are the same.
    if (oldProps.children === newProps.children && !hasLegacyContextChanged()) {
      return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
    }
  } else {
    // The context value changed. Search for matching consumers and schedule
    // them to update.
    /**
     * 若 value 产生了变化，则查找所有使用 useContext() 的消费组件，将其标记为可更新；
     * 消费组件主要有两种，<Consumer /> 和 使用 useContext() 的组件；
     * <Consumer /> 每次执行到该组件时，都会重新执行，不用进行标记；
     * 而使用 useContext() 的组件，可能使用了多个 context，则需要判断该组件中使用
     * 了这各产生更新的 context ，若能匹配上，则将该组件标记为可更新；
     * 这里只匹配使用了 useContext() 的 hook 的组件；
     */
    propagateContextChange(workInProgress, context, renderLanes);
  }

  const newChildren = newProps.children;

  /**
   * 渲染该fiber节点的子节点，
   * 关于该方法的详细解读，可以参考下面的文章
   * https://www.xiabingbao.com/post/react/reconcile-children-fiber-riezuz.html
   */
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  return workInProgress.child;
}
```

`<Provider />`的子组件中，用的组件用了一个或者多个 context，怎么判断哪些子组件需要更新呢？流程就走到了`propagateContextChange(workInProgress, context, renderLanes)` 中的 `propagateContextChange_eager(workInProgress, context, renderLanes)`。

```javascript
// packages/react-reconciler/src/ReactFiberNewContext.old.js

/**
 * 查找当前 <Provider /> 子组件中，所有用到了 context 的组件，并将其标记为待更新
 */
function propagateContextChange_eager<T>(workInProgress: Fiber, context: ReactContext<T>, renderLanes: Lanes): void {
  let fiber = workInProgress.child;
  if (fiber !== null) {
    // Set the return pointer of the child to the work-in-progress fiber.
    fiber.return = workInProgress;
  }
  while (fiber !== null) {
    let nextFiber;

    /**
     * 每次调用 useContext(context) 时，都会将使用的 context，放到 fiber 节点的 dependencies 属性上。
     * 同样的，若该 fiber 节点有 dependencies 属性，则必然至少挂载了一个 context，然后我们在这个链表上查
     * 找对比传过来的 context，若能找得到，则将该组件标记为待更新；
     *
     * dependencies 中的 context 如何挂载的，我们在后面的2.3小节会讲解到。
     */
    const list = fiber.dependencies;
    if (list !== null) {
      nextFiber = fiber.child;

      /**
       * 从 context 链表的第1个开始匹配，匹配到了则标记
       */
      let dependency = list.firstContext;
      while (dependency !== null) {
        // Check if the context matches.
        /**
         * 从第1个 context 开始查找，若能匹配上
         */
        if (dependency.context === context) {
          // Match! Schedule an update on this fiber.
          if (fiber.tag === ClassComponent) {
            // Schedule a force update on the work-in-progress.
            /**
             * 若这是 class 组件，则设置为强制更新
             */
            const lane = pickArbitraryLane(renderLanes);
            const update = createUpdate(NoTimestamp, lane);
            update.tag = ForceUpdate;
            // TODO: Because we don't have a work-in-progress, this will add the
            // update to the current fiber, too, which means it will persist even if
            // this render is thrown away. Since it's a race condition, not sure it's
            // worth fixing.

            // Inlined `enqueueUpdate` to remove interleaved update check
            const updateQueue = fiber.updateQueue;
            if (updateQueue === null) {
              // Only occurs if the fiber has been unmounted.
            } else {
              const sharedQueue: SharedQueue<any> = (updateQueue: any).shared;
              const pending = sharedQueue.pending;
              if (pending === null) {
                // This is the first update. Create a circular list.
                update.next = update;
              } else {
                update.next = pending.next;
                pending.next = update;
              }
              sharedQueue.pending = update;
            }
          }

          // 设置该 fiber 的更新优先级
          fiber.lanes = mergeLanes(fiber.lanes, renderLanes);
          const alternate = fiber.alternate;
          if (alternate !== null) {
            alternate.lanes = mergeLanes(alternate.lanes, renderLanes);
          }
          // 将该 fiber 节点及所有的父级节点标记为待更新
          scheduleContextWorkOnParentPath(fiber.return, renderLanes, workInProgress);

          // Mark the updated lanes on the list, too.
          list.lanes = mergeLanes(list.lanes, renderLanes);

          // Since we already found a match, we can stop traversing the
          // dependency list.
          break;
        }
        // 一直在单链表中查找 context，直到找到或者到结尾
        dependency = dependency.next;
      }
    } else if (fiber.tag === ContextProvider) {
      // Don't scan deeper if this is a matching provider
      /**
       * 若这里也是 <Provider /> 节点，并且跟刚才的 context 所在的 Provider 是同一个组件，
       * 则停止寻找。因为消费组件使用到的 context 的值，是距离它最近的那个 <Provider />；
       * 当前 <Provider /> 节点内的所有组件，是依赖当前的节点，而不是更外层的，因此更外层
       * 的 <Provider /> 查找到这里，即可查找。
       * 若不是相同的 context ，则可以继续查找。
       */
      nextFiber = fiber.type === workInProgress.type ? null : fiber.child;
    } else if (fiber.tag === DehydratedFragment) {
      // If a dehydrated suspense boundary is in this subtree, we don't know
      // if it will have any context consumers in it. The best we can do is
      // mark it as having updates.
      // 这里主要是同构支出渲染的方式中出现，暂时不考虑
    } else {
      // Traverse down.
      /**
       * 若当前节点没有使用任何的 useContext()，则继续查找
       */
      nextFiber = fiber.child;
    }

    /**
     * fiber节点的遍历顺序，先子节点，然后兄弟节点，最后回到父级节点
     */
    if (nextFiber !== null) {
      // Set the return pointer of the child to the work-in-progress fiber.
      nextFiber.return = fiber;
    } else {
      // No child. Traverse to next sibling.
      nextFiber = fiber;
      while (nextFiber !== null) {
        if (nextFiber === workInProgress) {
          // We're back to the root of this subtree. Exit.
          // 已经遍历完当前 workInProgress 下所有的子节点，直接退出
          nextFiber = null;
          break;
        }
        const sibling = nextFiber.sibling;
        if (sibling !== null) {
          // Set the return pointer of the sibling to the work-in-progress fiber.
          sibling.return = nextFiber.return;
          nextFiber = sibling;
          break;
        }
        // No more siblings. Traverse up.
        nextFiber = nextFiber.return;
      }
    }
    fiber = nextFiber;
  }
}
```

整个的流程比较长，我们再稍微总结梳理下：

1. `<Context.Provider />` 所在的组件，被 useState 或者 useReducer，或者外层的属性等，进行渲染更新时，Provider 内就会对比新旧的 value 是否相同，若不相同，则查找该组件内所有使用到该 context 的子组件进行更新；
2. 以先子节点、次之是兄弟节点、最后是父级的顺序，查找那些使用到了 context 的组件，将其标记为待更新；某些组件可能使用了多个的 context，这里只查找某个具体的 context；

上面的更新标记，只是对使用了 `useContext()` 的 hook 或者类组件进行标记。但 `<Consumer />` 类型的组件并没有在这里处理。

### 2.2 Consumer

消费或者使用 Provider 中的 value，一般是有两种方式，其中一种就是 `<Context.Consumer />` 组件，children 是一个方法，接受到最新的 value，然后返回 ReactCode。

`<Context.Consumer />` 组件中并没有对新旧 value 进行判断对比等，每次都会执行。

```javascript
/**
 * <Consumer /> 组件的渲染
 */
function updateContextConsumer(current: Fiber | null, workInProgress: Fiber, renderLanes: Lanes) {
  let context: ReactContext<any> = workInProgress.type;

  const newProps = workInProgress.pendingProps;
  const render = newProps.children;

  prepareToReadContext(workInProgress, renderLanes);
  // 解析到这里时，读取 context 的最新值
  const newValue = readContext(context);
  if (enableSchedulingProfiler) {
    markComponentRenderStarted(workInProgress);
  }
  let newChildren;
  /**
   * 每次都直接传入最新的value，然后执行
   */
  newChildren = render(newValue);
  if (enableSchedulingProfiler) {
    markComponentRenderStopped();
  }

  // React DevTools reads this flag.
  workInProgress.flags |= PerformedWork;
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  return workInProgress.child;
}
```

不过用 `<Context.Consumer />` 的开发者确实不太多了，很多就直接用下面的 hook 的写法了。

### 2.3 useContext() 的原理

大部分 hook 都会根据 mount 阶段和 update 阶段，分成两个 hook 来执行，而 useContext() 这个 hook，两个阶段内部使用的都是同一个 hook： `readContext()`。有些同学可能会有疑惑，若 mount 阶段和 update 阶段使用的是同一个方法，会不会造成 hook 的多次挂载？其实并不会，React 内部会在每次执行完该函数，在 commit 阶段，会将挂载的所有 useContext() 的 hook 进行清空。

```javascript
export function readContext<T>(context: ReactContext<T>): T {
  const value = isPrimaryRenderer ? context._currentValue : context._currentValue2;

  if (lastFullyObservedContext === context) {
    // Nothing to do. We already observe everything in this context.
  } else {
    // 根据 context 和 value 创建出一个链表的节点
    const contextItem = {
      context: ((context: any): ReactContext<mixed>),
      memoizedValue: value,
      next: null,
    };

    /**
     * 将节点挂载到 dependencies 中的 firstContext 的链表上，
     * 1. 若之前链表为空，说明这是第1个节点，直接放到 dependencies 上；
     * 2. 若链表上已经有节点了，直接在节点的后面进行拼接；
     * 这样多次执行 useContext(context) 后，就会在 firstContext 上形成链表，
     * 那在决定是否要将该组件标记为更新时，也是在 firstContext 链表上查找对应的 context。
     */
    if (lastContextDependency === null) {
      // This is the first dependency for this component. Create a new list.
      lastContextDependency = contextItem;
      currentlyRenderingFiber.dependencies = {
        lanes: NoLanes,
        firstContext: contextItem,
      };
      if (enableLazyContextPropagation) {
        currentlyRenderingFiber.flags |= NeedsPropagation;
      }
    } else {
      // Append a new context item.
      lastContextDependency = lastContextDependency.next = contextItem;
    }
  }

  // 返回最新的值
  return value;
}
```

## 3. 总结

到这里，我们对源码的分析，基本已经结束了。对于一些小型项目的状态维护，createContext + useContext 其实就能满足我们大致的需求。若是一些大型项目或者对性能要求比较高的，就要使用到成熟的状态管理工具了，如 redux、mobx、recoil 等。

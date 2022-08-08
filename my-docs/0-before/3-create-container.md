# React18 源码解析之 createContainer 方法

> 我们解析的源码是 React18.0.2 版本，请注意版本号。GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

我们在之前的文章[React18 源码解析之 render()入口方法](https://www.xiabingbao.com/post/react/react-render-rfl28t.html)里，大概了解了下入口函数的执行流程。但这里有一个很重要的函数，`createContainer()`并没有讲解，这里我们稍微讲解下。

createContainer() 方法是在 createRoot() 中调用的，主要是用来创建整个应用的根节点，这是应用访问或执行的入口，后续所有对 fiber 的更新，都会从这里开始。

这里调用嵌套的比较深，createContainer()内部又调用了[createFiberRoot()方法](https://github.com/wenzi0github/react/blob/0d7894263ae2d2fa1f3cf1ec2d758a05e304eb9f/packages/react-reconciler/src/ReactFiberRoot.old.js#L160)：

在 React 中存在着两棵树，fiberRootNode 是整个应用的根节点，rootFiber 分别是两棵树的根节点，fiberRootNode 的属性 current（fiberRootNode.current）会指向当前页面上已渲染内容对应 Fiber 树。

## 1. createFiberRoot

函数 createFiberRoot() 会生成一个初始的架构。

```javascript
/**
 * 创建FiberRootNode，并返回该节点
 * @param {*} containerInfo 要挂载React应用的DOM节点
 * @param {RootTag} tag fiber节点的类型，0是之前legacy模式，1是现在最新的Concurrent模式，通过createRoot()传入的是1
 * @param {boolean} hydrate 是否是水合操作，一般是在同构直出中使用，这里我们目前只考虑纯前端行为，此项为false
 * @param {ReactNodeList} initialChildren element结构，在createRoot()中调用时传入的是null
 */
export function createFiberRoot(
  containerInfo: any,
  tag: RootTag,
  hydrate: boolean,
  initialChildren: ReactNodeList,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
  isStrictMode: boolean,
  concurrentUpdatesByDefaultOverride: null | boolean,
  identifierPrefix: string,
  onRecoverableError: null | ((error: mixed) => void),
  transitionCallbacks: null | TransitionTracingCallbacks,
): FiberRoot {
  /**
   * fiberRootNode是整个应用的根节点（类似于链表的空头指针，仅用于指向到哪个组件树上）
   */
  const root: FiberRoot = (new FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onRecoverableError): any);

  // Cyclic construction. This cheats the type system right now because
  // stateNode is any.
  // 创建调用的链路：createHostRootFiber -> createFiber -> new FiberNode(tag, pendingProps, key, mode)
  // 最终会调用 new FiberNode() 来创建uninitializedFiber
  // 主要的属性有：{ tag, stateNode, return, child, sibling, mode, alternate, memoizedState }
  const uninitializedFiber = createHostRootFiber(tag, isStrictMode, concurrentUpdatesByDefaultOverride);

  // 互相指引
  // root是FiberRootNode的实例
  // uninitializedFiber是FiberNode的实例
  root.current = uninitializedFiber;
  uninitializedFiber.stateNode = root;

  const initialState: RootState = {
    element: initialChildren, // 初始化时，initialChildren为null，在render()才会赋值
    isDehydrated: hydrate,
    cache: (null: any), // not enabled yet
    transitions: null,
    pendingSuspenseBoundaries: null,
  };
  uninitializedFiber.memoizedState = initialState;

  /**
   * 给传入的fiber节点创建一个updateQueue属性
   * uninitializedFiber.updateQueue = {
   *  baseState: uninitializedFiber.memoizedState
   * };
   */
  initializeUpdateQueue(uninitializedFiber);

  return root;
}
```

上面的方法里创建了两个节点，一个是用 FiberRootNode() 初始化出来的，一个是用 createHostRootFiber() 创建出来的，两个节点的作用是不一样的。这里我们再明确下：

- const root = new FiberRootNode() : 这是整个应用的起始节点，任何时候都不会改变；
- const uninitializedFiber = createHostRootFiber() : 这是我们每次需要更新的 fiber 树；

我们可以把 root 节点比作火车岔路口的岔道开关，过来的火车（当前要展示的视图逻辑）要走哪个岔路（fiber 树），都是 root 节点控制的，current 指向哪儿，火车就走哪条路。

初始时，root.current 指向到了 uninitializedFiber 上，这棵树只有一个根节点。整体就是长这个样子：

![createFiberRoot后得到的fiber树](https://mat1.gtimg.com/qqcdn/tupload/1659715740891.png)

不是说有两棵 fiber 树吗，怎么这里只有一个 fiberNode 节点呢，fiberNode 的属性 alternate 怎么为 null 呢？其实 createRoot()中，就只是生成当前的结构，其他的 fiber 节点，都是在调用 render()方法时生成的。在后面调用 render()方法时，才会从该 fiberNode 派生出「更新树」的根节点，然后构建出整棵 fiber 树。如何构建整棵 fiber 树，我们在后续的文章中进行讲解。

## 2. FiberRootNode

这个类里一堆的初始属性，目前我们只关注其中的 3 个属性，其他的属性，后续我们用到时再说：

```javascript
function FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onRecoverableError) {
  this.tag = tag; // fiber节点的类型(0|1)，0是之前legacy模式，1是现在最新的Concurrent模式，React18中是1
  this.containerInfo = containerInfo; // 该fiber对应的真实dom节点
  this.current = null; // current指针，指向哪棵fiber树的根节点
}
```

通过`FiberRootNode()`创建出来的实例，就是我们整个应用的根节点，同时，将该应用挂载的 DOM 节点，放到 containerInfo 中。

## 3. createHostRootFiber

该方法用来创建树的根节点的。这里会根据整个应用的运作模式（同步模式还是并发模式）和是否是严格类型等，决定要创建什么样子的根节点。

在 React18 中，tag 为 1，即同步模式，同时默认 isStrictMode 为 false。

```javascript
/**
 * 创建fiber树的根节点
 * @param {RootTag} tag 当前应用的模式，0是之前legacy模式，1是现在最新的Concurrent模式，React18中默认是1
 * @param {boolean} isStrictMode 是否是严格模式，默认是false
 * @param concurrentUpdatesByDefaultOverride 默认情况下的并发更新覆盖，默认为false
 * @returns {Fiber}
 */
export function createHostRootFiber(
  tag: RootTag,
  isStrictMode: boolean,
  concurrentUpdatesByDefaultOverride: null | boolean,
): Fiber {
  /**
   * 各个参数：
   * 1. tag: fiber节点的类型，如FunctionComponent, ClassComponent, HostRoot等，这里是根节点类型
   * 2. pendingProps: 初始的属性，默认为null
   * 3. key: 当前fiber节点的key，默认为null
   * 4. mode: fiber节点的模式，
   */
  return createFiber(HostRoot, null, null, mode);
}
```

### 3.1 createFiber

这里执行的很简单，就是调用`FibeNode()`初始化出 fiber 的实例：

```javascript
/**
 * 创建fiber节点
 * @param {WorkTag} tag 节点的类型，如FunctionComponent（函数组件）, ClassComponent（类组件）, HostComponent（普通html标签）等
 * @param {mixed} pendingProps 初始的属性
 * @param {null|string} key
 * @param {TypeOfMode} mode
 * @returns {FiberNode}
 */
const createFiber = function(tag: WorkTag, pendingProps: mixed, key: null | string, mode: TypeOfMode): Fiber {
  // $FlowFixMe: the shapes are exact here but Flow doesn't like constructors
  return new FiberNode(tag, pendingProps, key, mode);
};
```

### 3.2 FiberNode

我们在 [React18 源码解析之 fiber 等几个重要的数据结构](https://www.xiabingbao.com/post/react/react-element-jsx-rfl0yh.html#3.+fiber+%E7%BB%93%E6%9E%84) 的文章中，已经讲解过这个函数了，可以跳转到这篇文章进行查看。

## 4. initializeUpdateQueue

`initializeUpdateQueue(fiber)`是给 fiber 节点初始化一个 updateQueue 属性：

```javascript
/**
 * 初始化一个UpdateQueue，并将 updateQueue 给了 fiber
 * updateQueue队列是fiber更新时要执行的内容
 * @param fiber
 */
export function initializeUpdateQueue<State>(fiber: Fiber): void {
  const queue: UpdateQueue<State> = {
    baseState: fiber.memoizedState, // 前一次更新计算得出的状态，比如：创建时是声明的初始值 state，更新时是最后得到的 state（除去因优先级不够导致被忽略的 Update）
    firstBaseUpdate: null, // 更新阶段中由于优先级不够导致被忽略的第一个 Update 对象
    lastBaseUpdate: null, // 更新阶段中由于优先级不够导致被忽略的最后一个 Update 对象
    shared: {
      pending: null, // 更新操作的循环链表，所有的更新操作都暂时放到这里
      interleaved: null,
      lanes: NoLanes,
    },
    effects: null,
  };
  fiber.updateQueue = queue;
}
```

用 initializeUpdateQueue() 方法给刚创建出来的 fiber 树的根节点，一个 updateQueue 舒心。

## 5. 总结

这篇文章我们主要梳理了下 createContainer()函数的操作，主要是创建了 FiberRootNode 和 hostFiber 两个节点。基本的架构搭建好了，后续就可以调用 render()方法来初始整个 fiber 树了。

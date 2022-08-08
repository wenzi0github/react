# React18 源码解析之 createContainer 方法

> 我们解析的源码是 React18.0.2 版本，请注意版本号。GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

我们在之前的文章[React18 源码解析之 render()入口方法](https://www.xiabingbao.com/post/react/react-render-rfl28t.html)里，大概了解了下入口函数的执行流程。但这里有一个很重要的函数，`createContainer()`并没有讲解，这里我们稍微讲解下。

createContainer() 方法是在 createRoot() 中调用的，主要是用来创建整个应用的根节点，这是应用访问或执行的入口，后续所有对 fiber 的更新，都会从这里开始。

这里调用嵌套的比较深，createContainer()内部又调用了[createFiberRoot()方法](https://github.com/wenzi0github/react/blob/0d7894263ae2d2fa1f3cf1ec2d758a05e304eb9f/packages/react-reconciler/src/ReactFiberRoot.old.js#L160)：

在 React 中存在着两棵树，fiberRootNode 是整个应用的根节点，rootFiber 分别是两棵树的根节点，fiberRootNode 的属性 current（fiberRootNode.current）会指向当前页面上已渲染内容对应 Fiber 树。

## 1. createFiberRoot



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

上面的方法里创建了两个节点，一个是用 FiberRootNode() 初始化出来的，一个是用 createHostRootFiber() 创建出来的，名字有点像，虽然最终都是调用的 FiberNode()创建出来的，但作用是不一样的。这里我们再明确下：

- const root = new FiberRootNode() : 这是整个应用的起始节点，任何时候都不会改变；
- const uninitializedFiber = createHostRootFiber() : 这是我们每次需要更新的 fiber 树；

初始时，root.current 指向到了 uninitializedFiber 上，这棵树只有一个根节点。整体就是长这个样子：

![createFiberRoot后得到的fiber树](https://mat1.gtimg.com/qqcdn/tupload/1659715740891.png)

fiberNode 的属性 alternate 目前为 null，在后面调用 render()方法时，才会从该 fiberNode 派生出「更新树」的根节点，然后构建出整棵 fiber 树。如何构建整棵 fiber 树，我们在后续的文章中进行讲解。

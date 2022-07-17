# # React18源码解析之 createContainer 方法

> 我们解析的源码是React18.0.2版本，请注意版本号。GitHub仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

createContainer() 方法是在 createRoot() 中调用的，主要是用来创建整个应用的根节点，这是应用访问或执行的入口，后续所有对fiber的更新，都会从这里开始。

这里调用嵌套的比较深，createContainer()内部又调用了[createFiberRoot()方法](https://github.com/wenzi0github/react/blob/0d7894263ae2d2fa1f3cf1ec2d758a05e304eb9f/packages/react-reconciler/src/ReactFiberRoot.old.js#L160)：

```javascript
/**
 * 创建FiberRootNode，并返回该节点
 * @param {*} containerInfo 要挂载React应用的DOM节点
 * @param {RootTag} tag fiber节点的类型，0是之前legacy模式，1是现在最新的Concurrent模式，通过createRoot()传入的是1
 * @param {*} hydrate
 * @param {*} hydrationCallbacks
 * @param {*} isStrictMode
 * @param {*} concurcreateFiberRootrentUpdatesByDefaultOverride
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
   * fiberRootNode是整个应用的根节点（类似于链表的空头指针，仅用于指向到哪个组件树上），rootFiber是<App />所在组件树的根节点
   * https://react.iamkasong.com/process/doubleBuffer.html
   *
   * 之所以要区分fiberRootNode与rootFiber，是因为在应用中我们可以多次调用ReactDOM.render渲染不同的组件树，
   * 他们会拥有不同的rootFiber。但是整个应用的根节点只有一个，那就是fiberRootNode
   */
  const root: FiberRoot = (new FiberRootNode(
    containerInfo,
    tag,
    hydrate,
    identifierPrefix,
    onRecoverableError,
  ): any);

  // Cyclic construction. This cheats the type system right now because
  // stateNode is any.
  // 创建调用的链路：createHostRootFiber -> createFiber -> new FiberNode(tag, pendingProps, key, mode)
  // 最终会调用 new FiberNode() 来创建uninitializedFiber
  // 主要的属性有：{ tag, stateNode, return, child, sibling, mode, alternate, memoizedState }
  const uninitializedFiber = createHostRootFiber(
    tag,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
  );

  // 循环引用！
  // root是FiberRootNode的实例
  // uninitializedFiber是FiberNode的实例
  root.current = uninitializedFiber;
  uninitializedFiber.stateNode = root;

  const initialState: RootState = {
    element: initialChildren, // 初始化时，initialChildren为null
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

上面的方法里创建了两个节点，一个是用 FiberRootNode() 初始化出来的，一个是用 createHostRootFiber() 创建出来的，名字有点像，虽然最终都是调用的FiberNode()创建出来的，但作用是不一样的。这里我们再明确下：

* const root = new FiberRootNode() : 这是整个应用的起始节点，任何时候都不会改变；
* const uninitializedFiber = createHostRootFiber() : 这是我们每次需要更新的fiber树；

初始时，root.current指向到了uninitializedFiber上，这棵树是空的。

在 React 的更新过程中，会有两棵fiber树，一颗是正在展示的树，另一个是从当前树的根节点（注意，不是整个应用的根节点）派生出一个树来，我们叫 workInProgress，通过diff算法，有可复用的节点，就直接拿过来，不能复用的，就创建一个新的节点，并将之前不能复用的节点标记为删除（需要删除的节点，并不会在这里直接删除，而会先保存在一个链表中，在后面的commit阶段才会执行）。全部对比完毕后，就构建出来一个新的完整的树。


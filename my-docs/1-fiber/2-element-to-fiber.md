# React18 源码解析之虚拟 DOM 转为 fiber 树

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

我们在文章 [React18 源码解析之 fiber 等数据结构](https://www.xiabingbao.com/post/react/jsx-element-fiber-rfztfs.html) 中讲解了 jsx, element 和 fiber 的基本结构。这里我们主要讲下如何将 jsx 转为 fiber 节点组成的 fiber 树。

我们为便于理解整个转换的过程，会做一些流程上的精简：

1. 大部分只考虑初始渲染阶段，因此诸如副作用的收集等暂时就不考虑了，不过偶尔也会涉及到一点两棵 fiber 树的对比；
2. 忽略各种任务的优先级的调度；
3. React 中各个节点的类型很多，如函数组件、类组件、html 节点、Suspense 类型的组件、使用 lazy()方法的动态组件等等，不过我们这里主要讲解下函数组件、类组件、html 节点这 3 个；

## 0. 起始

在开始讲解前，我们先定义下要渲染的 React 组件，方便我们后续的理解：

```jsx
const FuncComponent = () => {
  return (
    <p>
      <span>this is function component</span>
    </p>
  );
};

class ClassComponent extends React.Component {
  render() {
    return <p>this is class component</p>;
  }
}

function App() {
  return (
    <div className="App">
      <FuncComponent />
      <ClassComponent />
      <div>
        <span>123</span>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
```

我们编写这个结构要解决的问题：

1. 函数组件、类组件、html 标签这些分别怎么处理；
2. 处理嵌套的、并列的标签，流程是如何流转的；
3. 初始的 element 如何处理的？

中间经过多个复杂的过程，才将 element 转为 fiber 节点。

### 初始的 element 如何处理的？

我是强烈建议使用[debug-react](https://github.com/wenzi0github/debug-react)项目来进行调试的，因为里面的分支和各种变量很多，单纯地只是看，很容易懵！

render()传入的 element 和后续的 element 的操作是不一样的。其他的 element 都可以通过执行函数组件或者类组件的实例来得到，而初始的 element 是直接提供的。

入口函数 render() 调用了 updateContainer()：

```javascript
// children就是我们传入的<App />，即通过jsx编译后的element结构
ReactDOMRoot.prototype.render = function(children: ReactNodeList) {
  const root = this._internalRoot; // FiberRootNode
  updateContainer(children, root, null, null);
};
```

我们去掉 dev 代码和任务优先级的调度，看下 updateContainer() 主要的流程：

```javascript
/**
 * 将element结构转为fiber树
 * @param {ReactNodeList} element 虚拟DOM树
 * @param {OpaqueRoot} container FiberRootNode 节点
 * @param {?React$Component<any, any>} parentComponent 在React18传到这里的是null
 * @param {?Function} callback render()里的callback，不过从React18开始就没了，传入的是null
 * @returns {Lane}
 */
export function updateContainer(
  element: ReactNodeList,
  container: OpaqueRoot,
  parentComponent: ?React$Component<any, any>,
  callback: ?Function,
): Lane {
  /**
   * current:
   * const uninitializedFiber = createHostRootFiber(tag, isStrictMode, concurrentUpdatesByDefaultOverride,);
   */
  // FiberRootNode.current 现在指向到当前的fiber树，
  // 若是初次执行时，current树只有hostFiber节点，没有其他的
  const current = container.current;
  const eventTime = requestEventTime();
  const lane = requestUpdateLane(current);

  // 结合 lane（优先级）信息，创建 update 对象，一个 update 对象意味着一个更新
  /**
   * const update: Update<*> = {
   *   eventTime,
   *   lane,
   *   tag: UpdateState,
   *   payload: null,
   *   callback: null,
   *   next: null,
   * };
   * @type {Update<*>}
   */
  const update = createUpdate(eventTime, lane);
  update.payload = { element };

  // 处理 callback，这个 callback 其实就是我们调用 ReactDOM.render 时传入的 callback
  // 不过从React18开始，render不再传入callback了，即下面的if就不会再执行了
  callback = callback === undefined ? null : callback;
  if (callback !== null) {
    update.callback = callback;
  }

  /**
   * 将update添加到current的更新链表中
   * 执行后，得到的是 current.updateQueue.shared.pending = sharedQueue
   * sharedQueue是React中经典的循环链表，
   * 将下面的update节点插入这个shareQueue的循环链表中，pending指针指向到最后插入的那个节点上
   */
  enqueueUpdate(current, update, lane);

  /**
   * 这里调用的链路很深，做了很多事情，如：
   * 流程图： https://docs.qq.com/flowchart/DS0pVdnB0bmlVRkly?u=7314a95fb28d4269b44c0026faa673b7
   * scheduleUpdateOnFiber() -> ensureRootIsScheduled(root) -> performSyncWorkOnRoot(root)
   * -> renderRootSync(root) -> workLoopSync()
   */
  /**
   * 这里传入的current是HostRootFiber的fiber节点了，虽然他的下面没有其他fiber子节点，
   * 但它的updateQueue上有element结构，可以用来构建fiber节点
   * 即 current.updateQueue.shared.pending = sharedQueue，element结构在sharedQueue其中的一个update节点，
   * 其实这里只有一个update节点
   */
  const root = scheduleUpdateOnFiber(current, lane, eventTime);
  if (root !== null) {
    entangleTransitions(root, current, lane);
  }

  return lane;
}
```

我们再梳理下函数 updateContainer()的流程：

1. updateContainer(element, container)传入了两个参数，element 就是 jsx 编译后的 element 结构，而 container 表示的是 FiberRootNode，整个应用的根节点，并不是 DOM 元素；
2. container.current 指向的就是目前唯一的一棵 fiber 树的根节点，并 current 变量存储该节点；
3. 将 element 结构放到 current 节点的属性中，方便后续的构建：current.updateQueue.shared.pending = [{payload:{element}}]；pending 是一个环形链表，element 就放在这个环形链表的节点中，在初始更新阶段，只有这一个 update 节点；
4. 调用 scheduleUpdateOnFiber(current)；该方法内部将 element 取出，构建出下一个 fiber 节点；

### scheduleUpdateOnFiber

接下来我们 scheduleUpdateOnFiber 函数。

markUpdateLaneFromFiberToRoot(fiber, lane)方法会将当前 fiber 节点往上知道 FiberRootNode 所有节点赋值 lane 这个优先级，同时返回整个应用的根节点
FiberRootNode。

我们忽略中间任务调度的步骤，直接进入到 ensureRootIsScheduled(root) 函数中，这里的root参数就是整个应用的根节点FiberRootNode。这个函数里也是一堆的任务调度，我们快进到 performConcurrentWorkOnRoot.bind(null, root)，这里面又快进到了 renderRootSync(root)。

### renderRootSync

这里有一个很重要的准备操作，这里的root是整个应用的根节点，即FiberRootNode，会传入到函数 prepareFreshStack() 中，主要是为了接下来的递归，初始化一些数据和属性：

```javascript
/**
 * 整个应用目前只有 FiberRootNode和current两个节点，current树只有一个根节点，就是current自己；
 * 另一棵树还没有创建，结构是这样： https://mat1.gtimg.com/qqcdn/tupload/1659715740891.png
 * prepareFreshStack() 函数的作用，就是通过current树的根节点创建出另一棵树的根节点，
 * 并将这两棵树通过 alternate 属性，实现互相的指引
 * workInProgressRoot: 是将要构建的树的根节点，初始时为null，经过下面 prepareFreshStack() 后，
 * root.current给到workInProgressRoot，
 * 即使第二次调用了，这里的if逻辑也是不会走的
 * workInProgress初始指向到workInProgressRoot，随着构建的深入，workInProgress一步步往下走
 */
if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
  /**
   * 将整个应用的根节点和将要更新的fiber树的根节点赋值到全局变量中
   * root是当前整个应用的根节点
   */
  prepareFreshStack(root, lanes);
}
```

我们看下函数 prepareFreshStack() 的实现：

```javascript
/**
 * 准备新堆栈，返回「更新树」的根节点
 * @param root
 * @param lanes
 * @returns {Fiber}
 */
function prepareFreshStack(root: FiberRoot, lanes: Lanes): Fiber {
  root.finishedWork = null;
  root.finishedLanes = NoLanes;
  
  workInProgressRoot = root; // 整个React应用的根节点，即 FiberRootNode

  /**
   * prepareFreshStack()个人认为是只在初始化时执行一次，root是整个应用的根节点，而root.current就是默认展示的那棵树，
   * 在初始化时，current 树其实也没内容，只有这棵树的一个根节点；
   * 然后利用current的根节点通过 createWorkInProgress()方法 创建另一棵树的根节点rootWorkInProgress
   * createWorkInProgress()方法内则判断了 current.alternate 是否为空，来决定是否可以复用这个节点，
   * 在render()第一次调用时，root.current.alternate 肯定为空，这里面则会调用createFiber进行创建
   */
  const rootWorkInProgress = createWorkInProgress(root.current, null);
  // 初始执行时，workInProgress指向到更新树的根节点，
  // 在mount阶段，workInProgress是新创建出来的，与current树的根节点workInProgressRoot，肯定是不相等的
  workInProgress = rootWorkInProgress;
  workInProgressRootRenderLanes = subtreeRenderLanes = workInProgressRootIncludedLanes = lanes;
  workInProgressRootExitStatus = RootInProgress;
  workInProgressRootFatalError = null;
  workInProgressRootSkippedLanes = NoLanes;
  workInProgressRootInterleavedUpdatedLanes = NoLanes;
  workInProgressRootRenderPhaseUpdatedLanes = NoLanes;
  workInProgressRootPingedLanes = NoLanes;
  workInProgressRootConcurrentErrors = null;
  workInProgressRootRecoverableErrors = null;


  return rootWorkInProgress;
}
```

总结下 prepareFreshStack() 的作用：

1. 将整棵树的根节点root给到 workInProgressRoot；
2. createWorkInProgress() 利用current节点创建出「更新树」的根节点；整个函数在这里我们就不展开讲了，大致内容就是判断 current.alternate （即current互相对应的那个节点）是否为空，若为空则创建出一个新节点；若不为空，则直接复用之前的节点，然后将新特性给到这个节点（不过我们这里传入的是null）；
3. workInProgress 指针初始指向到「更新树」的根节点，在接下来的递归操作中，该指针一直在变动；

准备好之后，我们再回到函数 renderRootSync()，就可以顺着 workInProgress 指针往下进行了，这里我们就进入到了函数 workLoopSync() 中。

### workLoopSync

该函数很简单，就是一个while循环，通过 performUnitOfWork() 执行每个 workInProgress 指向的那个fiber节点，直到 workInProgress 为null。

我们刚才在上面的 prepareFreshStack() 中，workInProgress 指针指向到了「更新树」的根节点rootWorkInProgress（即跟current树根节点长得一样的那个节点），这个fiber节点里的 updateQueue.shared.pending 中的一个update里，存放着element结构。

```javascript
function workLoopSync() {
  // Already timed out, so perform work without checking if we need to yield.
  // 已经超时了，所以即使需要让出时，也不再做检查，直到把workInProgress执行完
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}
```

### performUnitOfWork

处理每个fiber节点。

```javascript
function performUnitOfWork(unitOfWork: Fiber): void {
  /**
   * 初始mount节点时，unitOfWork 是上面workLoopConcurrent()中传入的 workInProgress，
   * unitOfWork.alternate 指向的是 current
   */
  const current = unitOfWork.alternate;

  let next;
  /**
   * current为当前树的那个fiber节点
   * unitOfWork为 更新树 的那个fiber节点
   * 在初始mount节点，current和unitOfWork都是fiberRoot节点
   * 在第一次调用beginWork()时，element结构通过其一系列的流程，创建出了第一个fiber节点，即<App />对应的fiber节点（我们假设<App /> 是最外层的元素）
   * next就是第一个fiber节点，然后next给到workInProgress，接着下一个循环
   */
  next = beginWork(current, unitOfWork, subtreeRenderLanes);

  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    // unitOfWork已经是最内层的节点了，没有子节点了
    // If this doesn't spawn new work, complete the current work.
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }
}
```

将当前current节点和更新树的节点，都传给 beginWork(current, unitOfWork) 函数。简单来说，beginWork会根据当前fiber节点中的element结构，创建出新的fiber节点，workInProgress再指向到这个新fiber节点继续操作，直到所有的数据都操作完。具体的操作流程，我们单独开一篇文章进行讲解。

这里我们只需要知道，诸如函数组件、类组件也是fiber节点，也是整棵fiber树的一部分。其内部的jsx(element)再继续转为fiber节点。

若beginWork()返回的next是null，说明当前节点workInProgress已经是最内层的节点了，就会引入到函数 completeUnitOfWork() 中。

### completeUnitOfWork

当前节点和当前所有的子节点都执行完了，就会调用该方法。不过我们现在只关心整个流程的流转问题。

```javascript
/**
 * 当前 unitOfWork 已没有子节点了
 * 1. 若还有兄弟节点，将 workInProgress 指向到其兄弟节点，继续beginWork()的执行；
 * 2. 若所有的兄弟节点都处理完了（或者没有兄弟节点），就指向到其父级fiber节点；回到1；
 * 3. 直到整个应用根节点的父级（根应用没有父级节点，所以为null），才结束；
 */
function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork = unitOfWork;
  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;

    // 若有兄弟节点，则继续执行兄弟节点
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      // If there is more work to do in this returnFiber, do that next.
      workInProgress = siblingFiber;
      return;
    }
    // 当前节点和兄弟节点全部遍历完毕，则返回到其父节点
    // Otherwise, return to the parent
    completedWork = returnFiber;
    // Update the next thing we're working on in case something throws.
    workInProgress = completedWork;
  } while (completedWork !== null);
}
```

所有的节点都遍历执行完了，workLoopSync()中的while()循环也就停止了，逻辑又回到了renderRootSync()，



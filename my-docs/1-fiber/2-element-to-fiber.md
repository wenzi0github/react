# React18 源码解析之虚拟 DOM 转为 fiber 树

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

我们在文章 [React18 源码解析之 fiber 等数据结构](https://www.xiabingbao.com/post/react/jsx-element-fiber-rfztfs.html) 中讲解了 jsx, element 和 fiber 的基本结构。这里我们主要讲下如何将 jsx 转为 fiber 节点组成的 fiber 树。

我们为便于理解整个转换的过程，会做一些流程上的精简：

1. 大部分只考虑初始渲染阶段，因此诸如副作用的收集等暂时就不考虑了，不过偶尔也会涉及到一点两棵 fiber 树的对比；
2. 忽略各种任务的优先级的调度；
3. React 中各个节点的类型很多，如函数组件、类组件、html 节点、Suspense 类型的组件、使用 lazy()方法的动态组件等等，不过我们这里主要讲解下函数组件、类组件、html 节点这 3 个；

`render()`方法是我们整个应用的入口，我们就从这里开始。我们在之前的文章[React18 源码解析之 render()入口方法](https://www.xiabingbao.com/post/react/react-render-rfl28t.html)中，只是讲解了 render()方法的挂载方式。这里我们会深入了解到从 jsx 转为 fiber 的整个过程。

## 1. 起始

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

我们编写这个结构主要是为了看下，嵌套的、并列的标签，流程是如何流转的，中间经历了多少个复杂的过程，才将 element 转为 fiber 节点。

## 2. 初始的 element 如何处理？

我是强烈建议使用[debug-react](https://github.com/wenzi0github/debug-react)项目来进行调试的，因为里面的分支和各种变量很多，若只是单纯地硬看，很容易懵，不知道这些变量具体是什么值！那么运行起一个 React 项目后，可以在某些关键节点、变量，打断点输出，就方便很多。

render()传入的 element 和后续的 element 的操作是不一样的。其他的 element 都可以通过执行函数组件或者类组件的实例来得到，而初始的 element 是直接提供的。

我们直接输出下`<App />`：

```javascript
console.log(<App />);
```

![App组件的element结构](https://mat1.gtimg.com/qqcdn/tupload/1659948275754.png)

可以看到，element 结构并不是把 React 所有的 jsx 都组织起来，形成巨大的嵌套结构，他只是当前某个节点里的 jsx 结构。若当前是函数组件、类组件等，内部的 jsx 可以通过执行属性 type 对应的函数或类的实例来得到，然后继续递归下去，最终把所有的 jsx 都全部解析出来。

入口函数 render() 传入的参数，就是上面`<App />`的 element 结构。内部通过属性`_internalRoot`得到整个应用的根节点 root，然后又调用了 updateContainer()：

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
  // 不过从React18开始，render不再传入callback了，即这里的if就不会再执行了
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

## 3. scheduleUpdateOnFiber

接下来我们看下 scheduleUpdateOnFiber 函数。

markUpdateLaneFromFiberToRoot(fiber, lane)方法会将当前 fiber 节点往上知道 FiberRootNode 所有节点赋值 lane 这个优先级，同时返回整个应用的根节点 FiberRootNode。

我们忽略中间任务调度的步骤，直接进入到 ensureRootIsScheduled(root) 函数中，这里的 root 参数就是整个应用的根节点 FiberRootNode。这个函数里也是一堆的任务调度，我们快进到 performConcurrentWorkOnRoot.bind(null, root)，这里面又快进到了 renderRootSync(root)。

## 4. renderRootSync

这里有一个很重要的准备操作，这里的 root 是整个应用的根节点，即 FiberRootNode，会传入到函数 prepareFreshStack() 中，主要是为了接下来的递归，初始化一些数据和属性：

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

1. 将整棵树的根节点 root 给到 workInProgressRoot；
2. createWorkInProgress() 利用 current 节点创建出「更新树」的根节点；整个函数在这里我们就不展开讲了，大致内容就是判断 current.alternate （即 current 互相对应的那个节点）是否为空，若为空则创建出一个新节点；若不为空，则直接复用之前的节点，然后将新特性给到这个节点（不过我们这里传入的是 null）；
3. workInProgress 指针初始指向到「更新树」的根节点，在接下来的递归操作中，该指针一直在变动；

准备好之后，我们再回到函数 renderRootSync()，就可以顺着 workInProgress 指针往下进行了，这里我们就进入到了函数 workLoopSync() 中。

## 5. workLoopSync

该函数很简单，就是一个 while 循环，每次循环时，都会执行函数 performUnitOfWork() ，然后操作 workInProgress 指向的那个 fiber 节点，直到 workInProgress 为 null。

我们刚才在上面的 prepareFreshStack() 中，workInProgress 指针指向到了「更新树」的根节点 rootWorkInProgress（即跟 current 树根节点长得一样的那个节点），这个 fiber 节点里的 updateQueue.shared.pending 中的一个 update 里，存放着 element 结构。

```javascript
function workLoopSync() {
  // Already timed out, so perform work without checking if we need to yield.
  // 已经超时了，所以即使需要让出时，也不再做检查，直到把workInProgress执行完
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}
```

## 6. performUnitOfWork

处理 workInProgress 指向的那个 fiber 节点。

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

将当前 current 节点和更新树的节点，都传给 beginWork(current, unitOfWork) 函数。简单来说，beginWork 会根据当前 fiber 节点中的 element 结构，创建出新的 fiber 节点，workInProgress 再指向到这个新 fiber 节点继续操作，直到所有的数据都操作完。具体的操作流程，我们单独开一篇文章进行讲解。

这里我们只需要知道，诸如函数组件、类组件也是 fiber 节点，也是整棵 fiber 树的一部分。其内部的 jsx(element)再继续转为 fiber 节点。

若 beginWork()返回的 next 是 null，说明当前节点 workInProgress 已经是最内层的节点了，就会进入到函数 completeUnitOfWork() 中。可以看到执行的流程是`深度优先`，即若当前 fiber 还能构造出子节点，即一直向下构造。直到没有子节点后，才会流转到兄弟节点和父级节点。

以我们上面的写的 React 组件为例，workInProgress 指向是的树的根节点，这个根节点没有具体的 jsx 结构。

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

1. 第一次执行后函数 beginWork() 后，得到 workInProgress 子元素里 element 结构转换出来的 fiber 节点，就是 `<App />` 对应的 fiber 节点，然后给到变量 next；workInProgress 再移动这个 fiber 节点上；
2. 继续执行函数 beginWork()，得到`<App />`子元素的 fiber 节点，即 div 标签对应的 fiber 节点；
3. 继续执行函数 beginWork()，得到 div 标签子元素的 fiber 节点，若子元素是一个数组，beginWork() 会把所有的子元素都转为 fiber 节点，并形成单向链表，然后返回这个链表的头指针。这里，div 标签里有 3 个并列的元素，即`<FuncComponent />`, `<ClassComponent>`和 div 标签，beginWork()会节点的不同类型，创建出不同的 fiber 节点，然后形成链表，再回到这个链表的第 1 个节点；即 workInProgress 指向了`<FuncComponent />`生成的 fiber 节点；
4. 继续执行函数 beginWork()，就会到`<FuncComponent />`里的 jsx 对应的 fiber 节点，即 p 标签（beginWork()只会一层一层的构建），workInProgress 再指向到 p 标签对应的 fiber 节点，继续构建 span 和文本对应的 fiber 节点；
5. 文本再往内，就没有节点了，即 next 得到的是 null，这时就会进入到 completeUnitOfWork() 函数，通过该函数的调度，workInProgress 又回到了`<FuncComponent />`的兄弟节点`<ClassComponent />`；
6. 继续执行函数 beginWork()，得到 `<ClassComponent />` 里的 jsx 对应的 fiber 节点，即 p 标签；

我们接下来再看下函数 completeUnitOfWork() 是如何流转 workInProgress 指针的。

## 7. completeUnitOfWork

当前节点和当前所有的子节点都执行完了，就会调用该方法。现在我们只关心整个流程的流转问题。

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
    const returnFiber = completedWork.return; // 每个节点都有一个return属性，指向到其父级节点

    // 若有兄弟节点，则继续执行兄弟节点
    const siblingFiber = completedWork.sibling; // 该节点下一个兄弟节点
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
  } while (completedWork !== null); // while的作用就是若该节点没有兄弟节点，能够一直往上找父级节点，
}
```

通过这张图，我们可以更加直观地理解[整个流转流程](https://docs.qq.com/flowchart/DS3lvUGZqRkFxZU9J?u=d34e6db0943f45ed8747cdd1927e98b2)：

![fiber构建的流程](https://mat1.gtimg.com/qqcdn/tupload/1659946723697.png)

图中的数字，就是 workInProgress 指针行进的顺序。

1. 当有子节点时，就一直往下构建其子节点；若子节点有多个，则一并都构建出来；
2. 若没有子节点，则优先查询是否有兄弟节点，若有，则流转到兄弟节点（如图中的 5 和 8），回到 1；
3. 若没有兄弟节点，则回到其父级节点（红色箭头），然后查询父级节点是否有兄弟节点，若有则回到 2，若没有，则继续回到父级节点；

所有的节点都遍历执行完了，workLoopSync()中的 while()循环也就停止了，workInProgress 也指向到了 null，然后就可以进入到 DOM 渲染的 commit 阶段了。

## 8. 总结

到这里，我们把 element 转为 fiber 节点的大致流程过了一遍。主要了解到以下几个知识点：

1. element 结构从一开始并不是一个巨大的嵌套结构，而是执行组件后，才能得到这个组件里的 element 结构；
2. 转成 fiber 节点的过程，`深度优先`的原则，优先执行其第 1 个节点，然后再执行兄弟节点，再回到父级节点；
3. 每次将 element 结构转为 fiber 节点时，只转当前 fiber 节点里的 element 最直接的子节点，若还有更深的子节点，则等着一会儿 workInProgress 流转到这里的时候，再执行；
4. 若当前层级的 element 结构是一个数组，即有多个元素时，则会一并全部进行转换；

接下来的文章，我们会再详细介绍下函数 beginWork()，了解不同的 element 结构如何转成 fiber 节点的。

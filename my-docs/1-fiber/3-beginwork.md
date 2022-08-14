# React18 源码解析之 beginWork 的操作

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

我们在上一篇文章 [React18 源码解析之虚拟 DOM 转为 fiber 树](https://www.xiabingbao.com/post/fe/loop-settimeout-rg18mv.html) 中只是简单地了解了下 beginWork() 的操作，通过 beginWork()可以将当前 fiber 节点里的 element 转为 fiber 节点。这篇文章我们会详细讲解下，element 转为 fiber 节点的具体实现。

## 1. 基本操作

beginWork()函数根据不同的节点类型（如函数组件、类组件、html 标签、树的根节点等），调用不同的函数来处理，将该 fiber 节点中带有的 element 结构解析成 fiber 节点。我们第一次调用时，unitOfWork（即 workInProgress）最初指向的就是树的根节点，这个根节点的类型`tag`是：HostRoot。

根据不同的 fiber 节点属性，携带的不同的 element 结构，处理方式也是不一样的。

1. HostRoot 类型的，即树的根节点类型的，会把 workInProgress.updateQueue.shared.pending 对应的环形链表中 element 结构，放到 workInProgress.updateQueue.firstBaseUpdate 里，等待后续的执行；
2. FunctionComponent 类型，即函数组件的，会执行这个函数，返回的结果就是 element 结构；
3. ClassComponent 类型的，即类组件的，会得到这个类的实例，然后执行 render()方法，返回的结构就是 element 结构；
4. HostComponent 类型的，即 html 标签类型的，通过`children`属性，即可得到；

上面不同类型的 fiber 节点都得到了 element 结构，但将 element 转为 fiber 节点时，调用的方式也不一样，如转为文本节点、普通 div 节点、element 为数组转为系列节点、或者 elemen 转为 FunctionComponent 类型的节点等等。

beginWork()处理完当前 fiber 节点的 element 结构后，就会到一个这个 element 对应的新的 fiber 节点（若 element 是数组的话，则得到的是 fiber 链表结构的头节点），workInProgress 再指向到这个新的 fiber 节点（workInProgress = next），继续处理。若没有子节点了，workInProgress 就会指向其兄弟元素；若所有的兄弟元素也都处理完了，就返回到其父级节点，查看父级是否有兄弟节点。

## 2. 判断workInProgress是否可以提前退出

这里进行了一些简单的判断，判断前后两个fiber节点是否有发生变化，若没有变化时，在后续的操作中可以提前结束，或者称之为"剪枝"，是一种优化的手段。

![判断workInProgress是否可以提前退出](https://mat1.gtimg.com/qqcdn/tupload/1660031611757.png)

更具体的流程图可以查看这个： [判断workInProgress是否可以提前退出](https://docs.qq.com/flowchart/DS1ZLYVpydkdpQmlo) 。

若没有任何更新时，可以提前退出当前的流程，进入到函数 attemptEarlyBailoutIfNoScheduledUpdate()。

不过在我们初始渲染阶段，通过 checkScheduledUpdateOrContext() 得到 hasScheduledUpdateOrContext 是true，但 current.flags & ForceUpdateForLegacySuspense 又为 NoFlags：

```javascript
/**
 * 判断current的lanes和renderLanes是否有重合，若有则需要更新
 * 初始render时，current.lanes和renderLanes是一样的，则返回true
 */
const hasScheduledUpdateOrContext = checkScheduledUpdateOrContext(
  current,
  renderLanes,
); // true

(current.flags & ForceUpdateForLegacySuspense) !== NoFlags; // false
```

因此并不会进入到提前结束的流程（想想也不可能，刚开始构建，怎么就立刻结束呢？），didReceiveUpdate 得到的结果为 false。

然后就进入到`switch-case`阶段了，根据当前fiber的不同类型，来调用不同的方法。

## 3. 根据fiber节点的类型进行不同的操作

我们在上面也说了，React中fiber节点的类型很多，不过我们主要关注其中的4种类型：

1. HostRoot 类型的，即树的根节点类型的；
2. FunctionComponent 类型，即函数组件的；
3. ClassComponent 类型的，即类组件；
4. HostComponent 类型的，即 html 标签类型；

workInProgress初始时指向的是树的根节点，该节点的类型 tag 为`HostRoot`。从这里开始构建这棵fiber树。下面的几个操作，都是为了得到当前fiber节点中的element。

大致的流程：

![React中beginWork的执行流程](https://mat1.gtimg.com/qqcdn/tupload/1660402559480.png)

### 3.1 HostRoot

当节点类型为 HostRoot时，会进入到这个分支中，然后执行函数 updateHostRoot()。

```javascript
updateHostRoot(current, workInProgress, renderLanes);
```

#### 3.1.1 复制 updateQueue 中的属性函数 cloneUpdateQueue

在函数 updateHostRoot() 中，cloneUpdateQueue()是将current.updateQueue中的数据给到workInProgress.updateQueue：

```javascript
/**
 * 将current中updateQueue属性中的字段给到workInProgress
 * @param current
 * @param workInProgress
 */
export function cloneUpdateQueue<State>(
  current: Fiber,
  workInProgress: Fiber,
): void {
  // Clone the update queue from current. Unless it's already a clone.
  // 将current节点中的update链表克隆给到workInProgress，除非已经克隆过了
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);
  const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
  if (queue === currentQueue) {
    const clone: UpdateQueue<State> = {
      baseState: currentQueue.baseState,
      firstBaseUpdate: currentQueue.firstBaseUpdate,
      lastBaseUpdate: currentQueue.lastBaseUpdate,
      shared: currentQueue.shared,
      effects: currentQueue.effects,
    };
    workInProgress.updateQueue = clone;
  }
}
```

这里直接在函数内部进行了，并没有返回数据。

在React中很多地方都是这样，这是用到了js中的 [对象引用](https://segmentfault.com/a/1190000014724227) 的特性，即对于数组和 object 类型这两种数据结构而言，当多个变量指向同一个地址时，改变其中变量的值，其他变量的值也会同步更新。

#### 3.1.2 processUpdateQueue

函数 processUpdateQueue() 相对来说，功能复杂一些。功能主要是操作 workInProgress 中的 updateQueue 属性，将其中将要进行的更新队列拿出来，串联执行，得到最终的一个结果。

在初始render()阶段，workInProgress.updateQueue.shared.pending中只有一个update节点，这个节点中存放着一个element结构，通过一通的运算后，就可以得到这个element结构，然后将其放到了 workInProgress.updateQueue.baseState 中。

源码比较长，可以直接 [点击链接](https://github.com/wenzi0github/react/blob/55a685a8db632780436b52c5ebc6d968644a8eca/packages/react-reconciler/src/ReactUpdateQueue.old.js#L519) 去GitHub上查看。

关于 processUpdateQueue() 函数的详细解读，可以参考这篇文章[]()。我们这里就不展开了。这里要知道的是执行该方法后，初始的element结构，已经存放在了 workInProgress.memoizedState 中了。

```javascript
const nextState: RootState = workInProgress.memoizedState;

// 若前后两次的element没有变化，则提前退出，直接复用之前的节点
// 而初始时，prevChildren为null，nextChildren为将要更新的element，肯定不相等
if (nextChildren === prevChildren) {
  return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
}
/**
 * nextChildren 为将要转为fiber节点的element结构，
 * 将得到的fiber结构给到 workInProgress.child
 */
reconcileChildren(current, workInProgress, nextChildren, renderLanes);
```

关于函数 reconcileChildren() 如何将element转为 fiber结构，可以参考第4节。如上面所说，本第3节的内容，都只是根据不同的类型的组件，通过不同的方式获取到 element结构。具体怎么转换，是在函数 reconcileChildren() 中。

### 3.2 FunctionComponent

当节点类型为 FunctionComponent 时，会进入到这个分支中，然后执行函数 updateFunctionComponent()。

若 workInProgress 为函数组件，只有执行这个函数，才能得到内部的jsx。而这个实体函数就放在属性`type`中。函数组件会涉及到hooks的使用，这里我们暂时会直接跳过，不讲解hooks。

```javascript
const Component = workInProgress.type; // 函数组件时，type即该函数，可以直接执行type()
```

函数组件的主体就放在属性type中，后续执行该type字段即可。

#### 3.2.1 updateFunctionComponent

对函数组件进行处理。

```javascript
function updateFunctionComponent(
  current,
  workInProgress,
  Component,
  nextProps: any,
  renderLanes,
) {
  let nextChildren = renderWithHooks(
    current,
    workInProgress,
    Component,
    nextProps,
    context,
    renderLanes,
  );
  /**
   * 若current不为空，且 didReceiveUpdate 为false时，
   * 执行 bailoutHooks
   */
  if (current !== null && !didReceiveUpdate) {
    bailoutHooks(current, workInProgress, renderLanes);
    /**
     * 优化的工作路径 —— bailout https://juejin.cn/post/7017702556629467167#heading-17
     * React 引入了树遍历算法中的常用优化手段 —— “剪枝”，在 React 中又被称作 bailout 。
     * 通过 bailout ，某些与本次更新毫无关系的 Fiber 树路径将被直接省略掉；当然，
     * “省略”并不是直接将这部分 Fiber 节点丢弃，而是直接复用被“省略”的 Fiber 子树的根节点；
     * 这种“复用”方式，是会保留被“省略”的 Fiber 子树的所有 Fiber 节点的。
     */
    return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
  }

  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}
```

可以看到该方法的最后，也是调用了函数 reconcileChildren()。

这里最主要的是nextChildren怎么得到的？

```javascript
nextChildren = renderWithHooks(
  current,
  workInProgress,
  Component,
  nextProps,
  context,
  renderLanes,
);
```

#### 3.2.2 renderWithHooks

这里我们精简下 renderWithHooks() 中的操作：

```javascript
export function renderWithHooks<Props, SecondArg>(
  current: Fiber | null,
  workInProgress: Fiber,
  Component: (p: Props, arg: SecondArg) => any,
  props: Props,
  secondArg: SecondArg,
  nextRenderLanes: Lanes,
): any {
  renderLanes = nextRenderLanes;
  currentlyRenderingFiber = workInProgress; // 当前Function Component对应的fiber节点

  // 根据是否是初始化挂载，来决定是初始化hook，还是更新hook
  // 将初始化或更新hook的方法给到 ReactCurrentDispatcher.current 上，
  // 稍后函数组件拿到的hooks，都是从 ReactCurrentDispatcher.current 中拿到的
  ReactCurrentDispatcher.current =
    current === null || current.memoizedState === null
      ? HooksDispatcherOnMount
      : HooksDispatcherOnUpdate;

  /**
   * 执行 Function Component，将我们写的jsx通过babel编译为element结构，并返回
   */
  let children = Component(props, secondArg);

  return children;
}
```

核心的操作就是`children = Component(props, secondArg)`，通过执行该函数，得到内部的element结构，即children，然后返回到 updateFunctionComponent()，再传递给 reconcileChildren() 进行处理。

若只是了解element转为fiber的过程，上面的精简版已经够用了。若想了解 renderWithHooks() 具体都做了些什么，可以跳转去：[React18 源码解析之 hooks 的挂载](https://www.xiabingbao.com)。

### 3.3 ClassComponent

当节点类型为 ClassComponent 时，会进入到这个分支中，然后执行函数 updateClassComponent()。

现在函数组件是React的趋势，我们不会深入类组件的各个环节。

workInProgress 对应的是类组件时，workInProgress.stateNode中应当存储的是该类组件的实例。在初始render()阶段，workInProgress.stateNode为空，需要调用函数 constructClassInstance() 来创建实例。

#### 3.3.1 constructClassInstance

该函数主要是用来创建 workInProgress 这个fiber节点对应的类组件的实例，同时将创建出来的实例和workInProgress节点进行互相绑定。

```javascript
/**
 * 创建workInProgress对应的类组件的实例，同时将实例和fiber节点进行互相绑定
 * @param {Fiber} workInProgress 当前fiber节点
 * @param {any} ctor 类组件，可以：new ctor()
 * @param props
 * @returns {*} instance 实例
 */
function constructClassInstance(
  workInProgress: Fiber,
  ctor: any,
  props: any,
): any {
  // 初始化出类的实例
  let instance = new ctor(props, context);

  // 获取到类组件中的state，放到workInProgress中的memoizedState字段中
  const state = (workInProgress.memoizedState =
    instance.state !== null && instance.state !== undefined
      ? instance.state
      : null);

  /**
   * 将workInProgress和类的实例进行互相绑定
   * instance.updater = workInProgress;
   * workInProgress.stateNode = instance;
   */
  adoptClassInstance(workInProgress, instance);

  return instance;
}
```

这里只是创建出来了一个实例而已，并没有执行内部任何的方法。

创建成功后，我们就可以直接从 workInProgress.stateNode 拿到这个类的实例了，然后再执行其内部的一些生命周期方法和render()等。

#### 3.3.2 mountClassInstance

再回到 updateClassComponent()，接着就会执行 mountClassInstance()。这里面会执行一些调用render()之前的方法和生命周期，如 getDerivedStateFromProps、componentWillMount等。

> componentDidMount是渲染完成后才会执行的方法，因此这里并不会执行该生命周期。

我们使用函数constructClassInstance()，保证了后续从 workInProgress.stateNode 中获取实例时，一定是存在的。

```javascript
// 执行渲染之前的一些生命周期函数
function mountClassInstance(
  workInProgress: Fiber,
  ctor: any,
  newProps: any,
  renderLanes: Lanes,
): void {
  const instance = workInProgress.stateNode; // 获取到类组件的实例
  instance.props = newProps;
  instance.state = workInProgress.memoizedState; // 类组件的state
  instance.refs = emptyRefsObject;

  // 给类组件对应的fiber节点，初始化一个更新链表： fiber.updateQueue
  initializeUpdateQueue(workInProgress);

  const contextType = ctor.contextType;
  if (typeof contextType === 'object' && contextType !== null) {
    instance.context = readContext(contextType);
  } else if (disableLegacyContext) {
    instance.context = emptyContextObject;
  } else {
    const unmaskedContext = getUnmaskedContext(workInProgress, ctor, true);
    instance.context = getMaskedContext(workInProgress, unmaskedContext);
  }
  
  // 没懂，为什么这里又重新赋值一次？
  instance.state = workInProgress.memoizedState;

  /**
   * https://zh-hans.reactjs.org/docs/react-component.html#static-getderivedstatefromprops
   * getDerivedStateFromProps 是一个静态方法，会在调用 render 方法之前调用，并且在初始挂载及后续更新时都会被调用。
   * 它应返回一个对象来更新 state，如果返回 null 则不更新任何内容。
   */
  const getDerivedStateFromProps = ctor.getDerivedStateFromProps;
  if (typeof getDerivedStateFromProps === 'function') {
    applyDerivedStateFromProps(
      workInProgress,
      ctor,
      getDerivedStateFromProps,
      newProps,
    );
    instance.state = workInProgress.memoizedState;
  }

  // In order to support react-lifecycles-compat polyfilled components,
  // Unsafe lifecycles should not be invoked for components using the new APIs.
  if (
    typeof ctor.getDerivedStateFromProps !== 'function' &&
    typeof instance.getSnapshotBeforeUpdate !== 'function' &&
    (typeof instance.UNSAFE_componentWillMount === 'function' ||
      typeof instance.componentWillMount === 'function')
  ) {
    /**
     * 当 componentWillMount 和 UNSAFE_componentWillMount 已定义时，执行这俩
     */
    callComponentWillMount(workInProgress, instance);
    // If we had additional state updates during this life-cycle, let's
    // process them now.
    // 执行当前fiber节点的更新链表中的update，不过初始化时，update为空，不需要更新
    processUpdateQueue(workInProgress, newProps, instance, renderLanes);
    instance.state = workInProgress.memoizedState; // 得到最新的state
  }

  /**
   * 我猜的哈： componentDidMount 并不会像上面的方法那样直接执行，而是采用lanes模型来调度
   */
  if (typeof instance.componentDidMount === 'function') {
    let fiberFlags: Flags = Update;
    if (enableSuspenseLayoutEffectSemantics) {
      fiberFlags |= LayoutStatic;
    }
    workInProgress.flags |= fiberFlags;
  }
}
```

#### 3.3.3 finishClassComponent

我们再次回到 updateClassComponent() 中，这时就流转到 finishClassComponent() 中了。这里面会调用render()方法获取到jsx（即element结构），然后调用 reconcileChildren() 将element转为fiber结构。

```javascript

/**
 * finishClassComponent()执行render()方法得到element，
 * 然后调用 reconcileChildren() 得到 workInProgress.child，并返回
 * 注意：这里面并没有执行 componentDidMount() 这些生命周期
 * @param current
 * @param workInProgress
 * @param Component
 * @param shouldUpdate
 * @param hasContext
 * @param renderLanes
 * @returns {Fiber}
 */
function finishClassComponent(
  current: Fiber | null,
  workInProgress: Fiber,
  Component: any,
  shouldUpdate: boolean,
  hasContext: boolean,
  renderLanes: Lanes,
) {
  const instance = workInProgress.stateNode; // 类组件的实例

  // 类组件，就调用render()方法获取jsx对应的element结构
  nextChildren = instance.render();
  
  // 获取到element结构后，调用函数 reconcileChildren() 将其转为 workInProgress.child
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);

  // Memoize state using the values we just used to render.
  // render()之后重新存储state的值
  workInProgress.memoizedState = instance.state;

  return workInProgress.child;
}
```

到这里，类组件中的element已转为fiber节点。

### 3.4 HostComponent

当节点类型为 HostComponent 时，说明当前fiber节点是原生html标签，会进入到这个分支中，然后执行函数 updateHostComponent()。

原生HTML标签对应的fiber节点，获取element时就简单很多。直接从props中获取children属性即可，唯一要注意的就是对文本节点的处理，不过这里我没看懂。

```javascript
/**
 * 处理html标签的element结构
 * @param current
 * @param workInProgress
 * @param renderLanes
 * @returns {Fiber}
 */
function updateHostComponent(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
) {
  const type = workInProgress.type; // 当前节点的类型，
  const nextProps = workInProgress.pendingProps; // props，如className, id, children等
  const prevProps = current !== null ? current.memoizedProps : null;

  let nextChildren = nextProps.children;
  // 判断接下来是否要设置文本了，不过没看懂，若接下来是文本节点，为什么要把 nextChildren 设置为null？
  // 而且在接下来的 updateHostText() 中，什么也没干
  const isDirectTextChild = shouldSetTextContent(type, nextProps);

  if (isDirectTextChild) {
    // 若接下要转换的是文本节点，则
    // We special case a direct text child of a host node. This is a common
    // case. We won't handle it as a reified child. We will instead handle
    // this in the host environment that also has access to this prop. That
    // avoids allocating another HostText fiber and traversing it.
    nextChildren = null;
  } else if (prevProps !== null && shouldSetTextContent(type, prevProps)) {
    // If we're switching from a direct text child to a normal child, or to
    // empty, we need to schedule the text content to be reset.
    workInProgress.flags |= ContentReset;
  }

  markRef(current, workInProgress);

  /**
   * 对除文本类型之外的其他类型，转为fiber节点
   */
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}
```

这里还得保留一个疑问，目前没看懂对文本类型的处理，接下来是文本节点，为什么要把 nextChildren 设置为null？而且在接下来的 updateHostText() 中，什么也没干。那么哪个地方处理这个文本内容了。

### 3.5 IndeterminateComponent

有同学在 `FunctionComponent` 中打点时，发现第一次渲染时，各种函数组件并没有进入到那个逻辑里。其实函数类型的组件都进入到 `IndeterminateComponent` 的类型中了，即不确定类型的组件。

为什么用 function 编写的组件，还是"不确定类型"呢？如以下的两种方式：

```javascript
// function中return 带有 render() 的obj
function App() {
  return {
    render() {
      return (<p>function render</p>);
    }
  }
}

// function 中直接return一个jsx
function App() {
  return (<p>function jsx</p>);
}
```

上面这两种方式，React都是支持的，个人猜测，这是因为在js中，class也是可以用function来模拟的，有的开发者喜欢用function来实现class。

那么在React内部，就得判断这两者

## 4. reconcileChildren






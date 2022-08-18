# React18 源码解析之 reconcileChildren 的执行

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

## 1. reconcileChildren

函数 reconcileChildren() 是一个入口函数，这里会根据 current 的 fiber 节点的状态，分化为 mountChildFibers() 和 reconcileChildFibers()。

```javascript
/**
 * 调和，创建或更新fiber树
 * 若current的fiber节点为null，调用 mountChildFibers 初始化
 * 若current不为空，说明要得到一棵新的fiber树，执行 reconcileChildFibers() 方法
 * @param current 当前树中的fiber节点，可能为空
 * @param workInProgress 将要构建树的fiber节点
 * @param nextChildren 将要构建为fiber节点的element结构
 * @param renderLanes 当前的渲染优先级
 */
export function reconcileChildren(current: Fiber | null, workInProgress: Fiber, nextChildren: any, renderLanes: Lanes) {
  if (current === null) {
    /**
     * mount阶段，这是一个还未渲染的全新组件，我们不用通过对比最小副作用来更新它的子节点。
     * 直接转换nextChildren即可，不用标记哪些节点需要删除等等
     */
    workInProgress.child = mountChildFibers(workInProgress, null, nextChildren, renderLanes);
  } else {
    /**
     * 若current不为null，则需要进行的工作：
     * 1. 判断之前的fiber节点是否可以复用；
     * 2. 若不能复用，则需要标记删除等；
     */
    workInProgress.child = reconcileChildFibers(
      workInProgress,

      /**
       * 因为我们要构建的是workInProgress的子节点，这里也传入current的子节点，
       * 方便后续的对比和复用
       */
      current.child,
      nextChildren,
      renderLanes,
    );
  }
}
```

再看下这两个函数的区别：

```javascript
export const reconcileChildFibers = ChildReconciler(true); // 需要收集副作用
export const mountChildFibers = ChildReconciler(false); // 不用追踪副作用
```

这两个函数都是 ChildReconciler() 生成，只是参数不一样。可见这两个函数就区别在是否要追踪 fiber 节点的副作用。

## 2. ChildReconciler

ChildReconciler(shouldTrackSideEffects) 只有一个参数，并返回的是一个函数。

```javascript
/**
 * 子元素协调器，即把当前fiber节点中的element结构转为fiber节点
 * @param {boolean} shouldTrackSideEffects 是否要追踪副作用，即我们本来打算复用之前的fiber节点，但又复用不了，需要给该fiber节点打上标记，后续操作该节点
 * @returns {function(Fiber, (Fiber|null), *, Lanes): *} 返回可以将element转为fiber的函数
 */
function ChildReconciler(shouldTrackSideEffects) {
  // 暂时省略其他代码

  function reconcileChildFibers(
    returnFiber: Fiber, // 当前 Fiber 节点，即 workInProgress
    currentFirstChild: Fiber | null, // current 树上对应的当前 Fiber 节点的第一个子 Fiber 节点，mount 时为 null，主要是为了是否能复用之前的节点
    newChild: any, // returnFiber中的element结构，用来构建returnFiber的子节点
    lanes: Lanes, // 优先级相关
  ): Fiber | null {
    // 省略
    return deleteRemainingChildren(returnFiber, currentFirstChild);
  }

  return reconcileChildFibers;
}
```

当 current 对应的 fiber 节点为 null 时，那它就没有子节点，也无所谓复用和删除的说法，直接按照 workInProgress 里的 element 构建新的 fiber 节点即可，这时，是不用收集副作用的。

若 current 对应的 fiber 节点不为 null 时，那么就把 current 的子节点拿过来，看看是否有能复用的节点，有能复用的节点就直接复用；不能复用的，比如类型发生了改变的（div 标签变成了 p 标签），新结构里已经没有该 fiber 节点了等等，都是要打上标记，后续在 commit 阶段进行处理。

## 3. reconcileChildFibers

函数 reconcileChildFibers() 不做实际的操作，仅是根据 element 的类型，调用不同的方法来处理，相当于一个路由分发。

```javascript
/**
 * 将returnFiber节点（即当前的workInProgress对应的节点）里的element结构转为fiber结构
 * @param returnFiber 当前的workInProgress对应的fiber节点
 * @param currentFirstChild current 树上对应的当前 Fiber 节点的第一个子 Fiber 节点，可能为null
 * @param newChild returnFiber中的element结构，用来构建returnFiber的子节点
 * @param lanes
 * @returns {Fiber|*}
 */
function reconcileChildFibers(
  returnFiber: Fiber, // 当前 Fiber 节点，即 workInProgress
  currentFirstChild: Fiber | null,
  newChild: any,
  lanes: Lanes, // 优先级相关
): Fiber | null {
  // 是否是顶层的没有key的fragment组件
  const isUnkeyedTopLevelFragment =
    typeof newChild === 'object' && newChild !== null && newChild.type === REACT_FRAGMENT_TYPE && newChild.key === null;

  // 若是顶层的fragment组件，则直接使用其children
  if (isUnkeyedTopLevelFragment) {
    newChild = newChild.props.children;
  }

  // Handle object types
  // 判断该节点的类型
  if (typeof newChild === 'object' && newChild !== null) {
    /**
     * newChild是Object，再具体判断 newChild 的具体类型。
     * 1. 是普通React的函数组件、类组件、html标签等
     * 2. portal类型；
     * 3. lazy类型；
     * 4. newChild 是一个数组，即workInProgress节点下有并排多个结构，这时 newChild 就是一个数组
     * 5. 其他迭代类型，我暂时也不确定这哪种？
     */
    switch (newChild.$$typeof) {
      case REACT_ELEMENT_TYPE:
        // 一般的React组件，如<App />或<p></p>等
        return placeSingleChild(
          // 调度单体element结构的元素
          reconcileSingleElement(returnFiber, currentFirstChild, newChild, lanes),
        );
      case REACT_PORTAL_TYPE:
        return placeSingleChild(reconcileSinglePortal(returnFiber, currentFirstChild, newChild, lanes));
      case REACT_LAZY_TYPE:
        const payload = newChild._payload;
        const init = newChild._init;
        // TODO: This function is supposed to be non-recursive.
        return reconcileChildFibers(returnFiber, currentFirstChild, init(payload), lanes);
    }

    if (isArray(newChild)) {
      // 若 newChild 是个数组
      return reconcileChildrenArray(returnFiber, currentFirstChild, newChild, lanes);
    }

    if (getIteratorFn(newChild)) {
      return reconcileChildrenIterator(returnFiber, currentFirstChild, newChild, lanes);
    }

    throwOnInvalidObjectType(returnFiber, newChild);
  }

  if ((typeof newChild === 'string' && newChild !== '') || typeof newChild === 'number') {
    // 文本节点
    return placeSingleChild(reconcileSingleTextNode(returnFiber, currentFirstChild, '' + newChild, lanes));
  }

  // Remaining cases are all treated as empty.
  // 上面都操作完成后，删除剩余没有复用的子节点
  return deleteRemainingChildren(returnFiber, currentFirstChild);
}
```

函数 reconcileChildFibers() `只处理` workInProgress 节点里的 element 结构，无论 element 是一个节点，还是一组节点，会把这一层的节点都进行转换，若 element 中对应的只有一个 fiber 节点，那就返回这个节点，若是一组数据，则会形成一个 fiber 单向链表，然后返回这个链表的头节点。

源码的注释里也明确说了，`reconcileChildFibers()`不是递归函数，他只处理当前层级的数据。如果还有印象的话，我们在之前讲解的函数`performUnitOfWork()`，他本身就是一个连续递归的操作。整个流程的控制权在这里。

```javascript
function performUnitOfWork(unitOfWork: Fiber): void {
  const current = unitOfWork.alternate;

  let next;
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

这里我们主要讲解一般的 React 类型 REACT_ELEMENT_TYPE，数组类型和普通文本类型的 element 的构建。

## 4. 单体 element 结构的元素 reconcileSingleElement

若 element 中只对应一个元素，且是普通 React 的函数组件、类组件、html 标签等类型，那我们调用 reconcileSingleElement() 来处理。

1. 判断是否可以复用之前的节点，复用节点的标准是 key 一样、类型一样，任意一个不一样，都无法复用；
2. 新要构建的节点是只有一个节点，但之前不一定只有一个节点，比如之前是多个 li 标签，新 element 中只有一个 li 标签；

若无法复用之前的节点，则将之前的节点删除，创建一个新的。

### 4.1 对比判断是否有可复用的节点

在对比过程中，采用了循环的方式，这是因为同一层的fiber节点是横向串联起来的。而且，虽然新节点是单个节点，但却无法保证之前的节点也是单个节点，因此这里用循环的方式查找第一个 key和节点类型都一样的节点，进行复用。

```javascript
/**
 * 单个普通ReactElement的构建
 * @param returnFiber
 * @param currentFirstChild
 * @param element
 * @param lanes
 * @returns {Fiber}
 */
function reconcileSingleElement(
  returnFiber: Fiber,
  currentFirstChild: Fiber | null,
  element: ReactElement,
  lanes: Lanes,
): Fiber {
  // element是workInProgress中的，表示正在构建中的
  const key = element.key;

  // child: 现在正在使用的child
  let child = currentFirstChild;

  // 新节点是单个节点，但无法保证之前的节点也是单个节点，
  // 这里用循环查找第一个 key和节点类型都一样的节点，进行复用
  while (child !== null) {
    // TODO: If key === null and child.key === null, then this only applies to
    // the first item in the list.
    // 比较key值是否有变化，这是复用Fiber节点的先决条件
    // 若找到key一样的节点，即使都为null，那也是节点一样
    // 注意key为null我们也认为是相等，因为单个节点没有key也是正常的
    if (child.key === key) {
      const elementType = element.type;
      if (elementType === REACT_FRAGMENT_TYPE) {
        // 复用之前的fiber节点，整体在下面
      }
      // Didn't match.
      // 若key一样，但节点类型没有匹配上，无法直接复用，则直接删除该节点和其兄弟节点，停止循环，
      // 开始走下面的创建新fiber节点的逻辑
      deleteRemainingChildren(returnFiber, child);
      break;
    } else {
      // 若key不一样，不能复用，标记删除当前单个child节点
      deleteChild(returnFiber, child);
    }
    child = child.sibling; // 指针指向下一个sibling节点，检测是否可以复用
  }

  // 上面的一通循环没找到可以复用的节点，则接下来直接创建一个新的fiber节点
  if (element.type === REACT_FRAGMENT_TYPE) {
    // 若新节点的类型是 REACT_FRAGMENT_TYPE，则调用 createFiberFromFragment() 方法创建fiber节点
    // createFiberFromFragment() 也是调用的createFiber()，第1个参数指定fragment类型
    // 然后再调用 new FiberNode() 创建一个fiber节点实例
    const created = createFiberFromFragment(element.props.children, returnFiber.mode, lanes, element.key);
    created.return = returnFiber; // 新节点的return指向到父级节点
    // 额外的，fragment元素没有ref
    return created;
  } else {
    // 若新节点是其他类型，如普通的html元素、函数组件、类组件等，则会调用 createFiberFromElement()
    // 这里面再接着调用 createFiberFromTypeAndProps()，然后判断element的type是哪种类型
    // 然后再调用对应的create方法创建fiber节点
    // 有心的同学可能已经发现，这里用了一个else，但实际上if中已经有return了，这里就用不到else了，可以去提pr了！
    const created = createFiberFromElement(element, returnFiber.mode, lanes);
    created.ref = coerceRef(returnFiber, currentFirstChild, element); // 处理ref
    created.return = returnFiber;
    return created;
  }
}
```

如何复用之前的 fiber 节点？我们知道[fragment 标签](https://zh-hans.reactjs.org/docs/fragments.html)没有什么意义，仅仅是为了聚合内容，而且 fragment 标签也是可以设置 key 的。fragment 标签与其他标签是不一样的，因此这里单独进行了处理：

```javascript
// 将要构建的是fragment类型，这里在之前的节点里找到一个fragment类型的
if (child.tag === Fragment) {
  /**
   * deleteRemainingChildren(returnFiber, fiber); // 删除当前fiber及后续所有的兄弟节点
   */
  deleteRemainingChildren(returnFiber, child.sibling); // 已找到可复用的fiber节点，从下一个节点开始全部删除

  /**
   * useFiber是将当前可以复用的节点和属性传入，然后复制合并到workInProgress上
   * @type {Fiber}
   */
  const existing = useFiber(child, element.props.children); // 该节点是fragment类型，则复用其children
  existing.return = returnFiber; // 重置新Fiber节点的return指针，指向当前Fiber节点
  // 多说一句，fragment类型的fiber没有ref属性，这里不用处理

  return existing;
} else {
  // 其他类型，如REACT_ELEMENT_TYPE, REACT_LAZY_TYPE等
  if (
    child.elementType === elementType ||
    // Keep this check inline so it only runs on the false path:
    (__DEV__ ? isCompatibleFamilyForHotReloading(child, element) : false) ||
    // Lazy types should reconcile their resolved type.
    // We need to do this after the Hot Reloading check above,
    // because hot reloading has different semantics than prod because
    // it doesn't resuspend. So we can't let the call below suspend.
    (typeof elementType === 'object' &&
      elementType !== null &&
      elementType.$$typeof === REACT_LAZY_TYPE &&
      resolveLazy(elementType) === child.type)
  ) {
    /**
     * deleteRemainingChildren(returnFiber, fiber); // 删除当前fiber及后续所有的兄弟节点
     */
    deleteRemainingChildren(returnFiber, child.sibling); // 已找到可复用的fiber节点，从下一个节点开始全部删除
    const existing = useFiber(child, element.props); // 复用child节点和element.props属性
    existing.ref = coerceRef(returnFiber, child, element); // 处理ref
    existing.return = returnFiber; // 重置新Fiber节点的return指针，指向当前Fiber节点

    return existing;
  }
}
```

这里可能会有人有疑问，deleteRemainingChildren() 只删除后续的节点，那前面的节点怎么办呢？其实在 reconcileChildFibers() 的最后也调用了 deleteRemainingChildren()，用来删除剩余未复用的节点。

从这里也能看到，我们在React组件的状态变更时，尽量不要修改元素的标签类型，否则当前元素对应的fiber节点及所有的子节点都会被丢弃，然后重新创建。如

```javascript
// 原来的
function App() {
  return (<div>
    <Count />
    <p></p>
  </div>);
}

// 经useState()修改后的
function App() {
  return (<secion>
    <Count />
    <p></p>
  </secion>);
}
```

虽然只是外层的div标签变成了section标签，内部的都没有变化，但React在进行对比时，还是认为没有匹配上，然后把div对应的fiber节点及所有的子节点都删除了，重新从section标签开始构建新的fiber节点。

### 4.2 复用之前的节点

若在循环的过程中，找到了可复用的fiber节点。

```javascript
deleteRemainingChildren(returnFiber, child.sibling); // 已找到可复用的child节点，从下一个节点开始全部删除
const existing = useFiber(child, element.props); // 复用匹配到的child节点，并使用element中新的props属性
existing.ref = coerceRef(returnFiber, child, element); // 处理ref
existing.return = returnFiber; // 复用的Fiber节点的return指针，指向当前Fiber节点
```

在已经找到可以复用的child节点后，child节点后续的节点就都可以删除了，那child之前的节点呢，在复用了这个节点，后续也会删除的。

我们再看下 useFiber() 中是如何复用child这个节点的：

```javascript
function useFiber(fiber: Fiber, pendingProps: mixed): Fiber {
  // We currently set sibling to null and index to 0 here because it is easy
  // to forget to do before returning it. E.g. for the single child case.
  // 将新的fiber节点的index设置为0，sibling设置为null，
  // 因为目前我们还不知道这个节点用来干什么，比如他可能用于单节点的case中
  const clone = createWorkInProgress(fiber, pendingProps);
  clone.index = 0;
  clone.sibling = null;
  return clone;
}

/**
 * 说是复用current节点，其实是复用current.alternate的那个节点，
 * 因为current 和 workInProgress 两个节点是通过 alternate 属性互相指向的
 * @param current
 * @param pendingProps
 * @returns {Fiber}
 */
export function createWorkInProgress(current: Fiber, pendingProps: any): Fiber {
  let workInProgress = current.alternate;
  if (workInProgress === null) {
    /**
     * 翻译：我们使用双缓冲池技术，因为我们知道我们最多只需要两个版本的树。
     * 我们可以汇集其他未使用的节点，进行自由的重用。
     * 这是惰性创建的，以避免为从不更新的对象分配额外的对象。
     * 它还允许我们在需要时回收额外的内存
     */
    
    // 若workInProgress为null，则直接创建一个新的fiber节点
    workInProgress = createFiber(
      current.tag,
      pendingProps, // 传入最新的props
      current.key,
      current.mode,
    );
    workInProgress.elementType = current.elementType;
    workInProgress.type = current.type;
    workInProgress.stateNode = current.stateNode;

    // workInProgress 和 current通过 alternate 属性互相进行指向
    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    workInProgress.pendingProps = pendingProps; // 设置新的props
    // Needed because Blocks store data on type.
    workInProgress.type = current.type;

    // We already have an alternate.
    // Reset the effect tag.
    workInProgress.flags = NoFlags;

    // The effects are no longer valid.
    workInProgress.subtreeFlags = NoFlags;
    workInProgress.deletions = null;
  }

  // Reset all effects except static ones.
  // Static effects are not specific to a render.
  workInProgress.flags = current.flags & StaticMask;
  workInProgress.childLanes = current.childLanes;
  workInProgress.lanes = current.lanes;

  workInProgress.child = current.child;
  workInProgress.memoizedProps = current.memoizedProps;
  workInProgress.memoizedState = current.memoizedState;
  workInProgress.updateQueue = current.updateQueue;

  // Clone the dependencies object. This is mutated during the render phase, so
  // it cannot be shared with the current fiber.
  const currentDependencies = current.dependencies;
  workInProgress.dependencies =
    currentDependencies === null
      ? null
      : {
        lanes: currentDependencies.lanes,
        firstContext: currentDependencies.firstContext,
      };

  // These will be overridden during the parent's reconciliation
  workInProgress.sibling = current.sibling;
  workInProgress.index = current.index;
  workInProgress.ref = current.ref;

  return workInProgress;
}
```

整个React应用中，我们维护着两棵树，其实每棵树没啥差别，FiberRootNode节点中的current指针指向到哪棵树，就展示那棵树。只不过是我们把当前正在展示的那棵树叫做current，将要构建的那个叫做workInProgress。这两棵树中互相的两个节点，通过 alternate 属性进行互相的指向。

### 4.3 普通 React 类型 element 转为 fiber

将单个普通 React 类型的 element 转为 fiber 节点，是 createFiberFromElement()，其又调用了 createFiberFromTypeAndProps()。

这里将其进行了细致的划分，如 类组件 ClassComponent，普通 html 标签 HostComponent，strictMode 等

```javascript
export function createFiberFromTypeAndProps(
  type: any, // React$ElementType，element的类型
  key: null | string,
  pendingProps: any,
  owner: null | Fiber,
  mode: TypeOfMode,
  lanes: Lanes,
): Fiber {
  let fiberTag = IndeterminateComponent; // 我们还不知道当前fiber是什么类型
  // The resolved type is set if we know what the final type will be. I.e. it's not lazy.
  // 如果我们知道最终类型type将是什么，则设置解析的类型。
  let resolvedType = type;
  if (typeof type === 'function') {
    // 当前是函数组件或类组件
    if (shouldConstruct(type)) {
      // 类组件
      fiberTag = ClassComponent;
    } else {
      // 还是不明确是什么类型的组件，啥也没干
    }
  } else if (typeof type === 'string') {
    // type是普通的html标签，如div, p, span等
    fiberTag = HostComponent;
  } else {
    // 其他类型，如fragment, strictMode等，暂时省略
  }

  // 通过上面的判断，得到fiber的类型后，则调用createFiber()函数，生成fiber节点
  const fiber = createFiber(fiberTag, pendingProps, key, mode);
  fiber.elementType = type; // fiber中的elmentType与element中的type一样，
  fiber.type = resolvedType; // 测试环境会做一些处理，正式环境与elementType属性一样，type为 REACT_LAZY_TYPE，resolveType为null
  fiber.lanes = lanes;

  return fiber;
}
```

我们在之前讲解函数 beginWork() 时，当 fiber 节点没明确类型时，判断过 fiber 节点的类型，那时候是执行 fiber 节点里的 function，根据返回值来判断的。这里就不能再执行 element 中的函数了，否则会造成多次执行。

如当用函数来实现一个类组件时：

```javascript
function App() {}
App.prototype = React.Component.prototype;

// React.Component
Component.prototype.isReactComponent = {};
```

可以看到，只要函数的 prototype 上有 isReactComponent 属性，他就肯定是类组件。但若没有这个属性，也不一定就会是函数组件，还得通过执行后的结果来判断（就是之前beginWork()里的步骤了）。

React 源码中，采用了`shouldConstruct(type)`来判断。

```javascript
/**
 * 判断用函数实现的组件是否是类组件
 * @param Component
 * @returns {boolean}
 */
function shouldConstruct(Component: Function) {
  /**
   * 类组件都是要继承 React.Component 的，而 React.Component 的 prototype 上有一个 isReactComponent 属性，值为{}
   * 文件地址在： https://github.com/wenzi0github/react/blob/1cf8fdc47b360c1f1a079209fc4d49026fafd8a4/packages/react/src/ReactBaseClasses.js#L30
   * 因此只要判断 Component.prototype 上是否有 isReactComponent 属性，即可判断出当前是类组件还是函数组件
   */
  const prototype = Component.prototype;
  return !!(prototype && prototype.isReactComponent);
}
```

我们来汇总下类型的判断：

1. 若element.type是函数，则再通过 shouldConstruct() 判断，若明确类型是类组件，则fiberTag 为 ClassComponent；若不是类组件，则还是认为他是未知组件的类型IndeterminateComponent，后续再通过执行的结果判断；
2. 若element.type是字符串，则认为是html标签的类型HostComponent；
3. 若是其他的类型，如 REACT_FRAGMENT_TYPE, REACT_SUSPENSE_TYPE等，则单独调用对应的方法创建fiber节点；

若是前两种类型的，则会调用 createFiber() 创建新的fiber节点：

```javascript
/**
 * 通过上面的判断，得到fiber的类型后，则调用createFiber()函数，生成fiber节点。
 * createFiber()内再执行 `new FiberNode()` 来初始化出一个fiber节点。
 */
const fiber = createFiber(fiberTag, pendingProps, key, mode);
fiber.elementType = type; // fiber中的elmentType与element中的type一样，
fiber.type = resolvedType; // 测试环境会做一些处理，正式环境与elementType属性一样，type为 REACT_LAZY_TYPE，resolveType为null
fiber.lanes = lanes;
```

无论是复用之前的节点，还是新创建的fiber节点，到这里，我们总归是把element结构转成了fiber节点。

## 5. 处理单个的文本节点 reconcileSingleTextNode

文本节点处理起来相对来说比较简单，它本身就是一个字符串或者数字，没有key，没有type。

```html
<p>this is text in p tag</p>
<p>1234567<span>in span</span>abcdef</p>
```

如上面的样例中，`this is text in p tag`就是单个的文本节点，但第2个p节点中，虽然`123456`, `abcdef`也是文本节点，不过这并不是单独的文本节点，而是与span标签组成了一个数组（span标签里的`in span`也是单个的文本节点）：

![React中多个元素组成的数组](https://www.xiabingbao.com/upload/607962fbbe542a341.png)

这种情况，我们会在第6节中进行说明，这里我们只处理单独的文本节点。

```javascript
// 调度文本节点
function reconcileSingleTextNode(
  returnFiber: Fiber,
  currentFirstChild: Fiber | null,
  textContent: string,
  lanes: Lanes,
): Fiber {
  // There's no need to check for keys on text nodes since we don't have a
  // way to define them.
  // 这里不再判断文本节点的key，因为文本节点就来没有key，也没有兄弟节点
  if (currentFirstChild !== null && currentFirstChild.tag === HostText) {
    // We already have an existing node so let's just update it and delete
    // the rest.
    // 若当前第1个子节点就是文本节点，则直接删除后续的兄弟节点
    deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
    const existing = useFiber(currentFirstChild, textContent); // 复用这个文本的fiber节点，重新赋值新的文本
    existing.return = returnFiber;
    return existing;
  }
  // The existing first child is not a text node so we need to create one
  // and delete the existing ones.
  // 若不存在子节点，或者第1个子节点不是文本节点，直接将当前所有的节点都删除，然后创建出新的文本fiber节点
  deleteRemainingChildren(returnFiber, currentFirstChild);
  const created = createFiberFromText(textContent, returnFiber.mode, lanes);
  created.return = returnFiber;
  return created;
}
```

这里我们要理解文本fiber节点的两个特性：

1. 文本节点没有key，无法通过key来进行对比；
2. 文本节点只有一个节点，没有兄弟节点；若新节点在只有一个文本的前提下，之前的树中有多个fiber节点，需要全部删除；

## 6. 处理并列多个元素 reconcileChildrenArray

当前将要构建的element是一个数组，即并列多个节点要进行处理。比如要考虑的情况：

1. 新列表和旧列表都是顺序排布的，但新列表更长，这里在新旧对比完成后，还得接着新建新增的节点；
2. 新列表和旧列表都是顺序排布的，但新列表更短，这里在新旧对比完成后，还得删除旧列表中多余的节点；
3. 新列表中节点的顺序发生了变化，那么就不能按照顺序一一对比了；



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
  // 若没有匹配到任何类型，说明当前newChild无法转为fiber节点，
  // 相应的，也应当把current中所有的fiber节点删除
  return deleteRemainingChildren(returnFiber, currentFirstChild);
}
```

我们先来看下源码 reconcileChildFibers() 中都判断了 newChild 的哪些类型：

1. 是否是顶层的 fragment 元素，如在执行 render()时，用的是 fragment 标签（<></> 或 <React.Fragment></React.Fragment>）包裹，则表示该元素顶级的 fragment 组件，这里直接使用其 children；
2. 合法的 ReactElement，如通过 createElement、creatPortal 等创建创建的元素，只是\$\$typeof 不一样；这里也把 lazy type 归类到了这里；
3. 普通数组，每一项都是合法的其他元素；
4. Iterator，跟数组类似，只是遍历方式不同；
5. string 或 number 类型：如(<div>abc</div>)里的 abc 即为字符串类型的文本；

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

这里我们说的复用节点，指的是复用`current.alternate`的那个节点，因为在没有任何更新时，两棵 fiber 树是一一对应的。在产生更新后，可能就会存在对应不上的情况，因此才有了下面的各种 diff 对比环节。

### 4.1 对比判断是否有可复用的节点

在对比过程中，采用了循环的方式，这是因为同一层的 fiber 节点是横向串联起来的。而且，虽然新节点是单个节点，但却无法保证之前的节点也是单个节点，因此这里用循环的方式查找第一个 key 和节点类型都一样的节点，进行复用。

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

这里可能会有人有疑问，deleteRemainingChildren() 只删除后续的节点，那前面的节点怎么办呢？前面的节点已经在 while 循环中的 else 逻辑里，把匹配不上的节点标记为删除了。

从这里也能看到，我们在 React 组件的状态变更时，尽量不要修改元素的标签类型，否则当前元素对应的 fiber 节点及所有的子节点都会被丢弃，然后重新创建。如

```javascript
// 原来的
function App() {
  return (
    <div>
      <Count />
      <p></p>
    </div>
  );
}

// 经useState()修改后的
function App() {
  return (
    <secion>
      <Count />
      <p></p>
    </secion>
  );
}
```

虽然只是外层的 div 标签变成了 section 标签，内部的都没有变化，但 React 在进行对比时，还是认为没有匹配上，然后把 div 对应的 fiber 节点及所有的子节点都删除了，重新从 section 标签开始构建新的 fiber 节点。

### 4.2 复用之前的节点

若在循环的过程中，找到了可复用的 fiber 节点。

```javascript
deleteRemainingChildren(returnFiber, child.sibling); // 已找到可复用的child节点，从下一个节点开始全部删除
const existing = useFiber(child, element.props); // 复用匹配到的child节点，并使用element中新的props属性
existing.ref = coerceRef(returnFiber, child, element); // 处理ref
existing.return = returnFiber; // 复用的Fiber节点的return指针，指向当前Fiber节点
```

在已经找到可以复用的 child 节点后，child 节点后续的节点就都可以删除了，那 child 之前的节点呢，在复用了这个节点，后续也会删除的。

我们再看下 useFiber() 中是如何复用 child 这个节点的：

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

整个 React 应用中，我们维护着两棵树，其实每棵树没啥差别，FiberRootNode 节点中的 current 指针指向到哪棵树，就展示那棵树。只不过是我们把当前正在展示的那棵树叫做 current，将要构建的那个叫做 workInProgress。这两棵树中互相的两个节点，通过 alternate 属性进行互相的指向。

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

可以看到，只要函数的 prototype 上有 isReactComponent 属性，他就肯定是类组件。但若没有这个属性，也不一定就会是函数组件，还得通过执行后的结果来判断（就是之前 beginWork()里的步骤了）。

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

1. 若 element.type 是函数，则再通过 shouldConstruct() 判断，若明确类型是类组件，则 fiberTag 为 ClassComponent；若不是类组件，则还是认为他是未知组件的类型 IndeterminateComponent，后续再通过执行的结果判断；
2. 若 element.type 是字符串，则认为是 html 标签的类型 HostComponent；
3. 若是其他的类型，如 REACT_FRAGMENT_TYPE, REACT_SUSPENSE_TYPE 等，则单独调用对应的方法创建 fiber 节点；

若是前两种类型的，则会调用 createFiber() 创建新的 fiber 节点：

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

无论是复用之前的节点，还是新创建的 fiber 节点，到这里，我们总归是把 element 结构转成了 fiber 节点。

## 5. 处理单个的文本节点 reconcileSingleTextNode

文本节点处理起来相对来说比较简单，它本身就是一个字符串或者数字，没有 key，没有 type。

```html
<p>this is text in p tag</p>
<p>1234567<span>in span</span>abcdef</p>
```

如上面的样例中，`this is text in p tag`就是单个的文本节点，但第 2 个 p 节点中，虽然`123456`, `abcdef`也是文本节点，不过这并不是单独的文本节点，而是与 span 标签组成了一个数组（span 标签里的`in span`也是单个的文本节点）：

![React中多个元素组成的数组](https://www.xiabingbao.com/upload/607962fbbe542a341.png)

这种情况，我们会在第 6 节中进行说明，这里我们只处理单独的文本节点。

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

这里我们要理解文本 fiber 节点的两个特性：

1. 文本节点没有 key，无法通过 key 来进行对比；
2. 文本节点只有一个节点，没有兄弟节点；若新节点在只有一个文本的前提下，之前的树中有多个 fiber 节点，需要全部删除；

## 6. 处理并列多个元素 reconcileChildrenArray

当前将要构建的 element 是一个数组，即并列多个节点要进行处理。比如要考虑的情况：

1. 新列表和旧列表都是顺序排布的，但新列表更长，这里在新旧对比完成后，还得接着新建新增的节点；
2. 新列表和旧列表都是顺序排布的，但新列表更短，这里在新旧对比完成后，还得删除旧列表中多余的节点；
3. 新列表中节点的顺序发生了变化，那么就不能按照顺序一一对比了；

在 fiber 结构中，并行的元素会形成单向链表，而且也没有尾指针。在 fiber 链表和 element 数组进行对比时，只能从头节点开始比较：

1. 同一个位置（索引相同），保持不变或复用的可能性比较大；
2. newChildren 遍历完了，说明 oldFiber 链表的节点有剩余，需要删除；
3. oldFiber 所在链表遍历完了，新数组 newChildren 可能还有剩余，直接创建新节点；
4. 无法顺序一一比较，可能顺序比较乱，将旧 fiber 节点存入到 map 中；

这里面还存在一种特殊的情况，`oldFiber.index > newIdx`，旧 fiber 节点的索引比当前索引 newIdx 大，说明之前的 element 有存在无法转为 fiber 的元素，而 newIdx 则是从 0 自增的，那空缺位置后面的那个旧 fiber 节点的索引就会大于 newIdx。当出现这种情况时，我们直接把 oldFiber 节点设置为 null，然后在执行 updateSlot() 时创建出新的 fiber 节点。等待 newIdx 与 oldFiber.index 相等时，再进行相同位置的比较。[React diff 对比中，reconcileChildrenArray 中什么时候会出现 oldFiber.index > newIdx？](https://github.com/wenzi0github/react/issues/15)

reconcileChildrenArray 的流程图，也可以直接[查看在线链接](https://docs.qq.com/flowchart/DS3l0QUlQZ2ZqbHpq)：

![reconcileChildrenArray 的流程图](https://www.xiabingbao.com/upload/804962fde825c976c.png)

接下来我们分步骤讲解一下。

### 6.1 相同索引位置对比

同一个位置（索引相同），保持不变或复用的可能性比较大。不过也只能说可能性比较大，在实际开发中什么情况都会存在，我们先以最简单的方式来处理。

```javascript
let resultingFirstChild: Fiber | null = null; // 新构建出来的fiber链表的头节点
let previousNewFiber: Fiber | null = null; // 新构建出来链表的最后那个fiber节点，用于构建整个链表

let oldFiber = currentFirstChild; // 旧链表的节点，刚开始指向到第1个节点
let lastPlacedIndex = 0; // 表示当前已经新建的 Fiber 的 index 的最大值，用于判断是插入操作，还是移动操作等
let newIdx = 0; // 表示遍历 newChildren 的索引指针
let nextOldFiber = null; // 下次循环要处理的fiber节点

for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
  if (oldFiber.index > newIdx) {
    /**
     * oldIndex 大于 newIndex，那么需要旧的 fiber 等待新的 fiber，一直等到位置相同。
     * 那当前的 newChildren[newIdx] 则直接创建新的fiber节点
     * 什么时候会出现这种情况？ https://github.com/wenzi0github/react/issues/15
     * 当 oldFiber.index > newIdx 时，说明旧element对应的newIdx的位置的fiber为null，这时将oldFiber设置为null，
     * 然后调用 updateSlot() 时，就不再考虑复用的问题了，直接创建新的节点。
     * 下一个旧的fiber还是当前的节点，等待index索引相等的那个child
     */
    nextOldFiber = oldFiber;
    oldFiber = null;
  } else {
    // 旧fiber的索引和newChildren的索引匹配上了，获取oldFiber的下一个兄弟节点
    nextOldFiber = oldFiber.sibling;
  }

  /**
   * 将当前节点和当前的child的element传进去，
   * 1. 若 key 对应上
   * 1.1 若 type 对应上，则复用之前的节点；
   * 1.2 若 type 对应不上，则直接创建新的fiber节点；
   * 2. 若 key 对应不上，无法复用，返回 null；
   * 3. 若 oldFiber 为null，则直接创建新的fiber节点；
   * @type {Fiber}
   * updateSlot() 具体如何实现，我们稍后讲解
   */
  const newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], lanes);
  if (newFiber === null) {
    /**
     * 新fiber节点为null，退出循环。
     * 不过这里为null的原因有很多，比如：
     * 1. newChildren[newIdx] 本身就是无法转为fiber的类型，如null, boolean, undefined等；
     * 2. oldFiber 和 newChildren[newIdx] 的key没有匹配上；
     */
    if (oldFiber === null) {
      oldFiber = nextOldFiber;
    }
    break;
  }
  if (shouldTrackSideEffects) {
    if (oldFiber && newFiber.alternate === null) {
      // We matched the slot, but we didn't reuse the existing fiber, so we
      // need to delete the existing child.
      // 若旧fiber节点存在，但新节点并没有复用该节点，则将该旧节点删除
      deleteChild(returnFiber, oldFiber);
    }
  }

  /**
   * 此方法是一种顺序优化手段，lastPlacedIndex 一直在更新，初始为 0，
   * 表示访问过的节点在旧集合中最右的位置（即最大的位置）。
   */
  lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);

  /**
   * resultingFirstChild：新fiber链表的头节点
   * previousNewFiber：用于拼接整个链表
   */
  if (previousNewFiber === null) {
    // 若整个链表为空，则头指针指向到newFiber
    resultingFirstChild = newFiber;
  } else {
    // 若链表不为空，则将newFiber放到链表的后面
    previousNewFiber.sibling = newFiber;
  }
  previousNewFiber = newFiber; // 指向到当前节点，方便下次拼接
  oldFiber = nextOldFiber; // 下一个旧fiber节点
}
```

我们在循环中，尽量地去通过索引 index 和 key 等标识，来复用旧 fiber 节点。无法复用的，就创建出新的 fiber 节点。

同时，结束循环或者跳出循环的条件有多种，在循环之后，还要做出一些额外的判断。

### 6.2 新节点遍历完毕

若经过上面的循环后，新节点已全部创建完毕，这说明可能经过了删除操作，新节点的数量更少，这里我们直接把剩下的旧节点删除了就行。

```javascript
// 新索引 newIdx 跟newChildren的长度一样，说明新数组已遍历完毕
// 老数组后面可能有剩余的，需要删除
if (newIdx === newChildren.length) {
  // 删除旧链表中剩余的节点
  deleteRemainingChildren(returnFiber, oldFiber);

  // 返回新链表的头节点指针
  return resultingFirstChild;
}
```

后续已不需要其他的操作了，直接返回新链表的头节点指针即可。

### 6.3 旧 fiber 节点遍历完毕

若经过上面的循环后，旧 fiber 节点已遍历完毕，但 newChildren 中可能还有剩余的元素没有转为 fiber 节点，但现在旧 fiber 节点已全部都复用完了，这里直接创建新的 fiber 节点即可。

```javascript
// 若旧数据中所有的节点都复用了，说明新数组可能还有剩余
if (oldFiber === null) {
  // 这里已经没有旧的fiber节点可以复用了，然后我们就选择直接创建的方式
  for (; newIdx < newChildren.length; newIdx++) {
    const newFiber = createChild(returnFiber, newChildren[newIdx], lanes);
    if (newFiber === null) {
      continue;
    }
    lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);

    // 接着上面的链表往后拼接
    if (previousNewFiber === null) {
      // 记录起始的第1个节点
      resultingFirstChild = newFiber;
    } else {
      previousNewFiber.sibling = newFiber;
    }
    previousNewFiber = newFiber;
  }

  // 返回新链表的头节点指针
  return resultingFirstChild;
}
```

到这里，目前简单的对数组进行增、删节点的对比还是比较简单，接下来就是移动的情况是如何进行复用的呢？

### 6.4 节点位置发生了移动

若节点的位置发生了变动，虽然在旧节点链表中也存在这个节点，但若按顺序对比时，确实不方便找到这个节点。因此可以把这些旧节点放到 Map 中，然后根据 key 或者 index 获取。

```javascript
/**
 * 将 currentFirstChild 和后续所有的兄弟节点放到map中，方便查找
 * 若该 fiber 节点有 key，则使用该key作为map的key；否则使用隐性的index作为map的key
 * @param {Fiber} returnFiber 要存储的节点的父级节点，但这个参数没用到
 * @param {Fiber} currentFirstChild 要存储的链表的头节点指针
 * @returns {Map<string|number, Fiber>} 返回存储所有节点的map对象
 */
function mapRemainingChildren(returnFiber: Fiber, currentFirstChild: Fiber): Map<string | number, Fiber> {
  /**
   * 将剩余所有的子节点都存放到 map 中，方便可以通过 key 快速查找该fiber节点
   * 若该 fiber 节点有 key，则使用该key作为map的key；否则使用隐性的index作为map的key
   */
  const existingChildren: Map<string | number, Fiber> = new Map();

  let existingChild = currentFirstChild;
  while (existingChild !== null) {
    if (existingChild.key !== null) {
      existingChildren.set(existingChild.key, existingChild);
    } else {
      existingChildren.set(existingChild.index, existingChild);
    }
    existingChild = existingChild.sibling;
  }
  return existingChildren;
}
```

把所有的旧 fiber 节点存储到 Map 中后，就接着循环新数组 newChildren，然后从 map 中获取到对应的旧 fiber 节点（也可能不存在），再创建出新的节点。

```javascript
for (; newIdx < newChildren.length; newIdx++) {
  // 复用map中存储的旧fiber节点（如果可以复用的话）
  const newFiber = updateFromMap(existingChildren, returnFiber, newIdx, newChildren[newIdx], lanes);
  if (newFiber !== null) {
    // 这里只处理 newFiber 不为null的情况
    if (shouldTrackSideEffects) {
      // 若需要记录副作用
      if (newFiber.alternate !== null) {
        /**
         * newFiber.alternate指向到current，若current不为空，说明复用了该fiber节点，
         * 这里我们要在map中删除，因为后面会把map中剩余未复用的节点删除掉的，
         * 所以这里我们要及时把已复用的节点从map中剔除掉
         */
        existingChildren.delete(newFiber.key === null ? newIdx : newFiber.key);
      }
    }
    lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
    // 接着之前的链表进行拼接
    if (previousNewFiber === null) {
      resultingFirstChild = newFiber;
    } else {
      previousNewFiber.sibling = newFiber;
    }
    previousNewFiber = newFiber;
  }
}

if (shouldTrackSideEffects) {
  // 将map中没有复用的fiber节点添加到删除的副作用队列中，等待删除
  existingChildren.forEach(child => deleteChild(returnFiber, child));
}

// 返回新链表的头节点指针
return resultingFirstChild;
```

到这里，我们新数组 newChildren 中所有的 element 结构，都已转为 fiber 节点，不过有的可能会转为 null。

我们再重新回到 reconcileChildFibers() 中，

## 7. 几个关于 fiber 的工具函数

我们在上面探讨前后 diff 对比时，涉及到了多个对 fiber 处理的工具函数，但都跳过去了，这里我们挑几个稍微讲解下。

我们在 diff 阶段涉及到所有对 fiber 的增删等操作，都只是打上标记而已，并不是立刻进行处理的，是要等到 commit 阶段才会处理。

### 7.1 删除单个节点 deleteChild

删除单一某个 fiber 节点，这里会将该节点，存储到其父级 fiber 节点的 deletions 中。

```javascript
/**
 * 将returnFiber子元素中，需要删除的fiber节点放到deletions的副作用数组中
 * 该方法只删除一个节点
 * 当前diff时不会立即删除，而是在更新时，将该数组中的fiber节点进行删除
 * @param returnFiber
 * @param childToDelete
 */
function deleteChild(returnFiber: Fiber, childToDelete: Fiber): void {
  if (!shouldTrackSideEffects) {
    // 不需要收集副作用时，直接返回，不进行任何操作
    return;
  }
  const deletions = returnFiber.deletions;
  if (deletions === null) {
    // 若副作用数组为空，则创建一个
    returnFiber.deletions = [childToDelete];
    returnFiber.flags |= ChildDeletion;
  } else {
    // 否则直接推入
    deletions.push(childToDelete);
  }
}
```

### 7.2 批量删除多个节点 deleteRemainingChildren

跟上面的 deleteChild 很像，但这个函数会把从某个节点开始到结尾所有的 fiber 节点标记为删除状态。

```javascript
/**
 * 删除returnFiber的子元素中，currentFirstChild和其兄弟元素
 * 即把currentFirstChild及其兄弟元素，都放到returnFiber的deletions的副作用数组中，等待删除
 * 这是一个批量删除节点的方法
 * @param returnFiber 要删除节点的父级节点
 * @param currentFirstChild 当前要删除节点的起始节点
 * @returns {null}
 */
function deleteRemainingChildren(returnFiber: Fiber, currentFirstChild: Fiber | null): null {
  if (!shouldTrackSideEffects) {
    // 不需要收集副作用时，直接返回，不进行任何操作
    return null;
  }

  /**
   * 从 currentFirstChild 节点开始，把当前及后续所有的节点，通过 deleteChild() 方法标记为删除状态
   * @type {Fiber}
   */
  let childToDelete = currentFirstChild;
  while (childToDelete !== null) {
    deleteChild(returnFiber, childToDelete);
    childToDelete = childToDelete.sibling;
  }
  return null;
}
```

### 7.3 复用 fiber 节点 useFiber

在没有任何更新时，React 中的两棵 fiber 树是一一对应的。不过当产生更新后，前后两棵 fiber 树就不一样了。

若当前要根据 element 生成一个 fiber 节点，目前有 2 种情况：

1. current 节点不存在或 current.alternate 不存在，说明该 element 是新增的，直接新建即可；
2. current.alternate 存在，则可以直接复用；

在 useFiber() 中，会调用 createWorkInProgress() 来尝试复用 workInProgress 节点，生成新的 fiber 节点：

```javascript
export function createWorkInProgress(current: Fiber, pendingProps: any): Fiber {
  let workInProgress = current.alternate;
  if (workInProgress === null) {
    // We use a double buffering pooling technique because we know that we'll
    // only ever need at most two versions of a tree. We pool the "other" unused
    // node that we're free to reuse. This is lazily created to avoid allocating
    // extra objects for things that are never updated. It also allow us to
    // reclaim the extra memory if needed.
    /**
     * 翻译：我们使用双缓冲池技术，因为我们知道我们最多只需要两个版本的树。
     * 我们可以汇集其他未使用的节点，进行自由的重用。
     * 这是惰性创建的，以避免为从不更新的对象分配额外的对象。
     * 它还允许我们在需要时回收额外的内存
     */
    workInProgress = createFiber(current.tag, pendingProps, current.key, current.mode);
    workInProgress.elementType = current.elementType;
    workInProgress.type = current.type;
    workInProgress.stateNode = current.stateNode;

    /**
     * workInProgress是新创建出来的，要和current建立联系
     * workInProgress 和 current通过 alternate 属性互相进行指向
     */
    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    workInProgress.pendingProps = pendingProps;
    // Needed because Blocks store data on type.
    workInProgress.type = current.type;

    // We already have an alternate.
    // Reset the effect tag.
    workInProgress.flags = NoFlags;

    // The effects are no longer valid.
    workInProgress.subtreeFlags = NoFlags;
    workInProgress.deletions = null;
  }

  /**
   * 以下语句，复用current中的特性
   */
  // Reset all effects except static ones.
  // Static effects are not specific to a render.
  workInProgress.flags = current.flags & StaticMask;
  workInProgress.childLanes = current.childLanes;
  workInProgress.lanes = current.lanes;

  workInProgress.child = current.child;
  workInProgress.memoizedProps = current.memoizedProps;
  workInProgress.memoizedState = current.memoizedState;
  workInProgress.updateQueue = current.updateQueue;

  // These will be overridden during the parent's reconciliation
  workInProgress.sibling = current.sibling;
  workInProgress.index = current.index;
  workInProgress.ref = current.ref;

  return workInProgress;
}
```

在 createWorkInProgress() 中，若 workInProgress(current.alternate) 不存在，则新创建一个，然后与 current 建立关联；若 workInProgress 已存在，则直接复用该节点，并将 current 中的特性给到这个 workInProgress 节点。

不过在 reconcileChildFibers() 中的 useFiber() 里，复用节点时，暂时还不知道它将来的使用情况，有可能只是做为单个 fiber 节点使用，因此把 index 和 sibling 进行了重置。

```javascript
/**
 * 复用fiber节点的alternate，生成一个新的fiber节点
 * 若alternate为空，则创建；
 * 若不为空，则直接复用，并将传入的fiber属性和pendingProps的属性给到alternate上
 * @param fiber
 * @param pendingProps
 * @returns {Fiber}
 */
function useFiber(fiber: Fiber, pendingProps: mixed): Fiber {
  const clone = createWorkInProgress(fiber, pendingProps);

  // 重置以下两个属性
  clone.index = 0;
  clone.sibling = null;
  return clone;
}
```

无论我们是复用，还是新创建的 fiber 节点，目前并不知道它将来怎么使用，所

### 7.4 updateSlot

updateSlot()和 createChild()两个方法很像，但两者最大的区别就在于：是否要复用 oldFiber 节点。

- updateSlot() 会尽量复用 oldFiber 节点，若 oldFiber 的 key 和 element 的 key 对应不上，则直接返回 null，否则复用创建；
- createChild() 则不考虑复用的问题，直接用 element 新建出新的 fiber 节点；

里面要稍微注意的一点：若当前单个结构是一个数组类型，则会先创建一个 fragment 类型的 fiber 节点，然后再递归创建内部的结构。如：

```jsx
function App() {
  const list = ['Jack', 'Tom', 'Jerry'];

  return (
    <div className="App">
      <ul>
        {list.map(username => (
          <li key={username}>{username}</li>
        ))}
        <li>Emma</li>
        <li>Mia</li>
      </ul>
    </div>
  );
}
```

代码中，数组 list.map()后得到的是一个数组结构，在 React 内构建 fiber 节点时，并不会把数组中的这几个 li 标签，和下面的 2 个 li 标签合到一起。实际会变成这样：

```jsx
function App() {
  const list = ['Jack', 'Tom', 'Jerry'];

  return (
    <div className="App">
      <ul>
        <React.Fragment>
          <li key="Jack">Jack</li>
          <li key="Tom">Tom</li>
          <li key="Jerry">Jerry</li>
        </React.Fragment>
        <li>Emma</li>
        <li>Mia</li>
      </ul>
    </div>
  );
}
```

具体的实现：

```javascript
/**
 * 创建或更新element结构 newChild 为fiber节点
 * 若oldFiber不为空，且newChild与oldFiber的key能对得上，则复用旧fiber节点
 * 否则，创建一个新的fiber节点
 * 该updateSlot方法与createChild方法很像，但createChild只有创建新fiber节点的功能
 * 而该updateSlot()方法则可以根据oldFiber，来决定是复用之前的fiber节点，还是新创建节点
 * @param returnFiber
 * @param oldFiber
 * @param newChild
 * @param lanes
 * @returns {Fiber|null}
 */
function updateSlot(returnFiber: Fiber, oldFiber: Fiber | null, newChild: any, lanes: Lanes): Fiber | null {
  // 若key相等，则更新fiber节点；否则直接返回null

  const key = oldFiber !== null ? oldFiber.key : null;

  if ((typeof newChild === 'string' && newChild !== '') || typeof newChild === 'number') {
    // 文本节点本身是没有key的，若旧fiber节点有key，则说明无法复用
    if (key !== null) {
      return null;
    }
    // 若旧fiber没有key，即使他不是文本节点，我们也尝试复用
    return updateTextNode(returnFiber, oldFiber, '' + newChild, lanes);
  }

  if (typeof newChild === 'object' && newChild !== null) {
    // 若是一些ReactElement类型的，则判断key是否相等；相等则复用；不相等则返回null
    switch (newChild.$$typeof) {
      case REACT_ELEMENT_TYPE: {
        if (newChild.key === key) {
          // key一样才更新
          return updateElement(returnFiber, oldFiber, newChild, lanes);
        } else {
          // key不一样，则直接返回null
          return null;
        }
      }
      // 其他类型暂时省略
    }

    if (isArray(newChild) || getIteratorFn(newChild)) {
      // 当前是数组或其他迭代类型，本身是没有key的，若oldFiber有key，则无法复用
      if (key !== null) {
        return null;
      }

      // 若 newChild 是数组或者迭代类型，则更新为fragment类型
      return updateFragment(returnFiber, oldFiber, newChild, lanes, null);
    }
  }

  // 其他类型不进行处理，直接返回null
  return null;
}
```

updateSlot() 着重在复用上，只有前后两个 key 匹配上，才会继续后续的流程，否则直接返回 null。

## 8. 总结

我们主要了解了不同类型的 element 转成 fiber 节点的过程，如文本类型的，React 普通类型的 ，数组类型的，等等。尤其是在数组对比时，涉及到每个元素的新增、删除、移动等操作，对比起来要复杂一些。

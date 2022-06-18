# useState的执行流程

> 本文是边学习变记录的，有很多不妥和错误之处，请谨慎阅读。

所有的hook都会分成mount和update两个阶段，useState也不例外。hook文件在[ReactFiberHooks.old.js](https://github.com/wenzi0github/react/blob/e82bc5ac1f393c05eda5c4c1f7167c3c37bf072e/packages/react-reconciler/src/ReactFiberHooks.old.js) ,这里我们只讲解useState。

[useState的流程图](https://docs.qq.com/flowchart/DS2F0dGFIVU1ieWda?u=7314a95fb28d4269b44c0026faa673b7)

我们在使用useState时，通常会得到两个值，一个是用于在jsx渲染使用，一个是set方法，用于修改该值。

```jsx
function App() {
  const [count, setCount] = useState(1);
  
  const handleClick = () => {
    setCount(count + 1);
    // setCount(count => count + 1);
  };
  
  return (<div onClick={handleClick}>
    count: {count}
  </div>);
}
```

useState初始化时和调用setCount时，都可以传入两个格式，一种格式是初始值，另一种格式是函数。通过源码中对useState的定义我们就能看得出来：

```javascript
function useState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {}
```

```mermaid
graph TD;
  A-->B;
  A-->C;
  B-->D;
  C-->D;
```

## mount 阶段

入口函数为[mountState](https://github.com/wenzi0github/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.old.js#L1555) 。初始化阶段相对来说比较简单，不过这里确实还有几个问题没弄明白。

```javascript
/**
 * useState分为mountState和updateState，根据是否是初次执行，分别进行调用
 * https://docs.qq.com/flowchart/DS2F0dGFIVU1ieWda?u=7314a95fb28d4269b44c0026faa673b7
 * 这次初始化时调用
 * @param initialState
 * @returns {[*, Dispatch<BasicStateAction<S>>]}
 */
function mountState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  /**
   * 调用`useState()`初始化hook时，内部会通过`mountWorkInProgressHook()`方法创
   * 建一个hook节点，并挂载到currentlyRenderingFiber的memoizedState链表上；
   * 若调用多次，则继续在该链表的后面进行追加；
   */
  const hook = mountWorkInProgressHook();
  
  // 若传入的是一个方法，则执行它
  if (typeof initialState === 'function') {
    // $FlowFixMe: Flow doesn't like mixed types
    initialState = initialState();
  }
  // 依托于 js 中的对象引用的特性：在不同的地方操作相同的对象，所有使用该对象的数据都会发生变化
  // 链表中该hook节点的属性值也会同步修改为initialState值
  hook.memoizedState = hook.baseState = initialState;

  // 为该hook创建一个更新链表
  const queue: UpdateQueue<S, BasicStateAction<S>> = {
    pending: null,
    interleaved: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: basicStateReducer, // 上次render后使用的reducer
    lastRenderedState: (initialState: any), // 上次render后的state，这里初始化时，即为传入时的值
  };

  /**
   * 将更新链表放到queue属性中，所有的更新行为都在这个queue链表上，
   * 而执行setState的操作，都在queue.pending中
   */
  hook.queue = queue;

  /**
   * 通过bind()方法，从dispatchSetState这里派生出一个执行方法，即后续要调用的setState()
   * 执行dispatch()（即setState()）时，并不会直接修改数据，而是将dispatch的参数放到链表中，统一调度进行更新
   */
  const dispatch: Dispatch<
    BasicStateAction<S>,
  > = (queue.dispatch = (dispatchSetState.bind(
    null,
    currentlyRenderingFiber, // 当前的fiber节点
    queue, // 当前hook的更新链表
  ): any));
  return [hook.memoizedState, dispatch];
}
```

接下来我们们dispatchSetState()方法里都干了啥。

我们在创建dispatch时，传入了两个参数：

* currentlyRenderingFiber: 当前fiber所有的hook链表；
* queue: 该hook的初始更新；

```javascript
/**
 * 派生一个setState方法
 * 同一个setState方法多次调用时，均会放到queue.pending的链表中
 * @param {Fiber} fiber 当前的fiber节点
 * @param {UpdateQueue<S, A>} queue
 * @param {A} action 即执行setState()传入的数据，可能是数据，也能是方法，setState(1) 或 setState(prevState => prevState+1);
 */
function dispatchSetState<S, A>(
  fiber: Fiber,
  queue: UpdateQueue<S, A>,
  action: A,
) {
  const lane = requestUpdateLane(fiber);

  const update: Update<S, A> = {
    lane,
    action,
    hasEagerState: false,
    eagerState: null,
    next: (null: any),
  };

  if (isRenderPhaseUpdate(fiber)) {
    enqueueRenderPhaseUpdate(queue, update);
  } else {
    /**
     * 将update形成单向环形链表，并放到queue.pending里
     * 即hook.queue.pending里，存放着update的数据
     * queue.pending指向到update链表的最后一个元素，next即是第1个元素
     * 示意图： https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/31b3aa9d0f5d4284af1db2c73ea37b9a~tplv-k3u1fbpfcp-zoom-in-crop-mark:1304:0:0:0.awebp
     */
    enqueueUpdate(fiber, queue, update, lane);

    const alternate = fiber.alternate;
    if (
      fiber.lanes === NoLanes &&
      (alternate === null || alternate.lanes === NoLanes)
    ) {
      // The queue is currently empty, which means we can eagerly compute the
      // next state before entering the render phase. If the new state is the
      // same as the current state, we may be able to bail out entirely.
      /**
       * 当前队列为空，说明我们迫切地想在进入渲染之前得到state的值；
       * 若新的state与现在的state一样，我们可能可以直接退出
       * @type {null}
       */
      const lastRenderedReducer = queue.lastRenderedReducer; // 上次render后的reducer，在mount时即basicStateReducer
      if (lastRenderedReducer !== null) {
        let prevDispatcher;

        try {
          const currentState: S = (queue.lastRenderedState: any); // 上次render后的state，mount时为传入的initialState
          const eagerState = lastRenderedReducer(currentState, action);
          // Stash the eagerly computed state, and the reducer used to compute
          // it, on the update object. If the reducer hasn't changed by the
          // time we enter the render phase, then the eager state can be used
          // without calling the reducer again.
          update.hasEagerState = true;
          update.eagerState = eagerState;
          if (is(eagerState, currentState)) {
            // Fast path. We can bail out without scheduling React to re-render.
            // It's still possible that we'll need to rebase this update later,
            // if the component re-renders for a different reason and by that
            // time the reducer has changed.
            // 若这次得到的state与上次的一样，则不再重新渲染
            // 不过因为一些其他原因？
            return;
          }
        } catch (error) {
          // Suppress the error. It will throw again in the render phase.
        } finally {

        }
      }
    }
    // 新state与现在的state不一样，开启新的调度
    // todo: scheduleUpdateOnFiber 是干嘛的？
    const eventTime = requestEventTime();
    const root = scheduleUpdateOnFiber(fiber, lane, eventTime);
    if (root !== null) {
      entangleTransitionUpdate(root, queue, lane);
    }
  }
}
```

通过`dispatchSetState.bind(null, currentlyRenderingFiber, queue)` 产生的dispatch（即setState），每次调用时会产生一个新的update，并将其放置到queue.pending的链表中。

而更新队列为空时，说明是初始化阶段，我们在得到初始属性后，马上告诉 scheduleUpdateOnFiber() 更新该fiber节点。

最终mountState()的作用是：创建一个hook，将该hook与当前的fiber节点进行绑定！方便调用时知道更新的是哪个fiber节点。

## update 阶段

update阶段是 updateState() 完成的，不过最终还是调用的updateReducer：

```javascript
/**
 * useState()的更新阶段
 * 传入要更新的值initialState，并返回新的[state, setState]
 * @param initialState
 * @returns {[(*|S), Dispatch<S>]}
 */
function updateState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  return updateReducer(basicStateReducer, (initialState: any));
}
```

我们来看看 [updateReducer()](https://github.com/wenzi0github/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.old.js#L761) 里面干了什么，这里可以直接看源码，我在源码中做了注解。

这里面主要做了这几件事儿：

1. 若上次有低优先级的更新遗留下来，并且当前有需要的更新，则将这两种更新合并到同一个链表中；
2. 循环执行这些更新，若有更新优先级比较低，则将当前的state和action存储起来；若优先级足够，则执行该更新；
3. 若新newState与之前的不一样，则调度更新；同时将新的链表, newState存储起来；
4. 返回最新的state和dispatch；

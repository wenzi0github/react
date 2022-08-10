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

```javascript
/**
 * 操作updateQueue的队列
 * @param workInProgress
 * @param props
 * @param instance
 * @param renderLanes
 */
export function processUpdateQueue<State>(
  workInProgress: Fiber,
  props: any,
  instance: any,
  renderLanes: Lanes,
): void {
  // This is always non-null on a ClassComponent or HostRoot
  // 在 HostRoot和 ClassComponent的fiber节点中，updateQueue不可能为null
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  hasForceUpdate = false;

  /**
   * queue.shared.pending本身是一个环形链表，即使有一个节点，也会形成环形链表，
   * 而且 queue.shared.pending 指向的是环形链表的最后一个节点，这里将其断开形成单向链表
   * 单向链表的头指针存放到 firstBaseUpdate 中，最后一个节点则存放到 lastBaseUpdate 中
   */
  let firstBaseUpdate = queue.firstBaseUpdate; // 更新链表的开始节点
  let lastBaseUpdate = queue.lastBaseUpdate; // 更新链表的最后的那个节点

  // Check if there are pending updates. If so, transfer them to the base queue.
  // 检测是否存在将要进行的更新，若存在，则将其转义到 firstBaseUpdate 上，并清空刚才的链表
  let pendingQueue = queue.shared.pending;
  if (pendingQueue !== null) {
    queue.shared.pending = null;

    // The pending queue is circular. Disconnect the pointer between first
    // and last so that it's non-circular.
    /**
     * 若pending queue 是一个环形链表，则将第一个和最后一个节点断开，
     * 环形链表默认指向的是最后一个节点，因此 pendingQueue 指向的就是最后一个节点，
     * pendingQueue.next(lastPendingUpdate.next)就是第一个节点了
     */
    const lastPendingUpdate = pendingQueue; // 环形链表的最后一个节点
    const firstPendingUpdate = lastPendingUpdate.next; // 环形链表的第一个节点
    lastPendingUpdate.next = null; // 最后一个节点与第一个节点断开

    /**
     * 将 pendingQueue 拼接到 更新链表 queue.firstBaseUpdate 的后面
     * 1. 更新链表的最后那个节点为空，说明当前更新链表为空，将，要更新的首节点 firstPendingUpdate 给到 firstBaseUpdate即可；
     * 2. 若更新链表的尾节点不为空，则将要更新的首节点 firstPendingUpdate 拼接到 lastBaseUpdate 的后面；
     * 3. 拼接完毕后，lastBaseUpdate 指向到新的更新链表最后的那个节点；
     */
    // Append pending updates to base queue
    if (lastBaseUpdate === null) {
      firstBaseUpdate = firstPendingUpdate;
    } else {
      lastBaseUpdate.next = firstPendingUpdate;
    }
    lastBaseUpdate = lastPendingUpdate;

    // If there's a current queue, and it's different from the base queue, then
    // we need to transfer the updates to that queue, too. Because the base
    // queue is a singly-linked list with no cycles, we can append to both
    // lists and take advantage of structural sharing.
    // TODO: Pass `current` as argument
    /**
     * 若workInProgress对应的在current的那个fiber节点，其更新队列的最后那个节点与当前的最后那个节点不一样，
     * 则我们将上面「将要更新」的链表的头指针和尾指针给到current节点的更新队列中，
     * 拼接方式与上面的一样
     */
    const current = workInProgress.alternate;
    if (current !== null) {
      // This is always non-null on a ClassComponent or HostRoot
      const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;

      // 若current更新链表的最后那个节点与当前将要更新的链表的最后那个节点不一样
      // 则，把将要更新的链表也拼接到current中
      if (currentLastBaseUpdate !== lastBaseUpdate) {
        if (currentLastBaseUpdate === null) {
          currentQueue.firstBaseUpdate = firstPendingUpdate;
        } else {
          currentLastBaseUpdate.next = firstPendingUpdate;
        }
        currentQueue.lastBaseUpdate = lastPendingUpdate;
      }
    }
  }

  /**
   * 进行到这里，render()初始更新时，放在 queue.shared.pending 中的update节点（里面存放着element结构），
   * 就已经放到 queue.firstBaseUpdate 里了，
   * 因此 firstBaseUpdate 里肯定存放了一个 update 节点，一定不为空，进入到 if 的逻辑中
   */
  // These values may change as we process the queue.
  if (firstBaseUpdate !== null) {
    // Iterate through the list of updates to compute the result.
    // 迭代更新列表以计算结果

    /**
     * newState 的默认值：
     * {
     *  cache: {controller: AbortController, data: Map(0), refCount: 1}
     *  element: null
     *  isDehydrated: false
     *  pendingSuspenseBoundaries: null
     *  transitions: null
     * }
     */
    let newState = queue.baseState;
    // TODO: Don't need to accumulate this. Instead, we can remove renderLanes
    // from the original lanes.
    let newLanes = NoLanes;

    let newBaseState = null;
    let newFirstBaseUpdate = null;
    let newLastBaseUpdate = null;

    let update = firstBaseUpdate;
    do {
      const updateLane = update.lane;
      const updateEventTime = update.eventTime;
      // console.log('isSubsetOfLanes(renderLanes, updateLane)', renderLanes, updateLane, isSubsetOfLanes(renderLanes, updateLane));
      // renderLanes 和 updateLane一样，因此 isSubsetOfLanes(renderLanes, updateLane) 的结果为true，
      // 而这里再取反一次，则为false，会进入到 else 的逻辑中
      if (!isSubsetOfLanes(renderLanes, updateLane)) {
        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.
        const clone: Update<State> = {
          eventTime: updateEventTime,
          lane: updateLane,

          tag: update.tag,
          payload: update.payload,
          callback: update.callback,

          next: null,
        };
        if (newLastBaseUpdate === null) {
          newFirstBaseUpdate = newLastBaseUpdate = clone;
          newBaseState = newState;
        } else {
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }
        // Update the remaining priority in the queue.
        newLanes = mergeLanes(newLanes, updateLane);
      } else {
        // This update does have sufficient priority.
        // 初始render()时会走这里

        if (newLastBaseUpdate !== null) {
          // 若更新链表不为空时，则再往后拼接一个 update 节点，
          // 但初始render()渲染时，newLastBaseUpdate为空，走不到这里
          const clone: Update<State> = {
            eventTime: updateEventTime,
            // This update is going to be committed so we never want uncommit
            // it. Using NoLane works because 0 is a subset of all bitmasks, so
            // this will never be skipped by the check above.
            lane: NoLane,

            tag: update.tag, // 初始render()的tag为UpdateState，即为0
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }

        // Process this update.
        /**
         * render()时 newState 的默认值：
         * {
         *  cache: {controller: AbortController, data: Map(0), refCount: 1}
         *  element: null
         *  isDehydrated: false
         *  pendingSuspenseBoundaries: null
         *  transitions: null
         * }
         * 执行 getStateFromUpdate() 后，则会将 update 中的 element 给到 newState 中
         */
        newState = getStateFromUpdate(
          workInProgress,
          queue,
          update,
          newState,
          props,
          instance,
        );
        const callback = update.callback;
        console.log('%cgetStateFromUpdate', 'background-color: red', newState, callback);
        if (
          callback !== null &&
          // If the update was already committed, we should not queue its
          // callback again.
          update.lane !== NoLane
        ) {
          workInProgress.flags |= Callback;
          const effects = queue.effects;
          if (effects === null) {
            queue.effects = [update];
          } else {
            effects.push(update);
          }
        }
      }
      update = update.next; // 只有一个update节点，next为null，直接break，跳出循环
      if (update === null) {
        /**
         * 在上面将 queue.shared.pending 放到firstBaseUpdate时，
         * queue.shared.pending就已经重置为null了
         * @type {Update<State>|null|*}
         */
        pendingQueue = queue.shared.pending;
        if (pendingQueue === null) {
          break;
        } else {
          // An update was scheduled from inside a reducer. Add the new
          // pending updates to the end of the list and keep processing.
          const lastPendingUpdate = pendingQueue;
          // Intentionally unsound. Pending updates form a circular list, but we
          // unravel them when transferring them to the base queue.
          const firstPendingUpdate = ((lastPendingUpdate.next: any): Update<State>);
          lastPendingUpdate.next = null;
          update = firstPendingUpdate;
          queue.lastBaseUpdate = lastPendingUpdate;
          queue.shared.pending = null;
        }
      }
    } while (true);

    if (newLastBaseUpdate === null) {
      newBaseState = newState;
    }

    queue.baseState = ((newBaseState: any): State);
    queue.firstBaseUpdate = newFirstBaseUpdate;
    queue.lastBaseUpdate = newLastBaseUpdate;

    /**
     * 经过上面的操作，queue（即 workInProgress.updateQueue ）为：
     * baseState: { element: element结构, isDehydrated: false }
     * effects: null,
     * firstBaseUpdate: null,
     * lastBaseUpdate: null,
     * shared: { pending: null, interleaved: null, lanes: 0 }
     */

      // workInProgress.updateQueue的数据结构： https://mat1.gtimg.com/qqcdn/tupload/1659687672451.png

      // Interleaved updates are stored on a separate queue. We aren't going to
      // process them during this render, but we do need to track which lanes
      // are remaining.
    const lastInterleaved = queue.shared.interleaved;
    if (lastInterleaved !== null) {
      let interleaved = lastInterleaved;
      do {
        newLanes = mergeLanes(newLanes, interleaved.lane);
        interleaved = ((interleaved: any).next: Update<State>);
      } while (interleaved !== lastInterleaved);
    } else if (firstBaseUpdate === null) {
      // `queue.lanes` is used for entangling transitions. We can set it back to
      // zero once the queue is empty.
      queue.shared.lanes = NoLanes;
    }
    
    markSkippedUpdateLanes(newLanes);
    workInProgress.lanes = newLanes;
    workInProgress.memoizedState = newState;
  }
}
```

### 3.2 FunctionComponent

### 3.3 ClassComponent

### 3.4 HostComponent

## 4. reconcileChildren






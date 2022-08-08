/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// UpdateQueue is a linked list of prioritized updates.
//
// Like fibers, update queues come in pairs: a current queue, which represents
// the visible state of the screen, and a work-in-progress queue, which can be
// mutated and processed asynchronously before it is committed — a form of
// double buffering. If a work-in-progress render is discarded before finishing,
// we create a new work-in-progress by cloning the current queue.
//
// Both queues share a persistent, singly-linked list structure. To schedule an
// update, we append it to the end of both queues. Each queue maintains a
// pointer to first update in the persistent list that hasn't been processed.
// The work-in-progress pointer always has a position equal to or greater than
// the current queue, since we always work on that one. The current queue's
// pointer is only updated during the commit phase, when we swap in the
// work-in-progress.
//
// For example:
//
//   Current pointer:           A - B - C - D - E - F
//   Work-in-progress pointer:              D - E - F
//                                          ^
//                                          The work-in-progress queue has
//                                          processed more updates than current.
//
// The reason we append to both queues is because otherwise we might drop
// updates without ever processing them. For example, if we only add updates to
// the work-in-progress queue, some updates could be lost whenever a work-in
// -progress render restarts by cloning from current. Similarly, if we only add
// updates to the current queue, the updates will be lost whenever an already
// in-progress queue commits and swaps with the current queue. However, by
// adding to both queues, we guarantee that the update will be part of the next
// work-in-progress. (And because the work-in-progress queue becomes the
// current queue once it commits, there's no danger of applying the same
// update twice.)
//
// Prioritization
// --------------
//
// Updates are not sorted by priority, but by insertion; new updates are always
// appended to the end of the list.
//
// The priority is still important, though. When processing the update queue
// during the render phase, only the updates with sufficient priority are
// included in the result. If we skip an update because it has insufficient
// priority, it remains in the queue to be processed later, during a lower
// priority render. Crucially, all updates subsequent to a skipped update also
// remain in the queue *regardless of their priority*. That means high priority
// updates are sometimes processed twice, at two separate priorities. We also
// keep track of a base state, that represents the state before the first
// update in the queue is applied.
//
// For example:
//
//   Given a base state of '', and the following queue of updates
//
//     A1 - B2 - C1 - D2
//
//   where the number indicates the priority, and the update is applied to the
//   previous state by appending a letter, React will process these updates as
//   two separate renders, one per distinct priority level:
//
//   First render, at priority 1:
//     Base state: ''
//     Updates: [A1, C1]
//     Result state: 'AC'
//
//   Second render, at priority 2:
//     Base state: 'A'            <-  The base state does not include C1,
//                                    because B2 was skipped.
//     Updates: [B2, C1, D2]      <-  C1 was rebased on top of B2
//     Result state: 'ABCD'
//
// Because we process updates in insertion order, and rebase high priority
// updates when preceding updates are skipped, the final result is deterministic
// regardless of priority. Intermediate state may vary according to system
// resources, but the final state is always the same.

import type {Fiber, FiberRoot} from './ReactInternalTypes';
import type {Lanes, Lane} from './ReactFiberLane.old';

import {
  NoLane,
  NoLanes,
  isSubsetOfLanes,
  mergeLanes,
  isTransitionLane,
  intersectLanes,
  markRootEntangled,
} from './ReactFiberLane.old';
import {
  enterDisallowedContextReadInDEV,
  exitDisallowedContextReadInDEV,
} from './ReactFiberNewContext.old';
import {Callback, ShouldCapture, DidCapture} from './ReactFiberFlags';

import {debugRenderPhaseSideEffectsForStrictMode} from 'shared/ReactFeatureFlags';

import {StrictLegacyMode} from './ReactTypeOfMode';
import {
  markSkippedUpdateLanes,
  isInterleavedUpdate,
} from './ReactFiberWorkLoop.old';
import {pushInterleavedQueue} from './ReactFiberInterleavedUpdates.old';
import {setIsStrictModeForDevtools} from './ReactFiberDevToolsHook.old';

import assign from 'shared/assign';

export type Update<State> = {|
  // TODO: Temporary field. Will remove this by storing a map of
  // transition -> event time on the root.
  eventTime: number,
  lane: Lane,

  tag: 0 | 1 | 2 | 3,
  payload: any,
  callback: (() => mixed) | null,

  next: Update<State> | null,
|};

export type SharedQueue<State> = {|
  pending: Update<State> | null,
  interleaved: Update<State> | null,
  lanes: Lanes,
|};

export type UpdateQueue<State> = {|
  baseState: State,
  firstBaseUpdate: Update<State> | null,
  lastBaseUpdate: Update<State> | null,
  shared: SharedQueue<State>,
  effects: Array<Update<State>> | null,
|};

export const UpdateState = 0;
export const ReplaceState = 1;
export const ForceUpdate = 2;
export const CaptureUpdate = 3;

// Global state that is reset at the beginning of calling `processUpdateQueue`.
// It should only be read right after calling `processUpdateQueue`, via
// `checkHasForceUpdateAfterProcessing`.
let hasForceUpdate = false;

let didWarnUpdateInsideUpdate;
let currentlyProcessingQueue;
export let resetCurrentlyProcessingQueue;
if (__DEV__) {
  didWarnUpdateInsideUpdate = false;
  currentlyProcessingQueue = null;
  resetCurrentlyProcessingQueue = () => {
    currentlyProcessingQueue = null;
  };
}

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

export function createUpdate(eventTime: number, lane: Lane): Update<*> {
  const update: Update<*> = {
    eventTime,
    lane,

    tag: UpdateState,
    payload: null,
    callback: null,

    next: null,
  };
  return update;
}

/**
 * 将update添加到fiber的updateQueue.shared.pending中
 * https://github.com/wenzi0github/react/issues/7
 * https://zhuanlan.zhihu.com/p/386897467
 * @param fiber
 * @param update
 * @param lane
 */
export function enqueueUpdate<State>(
  fiber: Fiber,
  update: Update<State>,
  lane: Lane,
) {
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    // 只有在fiber卸载时还会出现
    // Only occurs if the fiber has been unmounted.
    return;
  }

  const sharedQueue: SharedQueue<State> = (updateQueue: any).shared;

  if (isInterleavedUpdate(fiber, lane)) {
    const interleaved = sharedQueue.interleaved;
    if (interleaved === null) {
      // This is the first update. Create a circular list.
      update.next = update;
      // At the end of the current render, this queue's interleaved updates will
      // be transferred to the pending queue.
      pushInterleavedQueue(sharedQueue);
    } else {
      update.next = interleaved.next;
      interleaved.next = update;
    }
    sharedQueue.interleaved = update;
  } else {
    const pending = sharedQueue.pending;
    /**
     * 为什么要做成环形链表？
     * 做成环形链表可以只需要利用一个指针，便能找到第一个进入的节点和最后一个进入的节点，
     * 更加方便的找到最后一个 Update 对象，同时插入新的 Update 对象也非常方便。
     * 如果使用普通的线性链表，想跟环形一样插入和查找都方便的话，就需要同时记录第一个和最后一个节点的位置，维护成本相较于环形肯定是更高了
     */
    if (pending === null) {
      // This is the first update. Create a circular list.
      // 当update为第1个节点时，自己指向自己，pending也指向到update，同理pending.next也指向到pending，即update
      update.next = update;
    } else {
      /**
       * 当只有一个节点时，pending与update指向的是同一个节点，update.next = update; pending.next = update;
       * 当已经有1个节点(val=1)，再插入一个新节点update(val=2)时，pending和pending.next此时指向是的之前的节点，
       * update.next = pending.next则表示新节点的next指向到了之前的节点(val=1),
       * pending.next = update，表示pending的下一个节点知道了刚才的update，即之前的update.next指向到了新的update
       * pending = update, pending指向到了最新的节点
       * 当已经有2个节点，再插入一个新节点update(val=3)时，pending目前指向的节点是(val=2)，pending.next指向的节点是val=1
       * update.next = pending.next，表示新节点(val=3)的next指向到了最早的节点(val=1)，
       * pending.next = update, 节点(val=2)的next指向到了新节点(val=3),
       * pending = update, pending又指向到了最新的节点(val=3)
       * 此时，3(pending)->1->2->3
       * 若再插入一个节点(val=4)，最后的结构是4(pending)->1->2->3->4，
       * 即sharedQueue.pending指向的链表是一个循环的链表结构，而pending永远指向到最新的那个update节点，
       * 而最新的update节点又重新指向到了最早的那个节点
       * 示意图：https://pic2.zhimg.com/80/v2-bbb9813e8e4922b05d77261fe7814e95_1440w.jpg
       */
      update.next = pending.next;
      pending.next = update;
    }
    sharedQueue.pending = update;
  }

  if (__DEV__) {
    if (
      currentlyProcessingQueue === sharedQueue &&
      !didWarnUpdateInsideUpdate
    ) {
      console.error(
        'An update (setState, replaceState, or forceUpdate) was scheduled ' +
          'from inside an update function. Update functions should be pure, ' +
          'with zero side-effects. Consider using componentDidUpdate or a ' +
          'callback.',
      );
      didWarnUpdateInsideUpdate = true;
    }
  }
}

export function entangleTransitions(root: FiberRoot, fiber: Fiber, lane: Lane) {
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return;
  }

  const sharedQueue: SharedQueue<mixed> = (updateQueue: any).shared;
  if (isTransitionLane(lane)) {
    let queueLanes = sharedQueue.lanes;

    // If any entangled lanes are no longer pending on the root, then they must
    // have finished. We can remove them from the shared queue, which represents
    // a superset of the actually pending lanes. In some cases we may entangle
    // more than we need to, but that's OK. In fact it's worse if we *don't*
    // entangle when we should.
    queueLanes = intersectLanes(queueLanes, root.pendingLanes);

    // Entangle the new transition lane with the other transition lanes.
    const newQueueLanes = mergeLanes(queueLanes, lane);
    sharedQueue.lanes = newQueueLanes;
    // Even if queue.lanes already include lane, we don't know for certain if
    // the lane finished since the last time we entangled it. So we need to
    // entangle it again, just to be sure.
    markRootEntangled(root, newQueueLanes);
  }
}

export function enqueueCapturedUpdate<State>(
  workInProgress: Fiber,
  capturedUpdate: Update<State>,
) {
  // Captured updates are updates that are thrown by a child during the render
  // phase. They should be discarded if the render is aborted. Therefore,
  // we should only put them on the work-in-progress queue, not the current one.
  let queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  // Check if the work-in-progress queue is a clone.
  const current = workInProgress.alternate;
  if (current !== null) {
    const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
    if (queue === currentQueue) {
      // The work-in-progress queue is the same as current. This happens when
      // we bail out on a parent fiber that then captures an error thrown by
      // a child. Since we want to append the update only to the work-in
      // -progress queue, we need to clone the updates. We usually clone during
      // processUpdateQueue, but that didn't happen in this case because we
      // skipped over the parent when we bailed out.
      let newFirst = null;
      let newLast = null;
      const firstBaseUpdate = queue.firstBaseUpdate;
      if (firstBaseUpdate !== null) {
        // Loop through the updates and clone them.
        let update = firstBaseUpdate;
        do {
          const clone: Update<State> = {
            eventTime: update.eventTime,
            lane: update.lane,

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          if (newLast === null) {
            newFirst = newLast = clone;
          } else {
            newLast.next = clone;
            newLast = clone;
          }
          update = update.next;
        } while (update !== null);

        // Append the captured update the end of the cloned list.
        if (newLast === null) {
          newFirst = newLast = capturedUpdate;
        } else {
          newLast.next = capturedUpdate;
          newLast = capturedUpdate;
        }
      } else {
        // There are no base updates.
        newFirst = newLast = capturedUpdate;
      }
      queue = {
        baseState: currentQueue.baseState,
        firstBaseUpdate: newFirst,
        lastBaseUpdate: newLast,
        shared: currentQueue.shared,
        effects: currentQueue.effects,
      };
      workInProgress.updateQueue = queue;
      return;
    }
  }

  // Append the update to the end of the list.
  const lastBaseUpdate = queue.lastBaseUpdate;
  if (lastBaseUpdate === null) {
    queue.firstBaseUpdate = capturedUpdate;
  } else {
    lastBaseUpdate.next = capturedUpdate;
  }
  queue.lastBaseUpdate = capturedUpdate;
}

function getStateFromUpdate<State>(
  workInProgress: Fiber,
  queue: UpdateQueue<State>,
  update: Update<State>,
  prevState: State,
  nextProps: any,
  instance: any,
): any {
  switch (update.tag) {
    case ReplaceState: {
      // todo: 类似于 Function Componpent中的useState()?
      // const [state, setState] = useState();
      const payload = update.payload;
      if (typeof payload === 'function') {
        // Updater function
        // 若payload是function，则直接返回函数执行后的结果（不再与之前的数据进行合并）
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
        }
        const nextState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictLegacyMode
          ) {
            setIsStrictModeForDevtools(true);
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
          exitDisallowedContextReadInDEV();
        }
        return nextState;
      }
      // 若不是function类型，则传入什么，返回什么
      // State object
      return payload;
    }
    case CaptureUpdate: {
      workInProgress.flags =
        (workInProgress.flags & ~ShouldCapture) | DidCapture;
    }
    // Intentional fallthrough
    case UpdateState: {

      const payload = update.payload;
      let partialState; // 临时变量，用于存储传入进来的新state结果，方便最后进行assign合并处理
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
        }
        // 若传入的是function，则获取函数执行后的结果
        partialState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictLegacyMode
          ) {
            setIsStrictModeForDevtools(true);
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
          exitDisallowedContextReadInDEV();
        }
      } else {
        // Partial state object
        // 若是普通object的变量，则直接赋值
        partialState = payload;
      }
      if (partialState === null || partialState === undefined) {
        // Null and undefined are treated as no-ops.
        // 若得到的结果是null，则直接返回之前的数据
        return prevState;
      }
      // Merge the partial state and the previous state.
      // 与之前的state数据进行合并
      /**
       * 初始render()时，payload为 { element }，会给到变量 partialState
       * prevState为 { cache, element: null, isDehydrated: false, pendingSuspenseBoundaries: null, transitions: null }
       * 两者合并时，相当于合并了 element 属性
       */
      return assign({}, prevState, partialState);
    }
    case ForceUpdate: {
      hasForceUpdate = true;
      return prevState;
    }
  }
  return prevState;
}

/**
 *
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
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  hasForceUpdate = false;

  if (__DEV__) {
    currentlyProcessingQueue = queue.shared;
  }

  let firstBaseUpdate = queue.firstBaseUpdate; // 更新链表的开始节点
  let lastBaseUpdate = queue.lastBaseUpdate; // 更新链表的最后的那个节点

  // Check if there are pending updates. If so, transfer them to the base queue.
  // 检测queue中是否有挂起的更新，若存在，则将其转义到 firstBaseUpdate 上，并清空刚才的链表
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
     * 1. 更新链表的最后那个节点为空，说明当前更新链表为空，将要更新的首节点 firstPendingUpdate 给到 firstBaseUpdate即可；
     * 2. 若更新链表的尾节点不为，则将要更新的首节点 firstPendingUpdate 拼接到 lastBaseUpdate 的后面；
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
     * 若workInProgress对应的在current树的那个fiber节点的更新队列，与当前的不一样，
     * 则我们将上面「将要更新」的链表的头指针和尾指针给到基本更新队列中，
     * 拼接方式与上面的一样
     */
    const current = workInProgress.alternate;
    if (current !== null) {
      // This is always non-null on a ClassComponent or HostRoot
      const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;
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
   * 进行到这里，render()初始更新时，放在 queue.shared.pending 中的element结构，
   * 就已经放到 queue.firstBaseUpdate 里了
   */
  // These values may change as we process the queue.
  if (firstBaseUpdate !== null) {
    // Iterate through the list of updates to compute the result.
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
         * render()时 newState 的默认值
         * cache: {controller: AbortController, data: Map(0), refCount: 1}
         * element: null
         * isDehydrated: false
         * pendingSuspenseBoundaries: null
         * transitions: null
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
      update = update.next;
      if (update === null) {
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

    // https://mat1.gtimg.com/qqcdn/tupload/1659687672451.png

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

    // Set the remaining expiration time to be whatever is remaining in the queue.
    // This should be fine because the only two other things that contribute to
    // expiration time are props and context. We're already in the middle of the
    // begin phase by the time we start processing the queue, so we've already
    // dealt with the props. Context in components that specify
    // shouldComponentUpdate is tricky; but we'll have to account for
    // that regardless.
    markSkippedUpdateLanes(newLanes);
    workInProgress.lanes = newLanes;
    workInProgress.memoizedState = newState;
  }

  if (__DEV__) {
    currentlyProcessingQueue = null;
  }
}

function callCallback(callback, context) {
  if (typeof callback !== 'function') {
    throw new Error(
      'Invalid argument passed as callback. Expected a function. Instead ' +
        `received: ${callback}`,
    );
  }

  callback.call(context);
}

export function resetHasForceUpdateBeforeProcessing() {
  hasForceUpdate = false;
}

export function checkHasForceUpdateAfterProcessing(): boolean {
  return hasForceUpdate;
}

export function commitUpdateQueue<State>(
  finishedWork: Fiber,
  finishedQueue: UpdateQueue<State>,
  instance: any,
): void {
  // Commit the effects
  const effects = finishedQueue.effects;
  finishedQueue.effects = null;
  if (effects !== null) {
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];
      const callback = effect.callback;
      if (callback !== null) {
        effect.callback = null;
        callCallback(callback, instance);
      }
    }
  }
}

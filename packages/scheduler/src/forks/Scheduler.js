/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* eslint-disable no-var */

import {
  enableSchedulerDebugging,
  enableProfiling,
  enableIsInputPending,
  enableIsInputPendingContinuous,
  frameYieldMs,
  continuousYieldMs,
  maxYieldMs,
} from '../SchedulerFeatureFlags';

import {push, pop, peek} from '../SchedulerMinHeap';

// TODO: Use symbols?
import {
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
} from '../SchedulerPriorities';
import {
  markTaskRun,
  markTaskYield,
  markTaskCompleted,
  markTaskCanceled,
  markTaskErrored,
  markSchedulerSuspended,
  markSchedulerUnsuspended,
  markTaskStart,
  stopLoggingProfilingEvents,
  startLoggingProfilingEvents,
} from '../SchedulerProfiling';

/**
 * 该文件是用来进行任务调度的，
 * 即如何区分每个任务的优先级
 * https://juejin.cn/post/6889314677528985614
 * 流程图：https://docs.qq.com/flowchart/DUGp5UUhjRG5CaE9q
 */

/**
 * 获取当前的时间（现在距离打开浏览器（或初始化React实例）的时间）
 * 若存在performance.now()，则使用该函数；
 * 否则使用Date.now() - 初始时间（初始时间一经产生则该周期内永远不变）；
 */
let getCurrentTime;
const hasPerformanceNow =
  typeof performance === 'object' && typeof performance.now === 'function';

if (hasPerformanceNow) {
  const localPerformance = performance;
  getCurrentTime = () => localPerformance.now();
} else {
  const localDate = Date;
  const initialTime = localDate.now(); // 创建一个初始时间，用来模拟performance.now()的执行结果
  getCurrentTime = () => localDate.now() - initialTime;
}

/**
 * 不同优先级任务的过期时间
 */

// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823; // 31位长度中，最大的整数

// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1; // 最高优的任务，不存在过期时间，应当立即执行
// Eventually times out
var USER_BLOCKING_PRIORITY_TIMEOUT = 250; // 用户阻塞优先级
var NORMAL_PRIORITY_TIMEOUT = 5000; // 一般的优先级
var LOW_PRIORITY_TIMEOUT = 10000; // 低优先级
// Never times out
var IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt; // 空闲再执行的优先级，可以认为没有超时时间，可能被永远阻塞不执行

// Tasks are stored on a min heap
var taskQueue = []; // 存放及时任务的队列
var timerQueue = []; // 存放延时任务，即 `startTime > currentTime`的任务

// Incrementing id counter. Used to maintain insertion order.
var taskIdCounter = 1;

// Pausing the scheduler is useful for debugging.
var isSchedulerPaused = false;

var currentTask = null; // 当前执行的任务
var currentPriorityLevel = NormalPriority; // 默认当前的优先级为一般优先级（该变量会在全局进行使用，经常会有地方 getCurrentPriorityLevel,就是返回这个值）

// This is set while performing work, to prevent re-entrance.
var isPerformingWork = false; // 这是在执行工作时设置的，以防止重新进入。

var isHostCallbackScheduled = false; // 是否有任务正在被调度（执行中）
var isHostTimeoutScheduled = false;

// 获取本地的api，避免polyfill将其覆盖
// Capture local references to native APIs, in case a polyfill overrides them.
const localSetTimeout = typeof setTimeout === 'function' ? setTimeout : null;
const localClearTimeout =
  typeof clearTimeout === 'function' ? clearTimeout : null;
const localSetImmediate =
  typeof setImmediate !== 'undefined' ? setImmediate : null; // IE and Node.js + jsdom

// https://juejin.cn/post/6996644324570054664
// 用来判断是否有需要处理的输入事件（如按键、鼠标、滚轮等），目前在chrome87及以上版本可用
const isInputPending =
  typeof navigator !== 'undefined' &&
  navigator.scheduling !== undefined &&
  navigator.scheduling.isInputPending !== undefined
    ? navigator.scheduling.isInputPending.bind(navigator.scheduling)
    : null;

// isInputPending方法默认不包含连续的事件，如mousemove, pointermove等，若想包含这些事件，
// 则需要设置 includeContinuous 为 true
// 这里默认为false
const continuousOptions = {includeContinuous: enableIsInputPendingContinuous};

/**
 * 检查延迟执行队列里，是否有需要执行的任务，
 * 有的话，则将其从延迟队列里推出，修改sortIndex为过期时间（在延期执行队列里，sortIndex为startTime）
 * 然后将其压入到及时任务的队列中
 * @param {number} currentTime 
 */
function advanceTimers(currentTime) {
  // Check for tasks that are no longer delayed and add them to the queue.
  let timer = peek(timerQueue);
  while (timer !== null) {
    if (timer.callback === null) {
      // Timer was cancelled.
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      // Timer fired. Transfer to the task queue.
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime;
      push(taskQueue, timer);
      if (enableProfiling) {
        markTaskStart(timer, currentTime);
        timer.isQueued = true;
      }
    } else {
      // Remaining timers are pending.
      return;
    }
    timer = peek(timerQueue);
  }
}

/**
 * 延迟执行的延时任务，到时间点了，该要执行了
 * @param {number} currentTime 当前时间点
 */
function handleTimeout(currentTime) {
  isHostTimeoutScheduled = false;

  // 根据当前时间点，提取延迟执行的任务到执行队列taskQueue中
  advanceTimers(currentTime);

  if (!isHostCallbackScheduled) {
    // 若没有任务正在执行
    if (peek(taskQueue) !== null) {
      // 若可执行队列不为空
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    } else {
      // 可执行队列为空，则判断延迟队列中的数据
      const firstTimer = peek(timerQueue);
      if (firstTimer !== null) {
        // 若延迟队列不为空
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

/**
 * 
 * @param {*} hasTimeRemaining 
 * @param {*} initialTime 
 */
function flushWork(hasTimeRemaining, initialTime) {
  if (enableProfiling) {
    markSchedulerUnsuspended(initialTime);
  }

  // We'll need a host callback the next time work is scheduled.
  isHostCallbackScheduled = false;
  if (isHostTimeoutScheduled) {
    // We scheduled a timeout but it's no longer needed. Cancel it.
    isHostTimeoutScheduled = false;
    cancelHostTimeout();
  }

  isPerformingWork = true;
  const previousPriorityLevel = currentPriorityLevel;
  try {
    if (enableProfiling) {
      try {
        return workLoop(hasTimeRemaining, initialTime);
      } catch (error) {
        if (currentTask !== null) {
          const currentTime = getCurrentTime();
          markTaskErrored(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        throw error;
      }
    } else {
      // No catch in prod code path.
      return workLoop(hasTimeRemaining, initialTime);
    }
  } finally {
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel;
    isPerformingWork = false;
    if (enableProfiling) {
      const currentTime = getCurrentTime();
      markSchedulerSuspended(currentTime);
    }
  }
}

function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime;

  // 将可以执行的延迟任务，放入到执行队列里
  advanceTimers(currentTime);

  // 根据优先级获取第0个可执行任务
  currentTask = peek(taskQueue);
  while (
    currentTask !== null &&
    !(enableSchedulerDebugging && isSchedulerPaused)
  ) {
    if (
      currentTask.expirationTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      // 这个任务还没过期，而且没有剩余时间了或者有了更高优的任务
      // 这时则需要让出主程
      // This currentTask hasn't expired, and we've reached the deadline.
      break;
    }
    const callback = currentTask.callback;
    if (typeof callback === 'function') {
      currentTask.callback = null;
      currentPriorityLevel = currentTask.priorityLevel;

      // 该任务是否已过期
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      if (enableProfiling) {
        markTaskRun(currentTask, currentTime);
      }
      const continuationCallback = callback(didUserCallbackTimeout);
      currentTime = getCurrentTime();
      if (typeof continuationCallback === 'function') {
        currentTask.callback = continuationCallback;
        if (enableProfiling) {
          markTaskYield(currentTask, currentTime);
        }
      } else {
        if (enableProfiling) {
          markTaskCompleted(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        // 若该任务是第0个任务，则将其推出
        // 好奇怪？这里为什么不直接推出，而是先拿到第0个元素，然后进行比较，然后再推出？
        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }
      }
      // 从延迟队列里将可以执行的任务放到taskQueue里
      advanceTimers(currentTime);
    } else {
      // 若不为function类型，则只推出
      pop(taskQueue);
    }
    // 取出下一个任务
    currentTask = peek(taskQueue);
  }
  // Return whether there's additional work
  if (currentTask !== null) {
    // 若还存在任务，则返回true
    // 上面的while循环中，因为当前时间切片剩余时间或者其他高优任务，可能会被打断
    // 导致有些任务就没执行
    return true;
  } else {
    // 若taskQueue已执行完毕，则查看延迟队列中是否有数据
    // 若存在数据，则延迟一定时间后启动该handleTimeout即可
    // 这个延迟的时间就是该任务的启动时间 - 当前时间
    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}

function unstable_runWithPriority(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case ImmediatePriority: // 立即执行的
    case UserBlockingPriority: // 用户行为
    case NormalPriority: // 一般优先级
    case LowPriority: // 低优先级
    case IdlePriority: // 空闲再执行的
      break;
    default:
      priorityLevel = NormalPriority; // 其他级别的，均认为是一般优先级（NoPriority = 0: 无优先级，	React内部使用：初始化和重置root；用户自定义使用）
  }

  var previousPriorityLevel = currentPriorityLevel; // 将当前的优先级进行保存
  currentPriorityLevel = priorityLevel; // 获取接下来要处理的优先级

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_next(eventHandler) {
  var priorityLevel;
  switch (currentPriorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
      // Shift down to normal priority
      priorityLevel = NormalPriority;
      break;
    default:
      // Anything lower than normal priority should remain at the current level.
      priorityLevel = currentPriorityLevel;
      break;
  }

  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_wrapCallback(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    // This is a fork of runWithPriority, inlined for performance.
    var previousPriorityLevel = currentPriorityLevel;
    currentPriorityLevel = parentPriorityLevel;

    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
    }
  };
}

/**
 * 根据优先级计算任务的过期时间，并将其存入对应的队列中
 * @param {ImmediatePriority|UserBlockingPriority|NormalPriority|LowPriority|IdlePriority} priorityLevel 优先级
 * @param {Function} callback 就是我们要执行的任务内容
 * @param {{delay:number}} options
 * @returns
 */
function unstable_scheduleCallback(priorityLevel, callback, options) {
  // 获取当前时间
  var currentTime = getCurrentTime();

  // 获取该优先级对应的延迟执行的时间
  // 若设置了延迟时间，则从当前时间进行延后
  // 否则开始时间就是当前时间
  var startTime;
  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;
    if (typeof delay === 'number' && delay > 0) {
      startTime = currentTime + delay;
    } else {
      startTime = currentTime;
    }
  } else {
    startTime = currentTime;
  }

  // 获取该优先级的超时时间
  // 优先级越高，则超时时间越短，越需要尽快执行
  var timeout;
  switch (priorityLevel) {
    case ImmediatePriority:
      timeout = IMMEDIATE_PRIORITY_TIMEOUT; // 立即执行的任务，超时时间为-1，表示要立刻执行
      break;
    case UserBlockingPriority:
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT; // 用户行为的优先级，超时时间为250
      break;
    case IdlePriority:
      timeout = IDLE_PRIORITY_TIMEOUT; // 空闲时再执行的优先级，超时时间无限大，若不空闲时可能永远不会执行
      break;
    case LowPriority:
      timeout = LOW_PRIORITY_TIMEOUT; // 10000
      break;
    case NormalPriority:
    default:
      timeout = NORMAL_PRIORITY_TIMEOUT; // 5000
      break;
  }

  var expirationTime = startTime + timeout; // 通过开始时间和超时时间，计算出过期时间点

  // 这里会按照id和sortIndex两个属性对任务进行优先级的排序
  // sortIndex值越小，优先级越高；
  // id：是任务创建的顺序，id越小，优先级越高
  var newTask = {
    id: taskIdCounter++, // 任务节点的序号，创建任务时通过taskIdCounter 自增 1
    callback, // 	任务函数 执行内容
    priorityLevel, // 任务的优先级。优先级按 ImmediatePriority、UserBlockingPriority、NormalPriority、LowPriority、IdlePriority 顺序依次越低
    startTime, // 时间戳，任务预期执行时间，默认为当前时间，即同步任务。可通过 options.delay 设为异步延时任务
    expirationTime, // 过期时间，scheduler 基于该值进行异步任务的调度。通过 options.timeout 设定或 priorityLevel 计算 timeout 值后，timeout 与 startTime 相加称为 expirationTime
    sortIndex: -1, // 默认值为 -1。对于异步延时任务，该值将赋为 startTime
  };
  if (enableProfiling) {
    newTask.isQueued = false;
  }

  if (startTime > currentTime) {
    // 若任务的开始时间大于当前时间，说明这是一个延期执行的任务
    // This is a delayed task.
    newTask.sortIndex = startTime;

    // 延期执行的任务，将其压入到timerQueue中
    push(timerQueue, newTask);

    // 若正在执行的任务为空，且当前任务是延期执行任务队列的第1个任务
    // 则说明所有的任务都被延迟执行了，而且该任务是优先级最高的延迟任务
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // All tasks are delayed, and this is the task with the earliest delay.
      if (isHostTimeoutScheduled) {
        // 若存在延时任务等待执行，则取消之前等待执行的延迟任务
        // Cancel an existing timeout.
        cancelHostTimeout();
      } else {
        // 若不存在需要等待执行的延迟任务，则这里添加上标识
        isHostTimeoutScheduled = true;
      }
      // 延迟调度这个任务
      // Schedule a timeout.
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    // 这是一个同步执行的任务
    // sortIndex为过期时间，按照排序规则，过期时间越短的，则优先执行
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
    if (enableProfiling) {
      markTaskStart(newTask, currentTime);
      newTask.isQueued = true;
    }

    // isHostCallbackScheduled： 是否有主任务正在执行
    // isPerformingWork: 一个标识,用于确认performWorkUntilDeadline 是否正处于递归的执行状态中
    // Schedule a host callback, if needed. If we're already performing work,
    // wait until the next time we yield.
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
  }

  return newTask;
}

function unstable_pauseExecution() {
  isSchedulerPaused = true;
}

function unstable_continueExecution() {
  isSchedulerPaused = false;
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    requestHostCallback(flushWork);
  }
}

function unstable_getFirstCallbackNode() {
  return peek(taskQueue);
}

function unstable_cancelCallback(task) {
  if (enableProfiling) {
    if (task.isQueued) {
      const currentTime = getCurrentTime();
      markTaskCanceled(task, currentTime);
      task.isQueued = false;
    }
  }

  // Null out the callback to indicate the task has been canceled. (Can't
  // remove from the queue because you can't remove arbitrary nodes from an
  // array based heap, only the first one.)
  task.callback = null;
}

function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}

let isMessageLoopRunning = false; // 标志当前消息循环是否开启
let scheduledHostCallback = null; // 立即执行的任务
let taskTimeoutID = -1;

// Scheduler periodically yields in case there is other work on the main
// thread, like user events. By default, it yields multiple times per frame.
// It does not attempt to align with frame boundaries, since most tasks don't
// need to be frame aligned; for those that do, use requestAnimationFrame.
let frameInterval = frameYieldMs;
const continuousInputInterval = continuousYieldMs;
const maxInterval = maxYieldMs;
let startTime = -1;

let needsPaint = false;

// 判断是否中断，将主程让给浏览器
function shouldYieldToHost() {
  const timeElapsed = getCurrentTime() - startTime;
  if (timeElapsed < frameInterval) {
    // 主线程被阻塞的时间非常短；比单帧小，不用中断
    // The main thread has only been blocked for a really short amount of time;
    // smaller than a single frame. Don't yield yet.
    return false;
  }

  // 主线程被阻塞的时间不可忽略。我们可能需要让出主线程，这样浏览器就可以执行高优先级任务。
  // 主要是绘画和用户输入。如果有挂起的绘制或挂起的输入，那么我们应该让步。但如果两者都没有，
  // 那么我们可以在保持反应灵敏的同时减少让步。不管怎样，我们最终都会让步，因为可能有一个
  // 挂起的绘画没有伴随着对“requestPaint”的调用，或者其他主线程任务，比如网络事件。
  // The main thread has been blocked for a non-negligible amount of time. We
  // may want to yield control of the main thread, so the browser can perform
  // high priority tasks. The main ones are painting and user input. If there's
  // a pending paint or a pending input, then we should yield. But if there's
  // neither, then we can yield less often while remaining responsive. We'll
  // eventually yield regardless, since there could be a pending paint that
  // wasn't accompanied by a call to `requestPaint`, or other main thread tasks
  // like network events.
  if (enableIsInputPending) {
    if (needsPaint) {
      // 若存在绘制或者用户的输入操作（点击、输入、滚轮等）
      // There's a pending paint (signaled by `requestPaint`). Yield now.
      return true;
    }
    if (timeElapsed < continuousInputInterval) {
      // We haven't blocked the thread for that long. Only yield if there's a
      // pending discrete input (e.g. click). It's OK if there's pending
      // continuous input (e.g. mouseover).
      if (isInputPending !== null) {
        return isInputPending();
      }
    } else if (timeElapsed < maxInterval) {
      // Yield if there's either a pending discrete or continuous input.
      if (isInputPending !== null) {
        return isInputPending(continuousOptions);
      }
    } else {
      // 我们已经占用主程很长时间了，即使没有待输入要处理，这里可能也有其他我们不知道的工作要处理
      // 比如网络请求事件，这个时候我们要让出主进程
      // We've blocked the thread for a long time. Even if there's no pending
      // input, there may be some other scheduled work that we don't know about,
      // like a network event. Yield now.
      return true;
    }
  }

  // 若不支持 isInputPending，则超过指定时间后5ms后，让出主线程
  // `isInputPending` isn't available. Yield now.
  return true;
}

/**
 * 判断浏览器主程是否存在用户交互行为
 * https://juejin.cn/post/6996644324570054664
 */
function requestPaint() {
  if (
    enableIsInputPending &&
    navigator !== undefined &&
    navigator.scheduling !== undefined &&
    navigator.scheduling.isInputPending !== undefined
  ) {
    needsPaint = true;
  }

  // Since we yield every frame regardless, `requestPaint` has no effect.
}

// 设置时间切片的时间间隔，也可以自行设置
function forceFrameRate(fps) {
  if (fps < 0 || fps > 125) {
    // Using console['error'] to evade Babel and ESLint
    console['error'](
      'forceFrameRate takes a positive int between 0 and 125, ' +
        'forcing frame rates higher than 125 fps is not supported',
    );
    return;
  }
  if (fps > 0) {
    frameInterval = Math.floor(1000 / fps);
  } else {
    // reset the framerate
    frameInterval = frameYieldMs;
  }
}

const performWorkUntilDeadline = () => {
  // 判断`立即执行任务`是否为空
  if (scheduledHostCallback !== null) {
    const currentTime = getCurrentTime();
    // Keep track of the start time so we can measure how long the main thread
    // has been blocked.
    startTime = currentTime;
    const hasTimeRemaining = true;

    // If a scheduler task throws, exit the current browser task so the
    // error can be observed.
    //
    // Intentionally not using a try-catch, since that makes some debugging
    // techniques harder. Instead, if `scheduledHostCallback` errors, then
    // `hasMoreWork` will remain true, and we'll continue the work loop.
    let hasMoreWork = true;
    try {
      hasMoreWork = scheduledHostCallback(hasTimeRemaining, currentTime);
    } finally {
      if (hasMoreWork) {
        // If there's more work, schedule the next message event at the end
        // of the preceding one.
        schedulePerformWorkUntilDeadline();
      } else {
        isMessageLoopRunning = false;
        scheduledHostCallback = null;
      }
    }
  } else {
    isMessageLoopRunning = false;
  }
  // Yielding to the browser will give it a chance to paint, so we can
  // reset this.
  needsPaint = false;
};

/**
 * 启动下一个周期的方法
 * 1. 优先使用setImmediate
 * 2. 使用MessgeChannel
 * 3. setTimeout兜底
 */
let schedulePerformWorkUntilDeadline;
if (typeof localSetImmediate === 'function') {
  // Node.js and old IE.
  // There's a few reasons for why we prefer setImmediate.
  //
  // Unlike MessageChannel, it doesn't prevent a Node.js process from exiting.
  // (Even though this is a DOM fork of the Scheduler, you could get here
  // with a mix of Node.js 15+, which has a MessageChannel, and jsdom.)
  // https://github.com/facebook/react/issues/20756
  //
  // But also, it runs earlier which is the semantic we want.
  // If other browsers ever implement it, it's better to use it.
  // Although both of these would be inferior to native scheduling.
  schedulePerformWorkUntilDeadline = () => {
    localSetImmediate(performWorkUntilDeadline);
  };
} else if (typeof MessageChannel !== 'undefined') {
  // DOM and Worker environments.
  // We prefer MessageChannel because of the 4ms setTimeout clamping.
  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;
  schedulePerformWorkUntilDeadline = () => {
    port.postMessage(null);
  };
} else {
  // We should only fallback here in non-browser environments.
  schedulePerformWorkUntilDeadline = () => {
    localSetTimeout(performWorkUntilDeadline, 0);
  };
}

// 在重绘完成后根据线程空闲程度与任务超时时间，在特定的时间执行任务
// 若有立即要执行的任务，则直接启动下一个时间片的调度
function requestHostCallback(callback) {
  scheduledHostCallback = callback;

  // 若
  if (!isMessageLoopRunning) {
    isMessageLoopRunning = true;

    // 若有立即要执行的任务，则直接启动下一个时间片的调度
    schedulePerformWorkUntilDeadline();
  }
}

// 若立即执行任务的队列taskQueue为空，而延迟执行队列中有数据，
// 则这时我们没必要马上启动下一个时间切片来进行调度，毕竟也没那么紧急
// 这里在一定时间后启动即可
function requestHostTimeout(callback, ms) {
  taskTimeoutID = localSetTimeout(() => {
    callback(getCurrentTime());
  }, ms);
}

function cancelHostTimeout() {
  localClearTimeout(taskTimeoutID);
  taskTimeoutID = -1;
}

const unstable_requestPaint = requestPaint;

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  LowPriority as unstable_LowPriority,
  unstable_runWithPriority,
  unstable_next,
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_wrapCallback,
  unstable_getCurrentPriorityLevel,
  shouldYieldToHost as unstable_shouldYield,
  unstable_requestPaint,
  unstable_continueExecution,
  unstable_pauseExecution,
  unstable_getFirstCallbackNode,
  getCurrentTime as unstable_now,
  forceFrameRate as unstable_forceFrameRate,
};

export const unstable_Profiling = enableProfiling
  ? {
      startLoggingProfilingEvents,
      stopLoggingProfilingEvents,
    }
  : null;

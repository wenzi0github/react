# React源码解析之之前的优先级调度

从React17开始，使用Lane模型来判断优先级。这之前，是用expirationTime来判断的。

https://juejin.cn/post/7008802041602506765

## 2. 之前的优先级调度

如果您想了解下之前的优先级判定，可以继续阅读当前内容；若不想了解的，直接跳过即可，毕竟这种优先级调度算法已经被上面的lane模型替代。

整个流程的入口函数为[unstable_scheduleCallback()](https://github.com/wenzi0github/react/blob/4f9e1f958c83f84993deeb4c6b9c24f3ade96178/packages/scheduler/src/forks/Scheduler.js#L394)

### 2.1 任务的属性

这里有两个队列存放不同的任务：

```javascript
var taskQueue = []; // 存放及时任务的队列
var timerQueue = []; // 存放延时任务，即 `startTime > currentTime`的任务
```

我们再来看下任务的属性：

```javascript
var newTask = {
  id: taskIdCounter++, // 任务节点的序号，创建任务时通过taskIdCounter 自增 1
  callback, // 	任务函数 执行内容
  priorityLevel, // 任务的优先级。优先级按 ImmediatePriority、UserBlockingPriority、NormalPriority、LowPriority、IdlePriority 顺序依次越低
  startTime, // 时间戳，任务预期执行时间，默认为当前时间，即同步任务。可通过 options.delay 设为异步延时任务
  expirationTime, // 过期时间，scheduler 基于该值进行异步任务的调度。通过 options.timeout 设定或 priorityLevel 计算 timeout 值后，timeout 与 startTime 相加称为 expirationTime
  sortIndex: -1, // 默认值为 -1。优先级排序使用，对于延时执行的任务，该值将赋为 startTime
};
```

若这个任务的开始时间 startTime 大于当前时间 currentTime，这说明这是一个延迟执行的任务，即把sortIndex设置为startTime，然后存放到timerQueue的队列中，sortIndex属性用于在timerQueue中进行优先级排序，数值越小，表示越快要到执行时间了，优先级就越高，若sortIndex一样，则id小的优先级高（即先创建的任务更靠前执行）。

若这个任务的开始时间 startTime 小于等于当前时间 currentTime，说明是一个立即执行的任务，sortIndex为该任务的过期时间，把这个任务放到taskQueue的队列中，进行优先级的排序。优先级算法为sortIndex小的更靠前，说明马上到或已经到过期时间了，这个任务马上就被饿死了，需要更高优先级执行，若过期时间相同的，则id小的优先级更高（即先创建的任务更靠前执行）。

那么这个过期时间是怎么来的，React给任务分配了5个优先级，每个优先级对应不同的过期时间，优先级越高，过期时间越短，说明越需要优先执行：

```javascript
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
```

### 2.2 任务的调度

在两个队列 taskQueue和 timerQueue中，我们永远都是只执行 taskQueue 队列中的任务，只不过是每执行一个任务，或者有更高优先级任务进来时，都会对这两个队列中的任务重新进行调度。若 timerQueue 队列中有可以立即执行的任务了，就将其放到 taskQueue 的队列中，并对 taskQueue 队列中的任务重新调整优先级。



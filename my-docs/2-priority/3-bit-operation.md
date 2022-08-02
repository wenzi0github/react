# React18 源码解析之 lanes 模型中的位运算

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

在 lanes 模型中，我们可以通过各种的位运算，实现不同 lane 的组合，这里我们来了解下 lanes 模型中涉及到的几种。

## 1. 位运算的基本使用

位运算主要包含了按位与、按位或、异或、取反、左移、右移等操作。

### 1.1 左移的操作

在 lanes 模型，有很多对 1 的左移操作，如：

```javascript
const lane = 1 << index; // index为lanes中某个1的位置，从右往左，从0开始数的位置
```

这段的作用是什么呢？~~刚开始我想反了，以为是 index 左移 1 位。~~ 其实是数字 1 左移 index 位，那么得到的是：

```javascript
const lane = 1 << index; // index为5，1<<5，1左移5位后得到的是 0b0100000
```

即可以得到 lanes 中 index 位置的 lane 模型，这个 lane 模型只有 index 位置是 1，方便后续在 lanes 中对 lane 进行位运算操作。

### 1.2 按位与的操作

按位与 &，是同一个位置上都为 1 时，结果才会为 1。按位与的操作，通常是用来筛选出某些 lanes 模型的，即会收窄 lanes 模型中的数据。如：

```javascript
const nonIdlePendingLanes = pendingLanes & NonIdleLanes;
```

NonIdleLanes 表示未闲置任务的 lanes，pendingLanes & NonIdleLanes，即 pendingLanes 模型中，与 NonIdleLanes 模型重合的数据，都是 NonIdleLanes 范围内的，那就可以筛选出未闲置的任务。

还有，就是用来判断两个 lanes 的包含关系了，具体比较什么，还得看跟什么进行对比。

如下面的这段代码，NoLanes 的值为 0，若按位与操作后的结果不为 0，则说明 lanes 中至少了包含了一个 NonIdleLanes 类型的任务：

```javascript
/**
 * 判断lanes中是否有未闲置的任务
 * @param lanes
 * @returns {boolean}
 */
export function includesNonIdleWork(lanes: Lanes) {
  return (lanes & NonIdleLanes) !== NoLanes;
}
```

再如下面的这段代码，我们先不管 RetryLanes 的数值和含义：

```javascript
/**
 * 判断lanes中是否只包含重试任务
 * @param lanes
 * @returns {boolean}
 */
export function includesOnlyRetries(lanes: Lanes) {
  return (lanes & RetryLanes) === lanes;
}
```

lanes 与它按位与操作后，再跟 lanes 本身进行判断，若还是相等，说明 lanes 要么为 NoLanes（0 与任何数按位与都是 0）， 要么只包含了 RetryLanes 中几个或者全部的任务。举个栗子，若 RetryLanes 的值为 0b01100，那 lanes 对应的二进制中的 1，如果有的话，只能出现在 RetryLanes 中 1 的位置。提炼一下：lanes 中 1 的位置只能是 RetryLanes 的子集。

```javascript
// 假设 RetryLanes = 0b01100
0b01000 & RetryLanes; // 0b01000, true
0b00100 & RetryLanes; // 0b00100, true
0b01100 & RetryLanes; // 0b01100, true
0b00000 & RetryLanes; // 0b00000, true

0b01010 & RetryLanes; // 0b01000, false
```

但若按位与操作后的比较对象换了，就成另一个含义了。如这段代码：

```javascript
export function isSubsetOfLanes(set: Lanes, subset: Lanes | Lane) {
  return (set & subset) === subset;
}
```

函数 isSubsetOfLanes() 与上面的 函数 includesOnlyRetries() 区别在于，比较对象不一样。这里是按位与操作后，与后一个对象进行比较。若相等的话，则说明 set 完全包含了 subset，并且 set 其他位置可能还有 1。即 set 是 subset 的超集。

### 1.3 按位或的操作

按位或的操作，是将不同的优先级组合到一起。若组合之前就已经有这个优先级了，按位或操作时，也完全没有影响。

如：

```javascript
root.pendingLanes |= updateLane; // 即 root.pendingLanes = root.pendingLanes | updateLane
```

在 root.pendingLanes 原有基础上，再合并其他的 lane 操作。

## 2. 多种位运算的组合

lanes 模型在多种位运算的组合下，呈现了更强大的威力。

### 2.1 排除某个 lanes

涉及到的运算符是 按位与 和 取反 操作。如

```javascript
// 从 nonIdlePendingLanes 中排除 suspendedLanes
const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes;
```

我们来拆解这个操作。取反操作的优先级比按位与高，先执行取反操作，然后再按位与操作。对 suspendedLanes 取反操作后的赛道，还能通过的，必然都不是 suspendedLanes 里的任务了。

### 2.2 获取当前 lanes 中的最高优先级的任务

最高优先级的任务，就是二进制中最右边的那个 1。这里涉及到的运算符是 按位与 和 负号，操作上是 lanes 与自己的负数进行按位与操作：

```javascript
/**
 * 获取lanes中最高优先级的那个数，即最右边的那个1
 * 在位运算中，若有负数，则使用该负数的补码参与运算，
 * 位运算的文档：https://www.cnblogs.com/CoutCodes/p/12557649.html
 * 如lanes = 5 = 101 源码
 * -lanes = -5 = 011 补码
 * lanes & -lanes = 101 & 011 = 1
 * 即最右边的1代表的那个数字
 * @param lanes
 * @returns {number}
 */
export function getHighestPriorityLane(lanes: Lanes): Lane {
  return lanes & -lanes;
}
```

我们刚才在注释里用了一个 5（0b101）的例子，再看一个例子。若 lanes 为 12（0b1100）:

1. lanes 为 12，二进制为 0b1100；
2. -lanes 为 -12，反码为 0b0011，补码（反码加 1 即为补码）为 0b0100（0b0011 + 1）；
3. lanes & -lanes，即 0b1100 & 0b0100，结果为 0b0100；

最后的结果为 0b0100，转为十进制的话就是 4。我们通过上面的函数计算下：

```javascript
getHighestPriorityLane(12); // 4
getHighestPriorityLane(0b1100); // 4
```

### 2.3 对 lanes 的循环

React 源码有不少对 lanes 的循环操作，即操作 lanes 上每一个 1，如在函数 markRootSuspended() 中：

```javascript
let lanes = suspendedLanes;
while (lanes > 0) {
  const index = pickArbitraryLaneIndex(lanes);
  const lane = 1 << index;

  // 将该位置的过期时间重置为初始值，即-1
  expirationTimes[index] = NoTimestamp;

  lanes &= ~lane;
}
```

上面的循环 while 中的操作很少，就是将 lanes 模型每个 1 的位置的过期重置为初始值。

1. while 循环的终止条件是 lanes 为 0，那必然有对 lanes 的操作，就是： lanes &= ~lane；
2. 每次取出一个赛道，然后对其进行操作；
3. 最后在 lanes 中删除该赛道，进入下一个循环，直到所有的赛道都处理完毕；

## 4. 总结

熟悉这些 lanes 的位运算后，后续通过对各种优先级的组合、筛选、过滤等操作，来调度任务时，就会熟悉很多。

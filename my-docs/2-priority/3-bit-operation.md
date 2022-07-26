# lanes模型中的位运算

在lanes模型中，我们可以通过各种的位运算，实现不同lane的组合，这里我们来了解下lanes模型中涉及到的几种。

## 1. 位运算的基本使用

位运算主要包含了按位与、按位或、异或、取反、左移、右移等操作。

### 1.1 1的左移

在lanes模型，有很多对1的左移操作，如：

```javascript
const lane = 1 << index; // index为lanes中最左边1的位置，从右往左，从0开始数的位置
```

pickArbitraryLaneIndex()方法是获取lanes模型中，最左边1的位置（从右往左数，0开始计数）。如lanes的值为`00110110`，这里我们暂时忽略其他的前置0，通过这个函数得到的结果就是5。

那么这段的作用是什么呢？~~刚开始我想反了，以为是index左移1位。~~其实是数字1左移index位，那么得到的是：

```javascript
const lane = 1 << index; // index为5，1<<5，1左移5位后得到的是100000
```

即这个最左位置1的单独的lane模型。

### 1.2 按位与的操作

按位与的操作，通常是用来筛选出某些lanes模型的，如：

```javascript
const nonIdlePendingLanes = pendingLanes & NonIdleLanes; // NonIdleLanes表示未闲置任务的lanes
```

上面的代码表示，从 pendingLanes 模型中，筛选出未闲置的任务。

再比如下面的代码，是用来判断mode是否是并发模式，若按位与的结果为NoMode，表示mode跟ConcurrentMode没有匹配上，说明mode是同步模式：

```javascript
(mode & ConcurrentMode) === NoMode
```

### 1.3 按位或的操作

按位或的操作使用的比较多，因为lanes模型本来就是想通过二进制的这种不同位置，来表示不同优先级或不同操作的。那不同的lanes组合到一起，说明这个fiber节点或者其他结构有着多种的操作。

如：

```javascript
root.pendingLanes |= updateLane;
```

在root.pendingLanes原有基础上，再合并其他的lane操作。

## 2. 多种位运算的组合

lanes模型在多种位运算的组合下，呈现了更强大的威力。

### 2.1 排除某个lanes

涉及到的运算符是 按位与 和 取反 操作。如

```javascript
// 从 nonIdlePendingLanes 中排除 suspendedLanes
const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes;
```

我们来拆解这个操作。

### 2.2 获取当前lanes中的最高优先级的任务

最高优先级的任务，就是二进制中最右边的那个1。这里涉及到的运算符是 按位与 和 负号，操作上是lanes与自己的负数进行按位与操作：

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

### 2.3 对lanes的循环

React源码有不少对lanes的循环操作，即操作lanes上每一个1，如在函数 markRootSuspended() 中：

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

上面的循环while中的操作很少，就是将lanes模型每个1的位置的过期重置为初始值。

1. while循环的终止条件是lanes为0，那必然有对lanes的操作，就是： lanes &= ~lane；
2. 每次取出一个赛道，然后对其进行操作；
3. 最后在lanes中删除该赛道，进入下一个循环，直到所有的赛道都处理完毕；




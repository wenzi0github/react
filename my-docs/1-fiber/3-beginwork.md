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



### 3.2 FunctionComponent

### 3.3 ClassComponent

### 3.4 HostComponent

## 4. reconcileChildren






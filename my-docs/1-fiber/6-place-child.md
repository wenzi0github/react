# React18 源码解析之 placeChild 的执行

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

在 React fiber 对比的过程中，有用到 placeChild() 函数，这个函数是做什么的呢？

此方法是一种顺序优化手段，lastPlacedIndex 一直在更新，初始为 0，表示访问过的节点在旧集合中最右的位置（即最大的位置）。如果新集合中当前访问的节点比 lastPlacedIndex 大，说明当前访问节点在旧集合中就比上一个节点位置靠后，则该节点不会影响其他节点的位置，因此不用添加到差异队列中，即不执行移动操作。只有当访问的节点比 lastPlacedIndex 小时，才需要进行移动操作。

lastPlaceIndex初始时为0，表示当前复用到的旧fiber的最大索引。比如第一个新fiber节点复用的是最后一个旧fiber节点，那lastPlaceIndex就是最后那个旧fiber节点的索引值。

## 1. 样例1

```javascript
return !flag ? [
    <li key="0">0</li>,
    <li key="1">1</li>,
    <li key="2">2</li>,
  ] : ([
    <li key="1">0</li>,
    <li key="2">2</li>,
    <li key="0">2</li>,
  ])
```

![](https://pic4.zhimg.com/80/v2-c0df110682cad8be80cb028154ee3743_1440w.jpg)

过程描述：

1. lastPlaceIndex 初始时为0；
2. 新节点 key1，Map 集合中存在 key1 则取出复用，key1 老节点的 oldIndex 为 1，不满足 oldIndex < lastPlacedIndex，返回 oldIndex，并且赋值给 lastPlacedIndex 值更新为 1。 
3. 新节点 key2，Map 集合中存在 key2 则取出复用，key2 老节点的 oldIndex 为 2，不满足 oldIndex < lastPlacedIndex，返回 oldIndex，并且赋值给 lastPlacedIndex 值更新为 2。 
4. 新节点 key0，Map 集合中存在 key0 则取出复用，key0 老节点的 oldIndex 为 0，满足 oldIndex < lastPlacedIndex，则将 key0 标记为插入，返回 lastPlacedIndex。

## 2. 样例2

```javascript
return !flag ? [
    <li key="0">0</li>,
    <li key="1">1</li>,
    <li key="2">2</li>,
    <li key="3">2</li>,
  ] : ([
    <li key="1">1</li>,
    <li key="0">0</li>,
    <li key="3">3</li>,
    <li key="2">2</li>,
  ])
```

![](https://pic3.zhimg.com/80/v2-cda1968d414cdf3e6cc2ae7abe3206b6_1440w.jpg)

过程描述：

1. lastPlaceIndex 初始时为0； 
2. 新节点 key1，Map 集合中存在 key1 则取出复用，key1 老节点的 oldIndex 为 1，不满足 oldIndex < lastPlacedIndex，返回 oldIndex，并且赋值给 lastPlacedIndex 值更新为 1。 
3. 新节点 key0，Map 集合中存在 key0 则取出复用，key0 老节点的 oldIndex 为 0，满足 oldIndex < lastPlacedIndex，则将 key0 标记为插入，返回 lastPlacedIndex。 
4. 新节点 key3，Map 集合中存在 key3 则取出复用，key3 老节点的 oldIndex 为 3，不满足 oldIndex < lastPlacedIndex，返回 oldIndex，并且赋值给 lastPlacedIndex 值更新为 3。 
5. 新节点 key2，Map 集合中存在 key2 则取出复用，key2 老节点的 oldIndex 为 2，满足 oldIndex < lastPlacedIndex，则将 key2 标记为插入，返回 lastPlacedIndex。

## 3. 样例3：

```javascript
return !flag ? [
    <li key="0">0</li>,
    <li key="1">1</li>,
    <li key="2">2</li>,
    <li key="3">2</li>,
  ] : ([
    <li key="1">1</li>,
    <li key="5">5</li>,
    <li key="3">3</li>,
    <li key="0">0</li>,
  ])
```

![](https://pic3.zhimg.com/80/v2-e83852cc0f30ec83fd4796a8fcdabee2_1440w.jpg)

过程描述：

1. lastPlaceIndex 初始时为0； 
2. 新节点 key1，Map 集合中存在 key1 则取出复用，key1 老节点的 oldIndex 为 1，不满足 oldIndex < lastPlacedIndex，返回 oldIndex，并且赋值给 lastPlacedIndex 值更新为 1。
3. 新节点 key5，Map 集合中不存在 key5 新建节点，不满足 current !== null，则将 key5 标记为插入，返回 lastPlacedIndex。
4. 新节点 key3，Map 集合中存在 key3 则取出复用，key3 老节点的 oldIndex 为 3，不满足 oldIndex < lastPlacedIndex，返回 oldIndex，并且赋值给 lastPlacedIndex 值更新为 3。
5. 新节点 key0，Map 集合中存在 key0 则取出复用，key0 老节点的 oldIndex 为 0，满足 oldIndex < lastPlacedIndex，则将 key0 标记为插入，返回 lastPlacedIndex。
6. 剩余节点 key2 通过 existingChildren 遍历删除，被复用过的节点因为从 map 集合中已经移除了，所以这里的删除只是为被复用的。

## 4. 样例4（性能差的一种情况）

```javascript
return !flag ? [
    <li key="0">0</li>,
    <li key="1">1</li>,
    <li key="2">2</li>,
  ] : ([
    <li key="2">2</li>,
    <li key="0">0</li>,
    <li key="1">1</li>,
  ])
```

![](https://pic2.zhimg.com/80/v2-0c7c43851b4c0faee3c90d75a7e8117d_1440w.jpg)

过程同上，但是这种操作会使得顺序优化算法失去效果，除了最后一个节点没有 effect，其他节点都会被执行插入操作，所以尽量避免将最后一个节点更新到第一个节点的位置操作。

参考文章：

* [React Diff](https://zhuanlan.zhihu.com/p/250604939)

# 如何将虚拟dom转为fiber结构

从React17开始，

```shell
# ReactFiberBeginWork.old.js
beginWork -> updateFunctionComponent -> {
  nextChildren = renderWithHooks(), # 根据current和current.memoizedState判断当前是初始化，还是更新
  reconcileChildren, # 调和？
}
```

这里会执行到 reconcileChildren() 方法，然后根据current是否为null，来决定是初始化fiber树，还是更新fiber树，即要执行mountChildFibers()还是 reconcileChildFibers()。

两者的区别在于要追踪副作用，比如一些hook的更新等等。初始fiber树时，不用跟之前的fiber树对比，只需要初始化下hook，用初始化的hook值来构建fiber树即可。而更新fiber树时，新workInProgress需要与目前的current树进行对比，找出需要更新的fiber节点，这里调用 reconcileChildFibers() 。

```javascript
export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false); // 是否要追踪副作用，初始化时不用追踪
```

执行`ChildReconciler()`得到的是 reconcileChildFibers() 方法，这里面会判断每个节点的类型，然后分别调用不同的方法创建该节点

# 各个目录的作用

```shell
|- react
  |- aa
|- react-dom
  |- client/ReactDOMRoot.js
    |- creatRoot() # 创建根节点
    |- render() # 渲染jsx
|- react-reconciler
  |- ReactFiberReconciler.old.js
    |- createContainer() # 生成FiberNodeRoot和rootFiber两个节点
  |- ReactFiberRoot.old.js
    |- createFiberRoot()
      |- new FiberRootNode() # 创建 fiberNodeRoot节点
      |- createHostRootFiber() # 创建fiber树的根节点
      |- initializeUpdateQueue()
|- scheduler
```

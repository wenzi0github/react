# React18 源码解析之fiber任务的执行

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

fiber 节点上可能会存在一些在本次调度时需要执行的任务，而且还可能存在上次调度时，优先级不够挪到当前调度的任务。

1. 这些任务如何执行呢？
2. 如何将当前任务和上次的任务进行拼接？
3. 如何筛查出当前调度中优先级低的任务？

这些操作全都是函数 processUpdateQueue() 完成的，源码的位置：[packages/react-reconciler/src/ReactUpdateQueue.old.js](https://github.com/wenzi0github/react/blob/d7c33be1d8edeac249a9191061f7badcd43d4c8a/packages/react-reconciler/src/ReactUpdateQueue.old.js#L524)。我们在之前的 [React18 源码解析之 beginWork 的操作](https://www.xiabingbao.com) 中稍微涉及到了点 processUpdateQueue() 的内容，但并没有展开讲解，这里我们详细说明下。

## 1. 几个属性的含义

我们在讲解任务的执行之前，先明确几个属性的含义，方便我们理解。

```javascript
const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);


```

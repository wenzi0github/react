# React18 源码解析之fiber任务的执行

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

fiber节点上可能会存在一些任务在本次渲染时执行，而

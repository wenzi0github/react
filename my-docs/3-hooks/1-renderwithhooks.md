# React18 源码解析之 hooks 的挂载

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

在之前讲解函数 beginWork() 时，稍微说了下 renderWithHooks() 的流程，不过当时只说了中间会执行`Component(props)`的操作，并没有讲解函数组件中的hooks是如何挂载的，这里我们详细讲解下。



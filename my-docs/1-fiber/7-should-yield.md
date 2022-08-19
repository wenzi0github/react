# React18 源码解析之 Fiber 如何实现更新过程可控

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

更新过程的可控主要体现在下面几个方面：

* 任务拆分
* 任务挂起、恢复、终止
* 任务具备优先级

[https://segmentfault.com/a/1190000039682751](https://segmentfault.com/a/1190000039682751)


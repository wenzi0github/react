# React18 源码解析之 render()入口方法

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

React中有三套优先级机制：

1. React事件优先级
2. Lane优先级
3. Scheduler优先级

React 为什么使用 Lane 技术方案: [https://juejin.cn/post/6951206227418284063](https://juejin.cn/post/6951206227418284063)

React源码解析之优先级Lane模型上: [https://juejin.cn/post/7008802041602506765](https://juejin.cn/post/7008802041602506765)

https://github.com/zepang/web-clipper-articles/issues/27

1. 创建fiber时，每一个 fiber 创建的时候其 lanes，childLanes 字段都被初始化为NoLanes；
2. 创建update时，
3. 更新过程中对fiber上各个字段的更新

# React18 源码解析之 useState 的原理

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

这个往后放一放，要讲解 useState()，得先了解 useReducer()。

大纲：

1. useState()的用法；注意，setState()不会自动合并参数；
2. 若写了多次的setState()，内部怎么决定哪些可以执行，哪些不执行，是否每一次的调用，都要重新执行一次函数组件？
3. 源码
4. 不同方式的传参，有什么区别？
5. 常见的几个问题
   1. useState 是同步的还是异步的？有没有办法可以同步执行？
   2. setInterval() + useState() 产生什么现象，为什么会这样？
   3. 同时执行多次setState(count + 1)和 setState(count => count +1)，结果是否一样，原因是什么？
   4. 若useState()是基于props初始化的，那props发生变化时，对应的useState()会重新执行吗？

接下来我们会从源码角度，讲解几个常用的 hooks，本篇文章我们讲解下`useState()`。

我们先来 useState() 的用法，我们知道 setState()的参数，既可以传入普通数据，也可以传入 callback：

```javascript
import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  const handleClickByVal = () => {
    setCount(count + 1);
  };
  const handleClickByCallback = () => {
    setCount(count => count + 1);
  };

  return (
    <div className="App">
      <p>{count}</p>
      <p>
        <button onClick={handleClickByVal}>add by val</button>
      </p>
      <p>
        <button onClick={handleClickByCallback}>add by callback</button>
      </p>
    </div>
  );
}
```

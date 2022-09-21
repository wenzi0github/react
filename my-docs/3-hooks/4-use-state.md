# React18 源码解析之 useState 的原理

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

这个往后放一放，要讲解 useState()，得先了解 useReducer()。

大纲：

1. useState()的用法；
2. 源码
3. 不同方式的传参，有什么区别？
4. 常见的几个问题
   1. useState 是同步的还是异步的？有没有办法可以同步执行？
   2. setInterval() + useState() 产生什么现象，为什么会这样？

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

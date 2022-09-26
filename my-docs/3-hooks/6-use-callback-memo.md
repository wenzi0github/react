# React18 源码解析之 useCallback 和 useMemo

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

React 中有两个 hooks 可以用来缓存函数和变量，提高性能，减少资源浪费。那什么时候会用到 useCallback 和 useMemo 呢？

## 1. 使用场景

useCallback 和 useMemo 的使用场景稍微有点不一样，我们分开来说明。

### 1.1 useCallback

我们知道 useCallback 可以缓存函数体，在依赖项没有变化时，前后两次渲染时，使用的函数体是一样的。

很多同学觉得用 useCallback 包括函数，可以减少函数创建的开销 和 gc。但实际上，现在 js 在执行一些闭包或其他内联函数时，运行非常快，性能非常快。若不恰当的使用 useCallback 包括一些函数，可能会适得其反，因为 React 内部还需要创建额外的空间来缓存这些函数体，并且还要监听依赖项的变化。

如下面的这种方式其实就很没有必要：

```javascript
function App() {
  // 没必要
  const handleClick = useCallback(() => {
    console.log(Date.now());
  }, []);

  return <button onClick={handleClick}>click me</button>;
}
```

那 useCallback 在什么场景下会用到呢？

- 函数作为其他 hook 的依赖项时（如在 useEffect()中）；
- 函数作为 React.memo()（或 shouldComponentUpdate ）中的组件的 props；

#### 1.1.1 作为其他 hook 的依赖项

#### 1.1.2 作为 React.memo()等组件的 props；

### 1.2 useMemo

## 2. 源码

### 2.1 useCallback 的源码

### 2.2 useMemo 的源码

参考链接：

- [Are Hooks slow because of creating functions in render?](https://reactjs.org/docs/hooks-faq.html#are-hooks-slow-because-of-creating-functions-in-render)
- https://segmentfault.com/a/1190000022651514
- https://zhuanlan.zhihu.com/p/56975681

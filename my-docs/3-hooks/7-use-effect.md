# React18 源码解析之 useEffect 的原理

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

1. 与 setTimeout, setInterval 组件的现象，为什么会这样，如何避免？
2. 执行时机是什么时候？在 commit 之后，因此可以在 useEffect()中拿到真实的 dom 元素，return 是什么时候执行的？若想在渲染前执行，有什么办法？
3. useEffect 与 useLayoutEffect() 的区别
